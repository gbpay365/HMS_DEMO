'use strict';

const { tableExists, columnExists } = require('./hmsFinGeneralLedger');
const { ensureProcurementExtendedSchema } = require('./ensureProcurementExtendedSchema');
const { ensurePurchaseOrderSchema } = require('./ensurePurchaseOrderSchema');

async function nextPoNumber(pool, facilityId) {
  const y = new Date().getFullYear();
  const pfx = `PHA-PO-${y}-`;
  const [[row]] = await pool
    .query(
      'SELECT po_number FROM tbl_purchase_order WHERE facility_id = ? AND po_number LIKE ? ORDER BY id DESC LIMIT 1',
      [facilityId, `${pfx}%`]
    )
    .catch(() => [[null]]);
  let n = 1;
  const last = row && row.po_number ? String(row.po_number) : '';
  const m = last.match(/-(\d+)$/);
  if (m) n = parseInt(m[1], 10) + 1 || 1;
  return pfx + String(n).padStart(4, '0');
}

async function loadPoList(pool, facilityId, limit) {
  if (!(await tableExists(pool, 'tbl_purchase_order'))) return [];
  const lim = Math.max(1, Math.min(200, limit || 100));
  const [rows] = await pool.query(
    `SELECT * FROM tbl_purchase_order
     WHERE facility_id = ?
     ORDER BY created_at DESC LIMIT ${lim}`,
    [facilityId]
  );
  return rows || [];
}

async function loadPoDetail(pool, facilityId, poId) {
  if (!(await tableExists(pool, 'tbl_purchase_order'))) return null;
  await ensurePurchaseOrderSchema(pool).catch(() => {});
  await ensureProcurementExtendedSchema(pool).catch(() => {});
  const [[po]] = await pool.query(
    'SELECT * FROM tbl_purchase_order WHERE id = ? AND facility_id = ? LIMIT 1',
    [poId, facilityId]
  );
  if (!po) return null;
  let lines = [];
  if (await tableExists(pool, 'tbl_purchase_order_line')) {
    const hasLineNo = await columnExists(pool, 'tbl_purchase_order_line', 'line_no');
    const orderBy = hasLineNo ? 'COALESCE(l.line_no, l.id) ASC, l.id ASC' : 'l.id ASC';
    const [lr] = await pool.query(
      `SELECT l.*, i.name AS item_name, i.sku, i.expiry_date
       FROM tbl_purchase_order_line l
       LEFT JOIN tbl_inventory_item i ON i.id = l.inventory_item_id
       WHERE l.purchase_order_id = ?
       ORDER BY ${orderBy}`,
      [poId]
    );
    lines = lr || [];
  }
  return { po, lines };
}

module.exports = {
  nextPoNumber,
  loadPoList,
  loadPoDetail
};
