'use strict';

/** PO lines may reference RFQ text before an inventory SKU is linked. */
async function ensurePurchaseOrderSchema(pool) {
  const addCol = async (table, def) => {
    try {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${def}`);
    } catch (e) {
      const msg = String(e.message || '');
      const ignore =
        e.code === 'ER_DUP_FIELDNAME' ||
        e.errno === 1060 ||
        /Duplicate column/i.test(msg) ||
        /already exists/i.test(msg);
      if (!ignore) console.warn(`ensurePurchaseOrderSchema(${table}):`, msg);
    }
  };
  await addCol('tbl_purchase_order_line', 'description VARCHAR(512) DEFAULT NULL');
  try {
    await pool.query('ALTER TABLE tbl_purchase_order_line MODIFY inventory_item_id INT NULL');
  } catch (_) {}
}

module.exports = { ensurePurchaseOrderSchema };
