'use strict';

const { tableExists } = require('./hmsFinGeneralLedger');
const { ensureProcurementExtendedSchema } = require('./ensureProcurementExtendedSchema');

async function nextPrNumber(pool, facilityId) {
  await ensureProcurementExtendedSchema(pool).catch(() => {});
  const y = new Date().getFullYear();
  const pfx = `PR-${y}-`;
  const [[row]] = await pool
    .query(
      'SELECT pr_number FROM tbl_procurement_purchase_request WHERE facility_id = ? AND pr_number LIKE ? ORDER BY id DESC LIMIT 1',
      [facilityId, `${pfx}%`]
    )
    .catch(() => [[null]]);
  let n = 1;
  const last = row && row.pr_number ? String(row.pr_number) : '';
  const m = last.match(/-(\d+)$/);
  if (m) n = parseInt(m[1], 10) + 1 || 1;
  return pfx + String(n).padStart(4, '0');
}

async function loadPrList(pool, facilityId, limit = 100) {
  if (!(await tableExists(pool, 'tbl_procurement_purchase_request'))) return [];
  const [rows] = await pool.query(
    `SELECT pr.*, v.name AS vendor_name
       FROM tbl_procurement_purchase_request pr
       LEFT JOIN tbl_procurement_vendor v ON v.id = pr.vendor_id
      WHERE pr.facility_id = ?
      ORDER BY pr.created_at DESC
      LIMIT ?`,
    [facilityId, Math.max(1, Math.min(200, limit))]
  );
  return rows || [];
}

async function loadPrDetail(pool, facilityId, prId) {
  if (!(await tableExists(pool, 'tbl_procurement_purchase_request'))) return null;
  const [[pr]] = await pool.query(
    `SELECT pr.*, v.name AS vendor_name, v.email AS vendor_email, v.phone AS vendor_phone
       FROM tbl_procurement_purchase_request pr
       LEFT JOIN tbl_procurement_vendor v ON v.id = pr.vendor_id
      WHERE pr.id = ? AND pr.facility_id = ? LIMIT 1`,
    [prId, facilityId]
  );
  if (!pr) return null;
  let lines = [];
  if (await tableExists(pool, 'tbl_procurement_purchase_request_line')) {
    const [lr] = await pool.query(
      `SELECT l.*, i.name AS inv_name, i.sku AS inv_sku
         FROM tbl_procurement_purchase_request_line l
         LEFT JOIN tbl_inventory_item i ON i.id = l.inventory_item_id
        WHERE l.purchase_request_id = ?
        ORDER BY l.line_no ASC, l.id ASC`,
      [prId]
    );
    lines = lr || [];
  }
  return { pr, lines };
}

module.exports = { nextPrNumber, loadPrList, loadPrDetail };
