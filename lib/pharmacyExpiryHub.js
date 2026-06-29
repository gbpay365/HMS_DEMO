'use strict';

const { todayYmd, isExpired } = require('./pharmacyExpiry');
const { pharmacyCatalogJoin } = require('./pharmacyProductScope');

function daysUntil(expiryYmd, asOfYmd) {
  if (!expiryYmd || !asOfYmd) return null;
  const exp = new Date(`${expiryYmd}T12:00:00`);
  const asOf = new Date(`${asOfYmd}T12:00:00`);
  if (Number.isNaN(exp.getTime()) || Number.isNaN(asOf.getTime())) return null;
  return Math.round((exp - asOf) / 86400000);
}

function severityFor(daysLeft, expired) {
  if (expired || (daysLeft != null && daysLeft < 0)) return 'critical';
  if (daysLeft != null && daysLeft <= 14) return 'critical';
  if (daysLeft != null && daysLeft <= 30) return 'warning';
  return 'ok';
}

async function loadPharmacyExpiryHub(pool, opts = {}) {
  const days = Math.max(1, Math.min(365, parseInt(opts.days, 10) || 30));
  const asOf = todayYmd();
  const [rows] = await pool
    .query(
      `SELECT i.id, i.sku, i.name, i.quantity, i.expiry_date, i.manufacturing_company,
              i.reorder_level, mt.name AS medicine_type_name, mc.name AS medicine_category_name
         FROM tbl_inventory_item i
         ${pharmacyCatalogJoin('i', 'sc')}
         LEFT JOIN tbl_pharmacy_medicine_type mt ON mt.id = i.medicine_type_id
         LEFT JOIN tbl_pharmacy_medicine_category mc ON mc.id = i.medicine_category_id
        WHERE i.expiry_date IS NOT NULL
          AND i.expiry_date <= DATE_ADD(?, INTERVAL ? DAY)
        ORDER BY i.expiry_date ASC, i.name ASC
        LIMIT 500`,
      [asOf, days]
    )
    .catch(() => [[]]);

  const items = (rows || []).map((r) => {
    const exp = r.expiry_date ? String(r.expiry_date).slice(0, 10) : null;
    const expired = exp ? isExpired(exp, asOf) : false;
    const daysLeft = exp != null ? daysUntil(exp, asOf) : null;
    const severity = severityFor(daysLeft, expired);
    return {
      id: r.id,
      sku: r.sku,
      name: r.name,
      quantity: Number(r.quantity) || 0,
      expiry_date: exp,
      days_left: daysLeft,
      expired,
      severity,
      location: r.manufacturing_company || r.medicine_category_name || '—',
      category: r.medicine_category_name || r.medicine_type_name || '—',
    };
  });

  const stats = {
    total: items.length,
    expired: items.filter((i) => i.expired).length,
    critical: items.filter((i) => !i.expired && i.severity === 'critical').length,
    warning: items.filter((i) => !i.expired && i.severity === 'warning').length,
  };

  return { expiryDays: days, asOf, stats, items };
}

async function countPharmacyExpiryAlerts(pool, horizonDays = 30) {
  const hub = await loadPharmacyExpiryHub(pool, { days: horizonDays });
  return hub.stats.total;
}

module.exports = {
  loadPharmacyExpiryHub,
  countPharmacyExpiryAlerts,
};
