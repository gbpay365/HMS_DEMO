'use strict';

const { tableExists, columnExists } = require('./hmsFinGeneralLedger');
const { ensureProcurementExtendedSchema } = require('./ensureProcurementExtendedSchema');
const { ensurePurchaseOrderSchema } = require('./ensurePurchaseOrderSchema');

async function nextProcPoNumber(pool, facilityId) {
  const y = new Date().getFullYear();
  const pfx = `PO-${y}-`;
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

async function loadPoDetail(pool, facilityId, poId) {
  if (!(await tableExists(pool, 'tbl_purchase_order'))) return null;
  await ensurePurchaseOrderSchema(pool).catch(() => {});
  await ensureProcurementExtendedSchema(pool).catch(() => {});
  const [[po]] = await pool.query(
    `SELECT po.*, v.name AS vendor_name, v.email AS vendor_email, v.phone AS vendor_phone, v.address AS vendor_address
       FROM tbl_purchase_order po
       LEFT JOIN tbl_procurement_vendor v ON v.id = po.vendor_id
      WHERE po.id = ? AND po.facility_id = ? LIMIT 1`,
    [poId, facilityId]
  );
  if (!po) return null;
  let lines = [];
  if (await tableExists(pool, 'tbl_purchase_order_line')) {
    const hasLineNo = await columnExists(pool, 'tbl_purchase_order_line', 'line_no');
    const orderBy = hasLineNo ? 'COALESCE(l.line_no, l.id) ASC, l.id ASC' : 'l.id ASC';
    const [lr] = await pool.query(
      `SELECT l.*, i.name AS item_name, i.sku
         FROM tbl_purchase_order_line l
         LEFT JOIN tbl_inventory_item i ON i.id = l.inventory_item_id
        WHERE l.purchase_order_id = ?
        ORDER BY ${orderBy}`,
      [poId]
    );
    lines = lr || [];
  }
  let attachments = [];
  if (await tableExists(pool, 'tbl_procurement_po_attachment')) {
    const [ar] = await pool.query(
      'SELECT * FROM tbl_procurement_po_attachment WHERE purchase_order_id = ? ORDER BY uploaded_at DESC, id DESC',
      [poId]
    );
    attachments = ar || [];
  }
  return { po, lines, attachments };
}

async function replacePoLines(pool, poId, lines) {
  await ensureProcurementExtendedSchema(pool).catch(() => {});
  const hasUom = await columnExists(pool, 'tbl_purchase_order_line', 'uom');
  const hasLineNo = await columnExists(pool, 'tbl_purchase_order_line', 'line_no');
  await pool.query('DELETE FROM tbl_purchase_order_line WHERE purchase_order_id = ?', [poId]);
  let lineNo = 0;
  for (const ln of lines || []) {
    const desc = String(ln.description || ln.item_name || '').trim();
    const qty = parseFloat(ln.quantity) || 0;
    if (!desc && qty <= 0) continue;
    lineNo += 1;
    const invId = parseInt(ln.inventory_item_id, 10) || null;
    const unitPrice = parseFloat(ln.unit_price) || 0;
    const uom = ln.uom ? String(ln.uom).slice(0, 32) : 'unit';
    if (hasUom && hasLineNo) {
      await pool.query(
        `INSERT INTO tbl_purchase_order_line
          (purchase_order_id, inventory_item_id, quantity, unit_price, description, uom, line_no)
         VALUES (?,?,?,?,?,?,?)`,
        [poId, invId, qty, unitPrice, desc.slice(0, 512) || null, uom, lineNo]
      );
    } else if (hasUom) {
      await pool.query(
        `INSERT INTO tbl_purchase_order_line
          (purchase_order_id, inventory_item_id, quantity, unit_price, description, uom)
         VALUES (?,?,?,?,?,?)`,
        [poId, invId, qty, unitPrice, desc.slice(0, 512) || null, uom]
      );
    } else {
      await pool.query(
        `INSERT INTO tbl_purchase_order_line
          (purchase_order_id, inventory_item_id, quantity, unit_price, description)
         VALUES (?,?,?,?,?)`,
        [poId, invId, qty, unitPrice, desc.slice(0, 512) || null]
      );
    }
  }
}

function calcPoTotal(lines, fallbackTotal) {
  const sum = (lines || []).reduce(
    (acc, l) => acc + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0),
    0
  );
  if (sum > 0) return sum;
  return parseFloat(fallbackTotal) || 0;
}

module.exports = {
  nextProcPoNumber,
  loadPoDetail,
  replacePoLines,
  calcPoTotal,
};
