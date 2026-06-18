'use strict';

const ensureAssetManagementSchema = require('./ensureAssetManagementSchema');

async function insertAssetAudit(pool, row) {
  await ensureAssetManagementSchema(pool).catch(() => {});
  await pool.query(
    `INSERT INTO tbl_asset_audit
      (asset_id, facility_id, action, from_status, to_status, note, snapshot_json, performed_by)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      row.asset_id,
      row.facility_id,
      String(row.action || 'update').slice(0, 32),
      row.from_status != null ? String(row.from_status).slice(0, 32) : null,
      row.to_status != null ? String(row.to_status).slice(0, 32) : null,
      row.note != null ? String(row.note).slice(0, 2000) : null,
      row.snapshot_json != null ? JSON.stringify(row.snapshot_json) : null,
      row.performed_by,
    ]
  );
}

async function loadAssetAudit(pool, assetId, limit = 50) {
  const [rows] = await pool
    .query(
      `SELECT a.*, e.first_name, e.last_name
         FROM tbl_asset_audit a
         LEFT JOIN tbl_employee e ON e.id = a.performed_by
        WHERE a.asset_id = ?
        ORDER BY a.performed_at DESC, a.id DESC
        LIMIT ?`,
      [assetId, Math.max(1, Math.min(200, limit))]
    )
    .catch(() => [[]]);
  return rows || [];
}

module.exports = { insertAssetAudit, loadAssetAudit };
