'use strict';

/**
 * Pharmacy dispensing registry — OPD order lines (PHA- codes), not legacy tbl_prescription_line.
 */

function normalizeDay(day) {
  const d = String(day || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date().toISOString().slice(0, 10);
}

async function loadDispensedPharmacyLines(pool, opts = {}) {
  const day = normalizeDay(opts.day);
  const limit = Math.max(1, Math.min(500, parseInt(opts.limit, 10) || 200));
  const [rows] = await pool
    .query(
      `SELECT oi.id, oi.item_name, oi.quantity, oi.unit_price, oi.service_code, oi.status,
              oi.served_at, oi.served_notes, oi.served_by, oi.patient_id, oi.consultation_id,
              oi.stock_deducted_at, oi.inventory_item_id,
              p.first_name, p.last_name,
              TRIM(CONCAT(COALESCE(e.first_name,''), ' ', COALESCE(e.last_name,''))) AS pharmacist_name
         FROM tbl_opd_order_item oi
         INNER JOIN tbl_patient p ON p.id = oi.patient_id
         LEFT JOIN tbl_employee e ON e.id = oi.served_by
        WHERE oi.item_type = 'pharmacy'
          AND oi.served_at IS NOT NULL
          AND DATE(oi.served_at) = ?
        ORDER BY oi.served_at DESC, oi.id DESC
        LIMIT ${limit}`,
      [day]
    )
    .catch(() => [[]]);
  return rows || [];
}

async function countDispensedPharmacyLines(pool, day) {
  const d = normalizeDay(day);
  const [[row]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_opd_order_item
        WHERE item_type = 'pharmacy' AND served_at IS NOT NULL AND DATE(served_at) = ?`,
      [d]
    )
    .catch(() => [[{ c: 0 }]]);
  return parseInt(row && row.c, 10) || 0;
}

/** Paid at cashier, not yet served via PHA validate. */
async function loadPendingPharmacyDispense(pool, limit = 150) {
  const lim = Math.max(1, Math.min(300, parseInt(limit, 10) || 150));
  const [rows] = await pool
    .query(
      `SELECT oi.id, oi.item_name, oi.quantity, oi.service_code, oi.status, oi.paid_at,
              oi.patient_id, oi.consultation_id,
              p.first_name, p.last_name
         FROM tbl_opd_order_item oi
         INNER JOIN tbl_patient p ON p.id = oi.patient_id
        WHERE oi.item_type = 'pharmacy'
          AND oi.served_at IS NULL
          AND LOWER(TRIM(COALESCE(oi.status,''))) NOT IN ('external','cancelled')
          AND (oi.paid_at IS NOT NULL OR LOWER(TRIM(COALESCE(oi.status,''))) = 'paid')
        ORDER BY COALESCE(oi.paid_at, oi.created_at) DESC, oi.id DESC
        LIMIT ${lim}`
    )
    .catch(() => [[]]);
  return rows || [];
}

module.exports = {
  normalizeDay,
  loadDispensedPharmacyLines,
  countDispensedPharmacyLines,
  loadPendingPharmacyDispense,
};
