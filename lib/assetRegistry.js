'use strict';

const ensureAssetManagementSchema = require('./ensureAssetManagementSchema');

const ASSET_TYPES = ['equipment', 'vehicle', 'building', 'furniture', 'it', 'rental_unit', 'other'];
const ASSET_STATUSES = ['active', 'maintenance', 'retired', 'disposed'];

async function nextAssetTag(pool, fid) {
  const y = new Date().getFullYear();
  const pfx = `AST-${y}-`;
  const [[row]] = await pool
    .query(
      'SELECT asset_tag FROM tbl_asset WHERE facility_id = ? AND asset_tag LIKE ? ORDER BY id DESC LIMIT 1',
      [fid, `${pfx}%`]
    )
    .catch(() => [[null]]);
  let n = 1;
  const last = row && row.asset_tag ? String(row.asset_tag) : '';
  const m = last.match(/-(\d+)$/);
  if (m) n = parseInt(m[1], 10) + 1 || 1;
  return pfx + String(n).padStart(4, '0');
}

async function loadCategories(pool, fid) {
  await ensureAssetManagementSchema(pool).catch(() => {});
  const [rows] = await pool
    .query(
      `SELECT id, name, sort_order FROM tbl_asset_category
        WHERE facility_id = ? AND is_active = 1
        ORDER BY sort_order ASC, name ASC`,
      [fid]
    )
    .catch(() => [[]]);
  return rows || [];
}

async function loadAssetList(pool, fid, opts = {}) {
  await ensureAssetManagementSchema(pool).catch(() => {});
  const q = String(opts.q || '').trim();
  const status = String(opts.status || '').trim();
  const categoryId = parseInt(opts.categoryId, 10) || 0;
  const params = [fid];
  let where = 'WHERE a.facility_id = ?';
  if (q) {
    where +=
      ' AND (a.name LIKE ? OR a.asset_tag LIKE ? OR a.serial_number LIKE ? OR a.location LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (status && ASSET_STATUSES.includes(status)) {
    where += ' AND a.status = ?';
    params.push(status);
  }
  if (categoryId > 0) {
    where += ' AND a.category_id = ?';
    params.push(categoryId);
  }
  const [rows] = await pool
    .query(
      `SELECT a.*, c.name AS category_name,
              CONCAT(e.first_name, ' ', e.last_name) AS assigned_name
         FROM tbl_asset a
         LEFT JOIN tbl_asset_category c ON c.id = a.category_id
         LEFT JOIN tbl_employee e ON e.id = a.assigned_to
        ${where}
        ORDER BY a.updated_at DESC, a.id DESC
        LIMIT 500`,
      params
    )
    .catch(() => [[]]);
  return rows || [];
}

async function loadAssetDetail(pool, fid, assetId) {
  await ensureAssetManagementSchema(pool).catch(() => {});
  const [[row]] = await pool
    .query(
      `SELECT a.*, c.name AS category_name,
              CONCAT(e.first_name, ' ', e.last_name) AS assigned_name
         FROM tbl_asset a
         LEFT JOIN tbl_asset_category c ON c.id = a.category_id
         LEFT JOIN tbl_employee e ON e.id = a.assigned_to
        WHERE a.facility_id = ? AND a.id = ?
        LIMIT 1`,
      [fid, assetId]
    )
    .catch(() => [[null]]);
  return row || null;
}

async function loadAssetStats(pool, fid) {
  await ensureAssetManagementSchema(pool).catch(() => {});
  const [[totals]] = await pool
    .query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
         SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) AS maintenance_count,
         COALESCE(SUM(purchase_cost), 0) AS total_value
       FROM tbl_asset WHERE facility_id = ?`,
      [fid]
    )
    .catch(() => [[{ total: 0, active_count: 0, maintenance_count: 0, total_value: 0 }]]);
  const [[maint]] = await pool
    .query(
      `SELECT COUNT(*) AS due_soon
         FROM tbl_asset_maintenance
        WHERE facility_id = ? AND status IN ('scheduled','overdue')
          AND (scheduled_date IS NULL OR scheduled_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY))`,
      [fid]
    )
    .catch(() => [[{ due_soon: 0 }]]);
  const [[rentals]] = await pool
    .query(
      `SELECT
         (SELECT COUNT(*) FROM tbl_asset_rental_unit WHERE facility_id = ?) AS units,
         (SELECT COUNT(*) FROM tbl_asset_rental_contract WHERE facility_id = ? AND status = 'active') AS active_contracts`,
      [fid, fid]
    )
    .catch(() => [[{ units: 0, active_contracts: 0 }]]);
  return {
    total: parseInt(totals?.total, 10) || 0,
    active: parseInt(totals?.active_count, 10) || 0,
    inMaintenance: parseInt(totals?.maintenance_count, 10) || 0,
    totalValue: parseFloat(totals?.total_value) || 0,
    maintenanceDue: parseInt(maint?.due_soon, 10) || 0,
    rentalUnits: parseInt(rentals?.units, 10) || 0,
    activeContracts: parseInt(rentals?.active_contracts, 10) || 0,
  };
}

function parseAssetBody(body) {
  const b = body || {};
  return {
    name: String(b.name || '').trim(),
    description: String(b.description || '').trim() || null,
    category_id: parseInt(b.category_id, 10) || null,
    asset_type: ASSET_TYPES.includes(String(b.asset_type || '').toLowerCase())
      ? String(b.asset_type).toLowerCase()
      : 'equipment',
    status: ASSET_STATUSES.includes(String(b.status || '').toLowerCase())
      ? String(b.status).toLowerCase()
      : 'active',
    location: String(b.location || '').trim() || null,
    department: String(b.department || '').trim() || null,
    serial_number: String(b.serial_number || '').trim() || null,
    model: String(b.model || '').trim() || null,
    manufacturer: String(b.manufacturer || '').trim() || null,
    purchase_date: String(b.purchase_date || '').trim() || null,
    purchase_cost: b.purchase_cost !== '' && b.purchase_cost != null ? parseFloat(b.purchase_cost) : null,
    warranty_expires: String(b.warranty_expires || '').trim() || null,
    assigned_to: parseInt(b.assigned_to, 10) || null,
    notes: String(b.notes || '').trim() || null,
  };
}

async function createAsset(pool, fid, body, userId) {
  await ensureAssetManagementSchema(pool).catch(() => {});
  const data = parseAssetBody(body);
  if (!data.name) throw new Error('Asset name is required.');
  const tag = await nextAssetTag(pool, fid);
  const [result] = await pool.query(
    `INSERT INTO tbl_asset
      (facility_id, asset_tag, name, description, category_id, asset_type, status,
       location, department, serial_number, model, manufacturer,
       purchase_date, purchase_cost, warranty_expires, assigned_to, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      fid, tag, data.name, data.description, data.category_id, data.asset_type, data.status,
      data.location, data.department, data.serial_number, data.model, data.manufacturer,
      data.purchase_date, data.purchase_cost, data.warranty_expires, data.assigned_to, data.notes, userId,
    ]
  );
  return { id: result.insertId, asset_tag: tag };
}

async function updateAsset(pool, fid, assetId, body, userId) {
  const existing = await loadAssetDetail(pool, fid, assetId);
  if (!existing) throw new Error('Asset not found.');
  const data = parseAssetBody(body);
  if (!data.name) throw new Error('Asset name is required.');
  await pool.query(
    `UPDATE tbl_asset SET
       name = ?, description = ?, category_id = ?, asset_type = ?, status = ?,
       location = ?, department = ?, serial_number = ?, model = ?, manufacturer = ?,
       purchase_date = ?, purchase_cost = ?, warranty_expires = ?, assigned_to = ?, notes = ?,
       updated_by = ?
     WHERE id = ? AND facility_id = ?`,
    [
      data.name, data.description, data.category_id, data.asset_type, data.status,
      data.location, data.department, data.serial_number, data.model, data.manufacturer,
      data.purchase_date, data.purchase_cost, data.warranty_expires, data.assigned_to, data.notes,
      userId, assetId, fid,
    ]
  );
  return { from_status: existing.status, to_status: data.status };
}

async function loadEmployees(pool) {
  const [rows] = await pool
    .query(
      `SELECT id, first_name, last_name, department
         FROM tbl_employee
        WHERE status = 1
        ORDER BY first_name ASC, last_name ASC
        LIMIT 500`
    )
    .catch(() => [[]]);
  return rows || [];
}

module.exports = {
  ASSET_TYPES,
  ASSET_STATUSES,
  nextAssetTag,
  loadCategories,
  loadAssetList,
  loadAssetDetail,
  loadAssetStats,
  createAsset,
  updateAsset,
  loadEmployees,
};
