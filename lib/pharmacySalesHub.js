'use strict';

const {
  normalizeDay,
  loadDispensedPharmacyLines,
  countDispensedPharmacyLines,
  sumPharmacySalesForDay,
  loadPendingPharmacyDispense,
} = require('./pharmacyDispenseRegistry');

async function sumPharmacySalesForMonth(pool, monthYmd) {
  const monthStart = String(monthYmd || '').slice(0, 7) + '-01';
  if (!/^\d{4}-\d{2}-01$/.test(monthStart)) {
    return { total: 0, lines: 0 };
  }
  const [[row]] = await pool
    .query(
      `SELECT COALESCE(SUM(COALESCE(quantity, 0) * COALESCE(unit_price, 0)), 0) AS total,
              COUNT(*) AS lines
         FROM tbl_opd_order_item
        WHERE item_type = 'pharmacy'
          AND served_at IS NOT NULL
          AND DATE(served_at) >= ?
          AND DATE(served_at) <= LAST_DAY(?)`,
      [monthStart, monthStart]
    )
    .catch(() => [[{ total: 0, lines: 0 }]]);
  return {
    total: parseFloat(row?.total) || 0,
    lines: parseInt(row?.lines, 10) || 0,
  };
}

async function sumPendingPharmacyBilling(pool) {
  const [[row]] = await pool
    .query(
      `SELECT COALESCE(SUM(COALESCE(quantity, 0) * COALESCE(unit_price, 0)), 0) AS total,
              COUNT(*) AS lines
         FROM tbl_opd_order_item
        WHERE item_type = 'pharmacy'
          AND served_at IS NULL
          AND LOWER(TRIM(COALESCE(status, ''))) NOT IN ('external', 'cancelled')
          AND (paid_at IS NOT NULL OR LOWER(TRIM(COALESCE(status, ''))) = 'paid')`
    )
    .catch(() => [[{ total: 0, lines: 0 }]]);
  return {
    total: parseFloat(row?.total) || 0,
    lines: parseInt(row?.lines, 10) || 0,
  };
}

function enrichSalesLine(row) {
  const qty = Number(row.quantity) || 0;
  const unit = Number(row.unit_price) || 0;
  return {
    ...row,
    line_total: qty * unit,
    patient_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
  };
}

async function loadPharmacySalesHub(pool, opts = {}) {
  const salesDay = normalizeDay(opts.day);
  const [salesToday, dispensedToday, monthStats, pendingBilling, rawLines, pendingLines] =
    await Promise.all([
      sumPharmacySalesForDay(pool, salesDay),
      countDispensedPharmacyLines(pool, salesDay),
      sumPharmacySalesForMonth(pool, salesDay),
      sumPendingPharmacyBilling(pool),
      loadDispensedPharmacyLines(pool, { day: salesDay, limit: 250 }),
      loadPendingPharmacyDispense(pool, 80),
    ]);

  const salesLines = (rawLines || []).map(enrichSalesLine);
  const pendingSales = (pendingLines || []).map((r) => {
    const qty = Number(r.quantity) || 0;
    const unit = Number(r.unit_price) || 0;
    return {
      ...r,
      line_total: qty * unit,
      patient_name: [r.first_name, r.last_name].filter(Boolean).join(' '),
    };
  });

  return {
    salesDay,
    stats: {
      salesToday,
      dispensedToday,
      salesMonth: monthStats.total,
      linesMonth: monthStats.lines,
      pendingPaidCount: pendingBilling.lines,
      pendingPaidAmount: pendingBilling.total,
    },
    salesLines,
    pendingSales,
  };
}

module.exports = {
  loadPharmacySalesHub,
  sumPharmacySalesForMonth,
  sumPendingPharmacyBilling,
};
