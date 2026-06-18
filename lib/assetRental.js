'use strict';

const ensureAssetManagementSchema = require('./ensureAssetManagementSchema');

const UNIT_STATUSES = ['available', 'occupied', 'maintenance', 'inactive'];
const CONTRACT_STATUSES = ['active', 'ended', 'cancelled'];

async function nextUnitCode(pool, fid) {
  const pfx = 'RU-';
  const [[row]] = await pool
    .query(
      'SELECT unit_code FROM tbl_asset_rental_unit WHERE facility_id = ? AND unit_code LIKE ? ORDER BY id DESC LIMIT 1',
      [fid, `${pfx}%`]
    )
    .catch(() => [[null]]);
  let n = 1;
  const last = row && row.unit_code ? String(row.unit_code) : '';
  const m = last.match(/-(\d+)$/);
  if (m) n = parseInt(m[1], 10) + 1 || 1;
  return pfx + String(n).padStart(4, '0');
}

async function loadRentalUnits(pool, fid) {
  await ensureAssetManagementSchema(pool).catch(() => {});
  const [rows] = await pool
    .query(
      `SELECT u.*, a.asset_tag, a.name AS asset_name,
              (SELECT COUNT(*) FROM tbl_asset_rental_contract c
                WHERE c.rental_unit_id = u.id AND c.status = 'active') AS active_contracts
         FROM tbl_asset_rental_unit u
         LEFT JOIN tbl_asset a ON a.id = u.asset_id
        WHERE u.facility_id = ?
        ORDER BY u.unit_code ASC`,
      [fid]
    )
    .catch(() => [[]]);
  return rows || [];
}

async function loadRentalContracts(pool, fid, opts = {}) {
  await ensureAssetManagementSchema(pool).catch(() => {});
  const unitId = parseInt(opts.unitId, 10) || 0;
  const status = String(opts.status || '').trim();
  const params = [fid];
  let where = 'WHERE c.facility_id = ?';
  if (unitId > 0) {
    where += ' AND c.rental_unit_id = ?';
    params.push(unitId);
  }
  if (status && CONTRACT_STATUSES.includes(status)) {
    where += ' AND c.status = ?';
    params.push(status);
  }
  const [rows] = await pool
    .query(
      `SELECT c.*, u.unit_code, u.label AS unit_label, u.location AS unit_location
         FROM tbl_asset_rental_contract c
         JOIN tbl_asset_rental_unit u ON u.id = c.rental_unit_id
        ${where}
        ORDER BY c.start_date DESC, c.id DESC
        LIMIT 200`,
      params
    )
    .catch(() => [[]]);
  return rows || [];
}

async function loadContractPayments(pool, contractId, fid) {
  const [rows] = await pool
    .query(
      `SELECT p.*, CONCAT(e.first_name, ' ', e.last_name) AS recorded_by_name
         FROM tbl_asset_rental_payment p
         LEFT JOIN tbl_employee e ON e.id = p.recorded_by
        WHERE p.contract_id = ? AND p.facility_id = ?
        ORDER BY p.paid_at DESC, p.id DESC`,
      [contractId, fid]
    )
    .catch(() => [[]]);
  return rows || [];
}

async function createRentalUnit(pool, fid, body, userId) {
  await ensureAssetManagementSchema(pool).catch(() => {});
  const label = String(body.label || '').trim();
  if (!label) throw new Error('Unit label is required.');
  const code = String(body.unit_code || '').trim() || (await nextUnitCode(pool, fid));
  const status = UNIT_STATUSES.includes(String(body.status || '').toLowerCase())
    ? String(body.status).toLowerCase()
    : 'available';
  const [result] = await pool.query(
    `INSERT INTO tbl_asset_rental_unit
      (facility_id, asset_id, unit_code, label, location, monthly_rent, status, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      fid,
      parseInt(body.asset_id, 10) || null,
      code,
      label,
      String(body.location || '').trim() || null,
      body.monthly_rent !== '' && body.monthly_rent != null ? parseFloat(body.monthly_rent) : null,
      status,
      String(body.notes || '').trim() || null,
      userId,
    ]
  );
  return { id: result.insertId, unit_code: code };
}

async function createRentalContract(pool, fid, body, userId) {
  await ensureAssetManagementSchema(pool).catch(() => {});
  const unitId = parseInt(body.rental_unit_id, 10) || 0;
  const tenant = String(body.tenant_name || '').trim();
  const startDate = String(body.start_date || '').trim();
  if (unitId < 1) throw new Error('Rental unit is required.');
  if (!tenant) throw new Error('Tenant name is required.');
  if (!startDate) throw new Error('Start date is required.');
  const [[unit]] = await pool
    .query('SELECT id, status FROM tbl_asset_rental_unit WHERE id = ? AND facility_id = ? LIMIT 1', [
      unitId,
      fid,
    ])
    .catch(() => [[null]]);
  if (!unit) throw new Error('Rental unit not found.');
  const monthly = parseFloat(body.monthly_amount);
  if (!Number.isFinite(monthly) || monthly < 0) throw new Error('Monthly amount is required.');
  const [result] = await pool.query(
    `INSERT INTO tbl_asset_rental_contract
      (facility_id, rental_unit_id, tenant_name, tenant_phone, tenant_email,
       start_date, end_date, monthly_amount, deposit_amount, status, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      fid,
      unitId,
      tenant,
      String(body.tenant_phone || '').trim() || null,
      String(body.tenant_email || '').trim() || null,
      startDate,
      String(body.end_date || '').trim() || null,
      monthly,
      body.deposit_amount !== '' && body.deposit_amount != null ? parseFloat(body.deposit_amount) : null,
      'active',
      String(body.notes || '').trim() || null,
      userId,
    ]
  );
  await pool
    .query("UPDATE tbl_asset_rental_unit SET status = 'occupied' WHERE id = ? AND facility_id = ?", [
      unitId,
      fid,
    ])
    .catch(() => {});
  return result.insertId;
}

async function recordRentalPayment(pool, fid, body, userId) {
  const contractId = parseInt(body.contract_id, 10) || 0;
  const amount = parseFloat(body.amount);
  const paidAt = String(body.paid_at || '').trim() || new Date().toISOString().slice(0, 10);
  if (contractId < 1) throw new Error('Contract is required.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount is required.');
  const [[contract]] = await pool
    .query('SELECT id FROM tbl_asset_rental_contract WHERE id = ? AND facility_id = ? LIMIT 1', [
      contractId,
      fid,
    ])
    .catch(() => [[null]]);
  if (!contract) throw new Error('Contract not found.');
  const [result] = await pool.query(
    `INSERT INTO tbl_asset_rental_payment
      (contract_id, facility_id, amount, paid_at, reference, notes, recorded_by)
     VALUES (?,?,?,?,?,?,?)`,
    [
      contractId,
      fid,
      amount,
      paidAt,
      String(body.reference || '').trim() || null,
      String(body.notes || '').trim() || null,
      userId,
    ]
  );
  return result.insertId;
}

async function endRentalContract(pool, fid, contractId, userId) {
  const [[contract]] = await pool
    .query('SELECT * FROM tbl_asset_rental_contract WHERE id = ? AND facility_id = ? LIMIT 1', [
      contractId,
      fid,
    ])
    .catch(() => [[null]]);
  if (!contract) throw new Error('Contract not found.');
  await pool.query(
    `UPDATE tbl_asset_rental_contract SET status = 'ended', end_date = COALESCE(end_date, CURDATE())
     WHERE id = ? AND facility_id = ?`,
    [contractId, fid]
  );
  const [[active]] = await pool
    .query(
      `SELECT COUNT(*) AS n FROM tbl_asset_rental_contract
        WHERE rental_unit_id = ? AND facility_id = ? AND status = 'active'`,
      [contract.rental_unit_id, fid]
    )
    .catch(() => [[{ n: 0 }]]);
  if ((parseInt(active?.n, 10) || 0) === 0) {
    await pool
      .query("UPDATE tbl_asset_rental_unit SET status = 'available' WHERE id = ? AND facility_id = ?", [
        contract.rental_unit_id,
        fid,
      ])
      .catch(() => {});
  }
}

module.exports = {
  UNIT_STATUSES,
  CONTRACT_STATUSES,
  loadRentalUnits,
  loadRentalContracts,
  loadContractPayments,
  createRentalUnit,
  createRentalContract,
  recordRentalPayment,
  endRentalContract,
};
