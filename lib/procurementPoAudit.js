'use strict';

const { ensureProcurementExtendedSchema } = require('./ensureProcurementExtendedSchema');

async function insertPoAudit(pool, row) {
  await ensureProcurementExtendedSchema(pool).catch(() => {});
  await pool.query(
    `INSERT INTO tbl_procurement_po_audit
      (purchase_order_id, facility_id, action, from_status, to_status, note, snapshot_json, performed_by)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      row.purchase_order_id,
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

async function loadPoAudit(pool, poId, limit = 50) {
  const [rows] = await pool
    .query(
      `SELECT a.*, u.username AS performed_by_name
         FROM tbl_procurement_po_audit a
         LEFT JOIN tbl_user u ON u.id = a.performed_by
        WHERE a.purchase_order_id = ?
        ORDER BY a.performed_at DESC, a.id DESC
        LIMIT ?`,
      [poId, Math.max(1, Math.min(200, limit))]
    )
    .catch(() => [[]]);
  return rows || [];
}

function poSnapshot(detail) {
  if (!detail) return null;
  return {
    po: {
      id: detail.po.id,
      po_number: detail.po.po_number,
      status: detail.po.status,
      total_amount: detail.po.total_amount,
      summary_description: detail.po.summary_description,
      po_mode: detail.po.po_mode,
    },
    lines: (detail.lines || []).map((l) => ({
      id: l.id,
      description: l.description,
      quantity: l.quantity,
      uom: l.uom,
      unit_price: l.unit_price,
      inventory_item_id: l.inventory_item_id,
    })),
  };
}

module.exports = { insertPoAudit, loadPoAudit, poSnapshot };
