'use strict';

const ensureAssetManagementSchema = require('./ensureAssetManagementSchema');

const MAINT_TYPES = ['preventive', 'corrective', 'calibration', 'inspection'];
const MAINT_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'overdue'];

function parseMaintenanceBody(body) {
  const b = body || {};
  return {
    asset_id: parseInt(b.asset_id, 10) || 0,
    maintenance_type: MAINT_TYPES.includes(String(b.maintenance_type || '').toLowerCase())
      ? String(b.maintenance_type).toLowerCase()
      : 'preventive',
    status: MAINT_STATUSES.includes(String(b.status || '').toLowerCase())
      ? String(b.status).toLowerCase()
      : 'scheduled',
    scheduled_date: String(b.scheduled_date || '').trim() || null,
    completed_at: String(b.completed_at || '').trim() || null,
    vendor_name: String(b.vendor_name || '').trim() || null,
    cost: b.cost !== '' && b.cost != null ? parseFloat(b.cost) : null,
    description: String(b.description || '').trim() || null,
    next_due_date: String(b.next_due_date || '').trim() || null,
  };
}

async function loadMaintenanceList(pool, fid, opts = {}) {
  await ensureAssetManagementSchema(pool).catch(() => {});
  const assetId = parseInt(opts.assetId, 10) || 0;
  const status = String(opts.status || '').trim();
  const params = [fid];
  let where = 'WHERE m.facility_id = ?';
  if (assetId > 0) {
    where += ' AND m.asset_id = ?';
    params.push(assetId);
  }
  if (status && MAINT_STATUSES.includes(status)) {
    where += ' AND m.status = ?';
    params.push(status);
  }
  const [rows] = await pool
    .query(
      `SELECT m.*, a.asset_tag, a.name AS asset_name
         FROM tbl_asset_maintenance m
         JOIN tbl_asset a ON a.id = m.asset_id
        ${where}
        ORDER BY COALESCE(m.scheduled_date, m.created_at) DESC, m.id DESC
        LIMIT 300`,
      params
    )
    .catch(() => [[]]);
  return rows || [];
}

async function createMaintenance(pool, fid, body, userId) {
  await ensureAssetManagementSchema(pool).catch(() => {});
  const data = parseMaintenanceBody(body);
  if (data.asset_id < 1) throw new Error('Asset is required.');
  const [[asset]] = await pool
    .query('SELECT id, status FROM tbl_asset WHERE id = ? AND facility_id = ? LIMIT 1', [
      data.asset_id,
      fid,
    ])
    .catch(() => [[null]]);
  if (!asset) throw new Error('Asset not found.');
  const [result] = await pool.query(
    `INSERT INTO tbl_asset_maintenance
      (asset_id, facility_id, maintenance_type, status, scheduled_date, completed_at,
       vendor_name, cost, description, next_due_date, performed_by, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      data.asset_id,
      fid,
      data.maintenance_type,
      data.status,
      data.scheduled_date,
      data.completed_at,
      data.vendor_name,
      data.cost,
      data.description,
      data.next_due_date,
      data.status === 'completed' ? userId : null,
      userId,
    ]
  );
  if (data.status === 'in_progress' || data.status === 'scheduled') {
    await pool
      .query("UPDATE tbl_asset SET status = 'maintenance', updated_by = ? WHERE id = ? AND facility_id = ?", [
        userId,
        data.asset_id,
        fid,
      ])
      .catch(() => {});
  }
  if (data.status === 'completed') {
    await pool
      .query("UPDATE tbl_asset SET status = 'active', updated_by = ? WHERE id = ? AND facility_id = ? AND status = 'maintenance'", [
        userId,
        data.asset_id,
        fid,
      ])
      .catch(() => {});
  }
  return result.insertId;
}

async function completeMaintenance(pool, fid, maintId, userId, body = {}) {
  const data = parseMaintenanceBody(body);
  const [[row]] = await pool
    .query('SELECT * FROM tbl_asset_maintenance WHERE id = ? AND facility_id = ? LIMIT 1', [
      maintId,
      fid,
    ])
    .catch(() => [[null]]);
  if (!row) throw new Error('Maintenance record not found.');
  await pool.query(
    `UPDATE tbl_asset_maintenance SET
       status = 'completed',
       completed_at = COALESCE(?, NOW()),
       vendor_name = COALESCE(?, vendor_name),
       cost = COALESCE(?, cost),
       description = COALESCE(?, description),
       next_due_date = COALESCE(?, next_due_date),
       performed_by = ?
     WHERE id = ? AND facility_id = ?`,
    [
      data.completed_at,
      data.vendor_name,
      data.cost,
      data.description,
      data.next_due_date,
      userId,
      maintId,
      fid,
    ]
  );
  await pool
    .query("UPDATE tbl_asset SET status = 'active', updated_by = ? WHERE id = ? AND facility_id = ?", [
      userId,
      row.asset_id,
      fid,
    ])
    .catch(() => {});
}

module.exports = {
  MAINT_TYPES,
  MAINT_STATUSES,
  loadMaintenanceList,
  createMaintenance,
  completeMaintenance,
};
