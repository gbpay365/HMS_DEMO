'use strict';

/**
 * IPD charges must not accumulate after cashier has issued a settlement code.
 * Ward financial discharge consumes that code; new charges would never re-queue at cashier.
 */
async function admissionAcceptsNewCharges(db, admissionId) {
  const aid = parseInt(admissionId, 10) || 0;
  if (aid < 1) return { ok: false, reason: 'invalid_admission' };

  const [[adm]] = await db
    .query(
      `SELECT id, discharged_at, ipd_payment_code
         FROM tbl_admission
        WHERE id = ?
        LIMIT 1`,
      [aid]
    )
    .catch(() => [[null]]);

  if (!adm) return { ok: false, reason: 'not_found' };
  if (adm.discharged_at) return { ok: false, reason: 'discharged' };
  if (String(adm.ipd_payment_code || '').trim()) {
    return { ok: false, reason: 'financially_settled' };
  }
  return { ok: true };
}

module.exports = {
  admissionAcceptsNewCharges,
};
