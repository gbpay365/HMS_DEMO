'use strict';

/** Shared locals for pharmacy Odoo sidebar shell pages. */
async function loadPharmacyOdooLocals(pool, opts = {}) {
  let nursingSupplyPending = 0;
  try {
    const [[r]] = await pool.query(
      "SELECT COUNT(*) AS c FROM tbl_nursing_supply_request WHERE status IN ('pending','preparing')"
    );
    nursingSupplyPending = parseInt(r && r.c, 10) || 0;
  } catch (_) {
    nursingSupplyPending = 0;
  }

  let expiryAlertCount = 0;
  try {
    const { countPharmacyExpiryAlerts } = require('./pharmacyExpiryHub');
    expiryAlertCount = await countPharmacyExpiryAlerts(pool, 30);
  } catch (_) {
    expiryAlertCount = 0;
  }

  return {
    pharmacyOdooApp: true,
    nursingSupplyPending,
    expiryAlertCount,
    flash: opts.flash || null,
    error: opts.error || null,
  };
}

module.exports = { loadPharmacyOdooLocals };
