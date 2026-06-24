'use strict';

function normalizePrintCode(raw) {
  try {
    return decodeURIComponent(String(raw || '')).trim();
  } catch (_) {
    return String(raw || '').trim();
  }
}

/**
 * Resolve a payment slip row by ticket_code, IPD admission code, or legacy aliases.
 * @returns {Promise<{ ticket: object, source: string }|null>}
 */
async function resolvePaymentTicketForPrint(pool, rawCode) {
  const code = normalizePrintCode(rawCode);
  if (!code) return null;

  const ticketSql = `
    SELECT t.*, p.first_name, p.last_name
      FROM tbl_payment_ticket t
      JOIN tbl_patient p ON p.id = t.patient_id
     WHERE TRIM(t.ticket_code) = ?
        OR UPPER(TRIM(t.ticket_code)) = UPPER(?)
     LIMIT 1`;

  const [rows] = await pool.query(ticketSql, [code, code]);
  if (rows && rows.length) {
    return { ticket: rows[0], source: 'payment_ticket' };
  }

  const [[adm]] = await pool.query(
    `SELECT a.id, a.patient_id, TRIM(a.ipd_payment_code) AS ipd_payment_code,
            a.deposit_amount, a.ipd_paid_at, a.ipd_payment_code_generated_at,
            COALESCE(NULLIF(TRIM(a.ipd_code_service_label), ''), 'IPD Final Settlement') AS service_label,
            p.first_name, p.last_name
       FROM tbl_admission a
       JOIN tbl_patient p ON p.id = a.patient_id
      WHERE TRIM(a.ipd_payment_code) = ?
         OR UPPER(TRIM(a.ipd_payment_code)) = UPPER(?)
      LIMIT 1`,
    [code, code]
  ).catch(() => [[null]]);

  if (adm && adm.ipd_payment_code) {
    const [[sum]] = await pool.query(
      'SELECT COALESCE(SUM(amount),0) AS total_charges FROM tbl_ipd_charge WHERE admission_id=?',
      [adm.id]
    ).catch(() => [[{ total_charges: 0 }]]);
    const total = parseFloat(sum?.total_charges || 0) || 0;
    const deposit = parseFloat(adm.deposit_amount || 0) || 0;
    const balance = Math.max(0, total - deposit);
    const paidAt = adm.ipd_paid_at || adm.ipd_payment_code_generated_at || new Date();
    const ticket = {
      id: 0,
      facility_id: 1,
      ticket_code: adm.ipd_payment_code,
      patient_id: adm.patient_id,
      first_name: adm.first_name,
      last_name: adm.last_name,
      total_amount: balance > 0 ? balance : total,
      status: 'paid',
      payment_method: 'Cash',
      lines_json: JSON.stringify([
        { kind: 'ipd_settlement', description: adm.service_label, admission_id: adm.id },
      ]),
      paid_at: paidAt,
      created_at: paidAt,
    };
    return { ticket, source: 'ipd_admission' };
  }

  return null;
}

module.exports = { normalizePrintCode, resolvePaymentTicketForPrint };
