'use strict';

const { pharmacyCatalogJoin } = require('./pharmacyProductScope');

async function tableHasColumn(pool, table, column) {
  const [[row]] = await pool
    .query(
      `SELECT 1 AS ok FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [table, column]
    )
    .catch(() => [[null]]);
  return !!(row && row.ok);
}

/** Pharmacy catalog items at or below reorder level. */
async function loadLowStockDrugs(pool, limit = 50) {
  const lim = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const [rows] = await pool
    .query(
      `SELECT i.id, i.sku, i.name, i.quantity, i.reorder_level
         FROM tbl_inventory_item i
         ${pharmacyCatalogJoin('i', 'sc')}
        WHERE COALESCE(i.quantity, 0) <= COALESCE(i.reorder_level, 5)
        ORDER BY i.quantity ASC, i.name ASC
        LIMIT ${lim}`
    )
    .catch(() => [[]]);
  return rows || [];
}

/** Pharmacy items expiring within the next N days. */
async function loadExpiringSoonDrugs(pool, days = 30, limit = 50) {
  const horizon = Math.max(1, Math.min(365, parseInt(days, 10) || 30));
  const lim = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const [rows] = await pool
    .query(
      `SELECT i.id, i.sku, i.name, i.quantity, i.expiry_date
         FROM tbl_inventory_item i
         ${pharmacyCatalogJoin('i', 'sc')}
        WHERE i.expiry_date IS NOT NULL
          AND i.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
        ORDER BY i.expiry_date ASC, i.name ASC
        LIMIT ${lim}`,
      [horizon]
    )
    .catch(() => [[]]);
  return rows || [];
}

/** Refunded pharmacy OPD lines (medicine returns). */
async function countMedicineReturns(pool) {
  const hasRefundedAt = await tableHasColumn(pool, 'tbl_opd_order_item', 'refunded_at');
  if (hasRefundedAt) {
    const [[row]] = await pool
      .query(
        `SELECT COUNT(*) AS c FROM tbl_opd_order_item
          WHERE item_type = 'pharmacy'
            AND LOWER(TRIM(COALESCE(status,''))) = 'refunded'`
      )
      .catch(() => [[{ c: 0 }]]);
    return parseInt(row && row.c, 10) || 0;
  }
  const [[row]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_opd_order_item
        WHERE item_type = 'pharmacy'
          AND LOWER(TRIM(COALESCE(status,''))) = 'refunded'`
    )
    .catch(() => [[{ c: 0 }]]);
  return parseInt(row && row.c, 10) || 0;
}

/** Open credit accounts with an outstanding balance. */
async function countActiveCreditNotes(pool) {
  const hasCredit = await tableHasColumn(pool, 'tbl_credit_account', 'outstanding_balance');
  if (!hasCredit) return 0;
  const [[row]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_credit_account
        WHERE LOWER(TRIM(COALESCE(status,''))) = 'active'
          AND COALESCE(outstanding_balance, 0) > 0`
    )
    .catch(() => [[{ c: 0 }]]);
  return parseInt(row && row.c, 10) || 0;
}

module.exports = {
  loadLowStockDrugs,
  loadExpiringSoonDrugs,
  countMedicineReturns,
  countActiveCreditNotes,
};
