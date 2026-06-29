'use strict';

function normalizePrintCode(raw) {
  try {
    return decodeURIComponent(String(raw || ''))
      .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
      .replace(/\s+/g, '')
      .trim();
  } catch (_) {
    return String(raw || '')
      .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
      .replace(/\s+/g, '')
      .trim();
  }
}

async function queryPaymentTicketByCode(pool, code) {
  const [rows] = await pool
    .query(
      `SELECT t.*, p.first_name, p.last_name
         FROM tbl_payment_ticket t
         LEFT JOIN tbl_patient p ON p.id = t.patient_id
        WHERE TRIM(t.ticket_code) = ?
           OR UPPER(TRIM(t.ticket_code)) = UPPER(?)
        LIMIT 1`,
      [code, code]
    )
    .catch(() => [[]]);
  return rows?.[0] || null;
}

/**
 * Resolve a payment slip row by ticket_code, IPD admission code, or legacy aliases.
 * @returns {Promise<{ ticket: object, source: string }|null>}
 */
async function resolvePaymentTicketForPrint(pool, rawCode) {
  const code = normalizePrintCode(rawCode);
  if (!code) return null;

  const direct = await queryPaymentTicketByCode(pool, code);
  if (direct) {
    return { ticket: direct, source: 'payment_ticket' };
  }

  const [[billingDoc]] = await pool
    .query(
      `SELECT d.id, d.patient_id, d.doc_number, d.invoice_doc_number, d.total_amount,
              d.payment_method, d.source_module, d.source_pk, d.created_at,
              t.id AS ticket_id, t.ticket_code, t.status, t.total_amount AS ticket_total,
              t.amount_paid, t.payment_method AS ticket_payment_method, t.lines_json,
              t.paid_at, t.created_at AS ticket_created_at,
              p.first_name, p.last_name
         FROM tbl_billing_document d
         LEFT JOIN tbl_payment_ticket t
           ON d.source_module = 'payment_ticket' AND d.source_pk = t.id
         LEFT JOIN tbl_patient p ON p.id = COALESCE(t.patient_id, d.patient_id)
        WHERE TRIM(d.doc_number) = ? OR UPPER(TRIM(d.doc_number)) = UPPER(?)
           OR TRIM(d.invoice_doc_number) = ? OR UPPER(TRIM(d.invoice_doc_number)) = UPPER(?)
        LIMIT 1`,
      [code, code, code, code]
    )
    .catch(() => [[null]]);

  if (billingDoc) {
    if (billingDoc.ticket_id) {
      const ticket = await queryPaymentTicketByCode(pool, billingDoc.ticket_code || code);
      if (ticket) return { ticket, source: 'payment_ticket' };
    }
    const ticket = {
      id: billingDoc.ticket_id || 0,
      ticket_code: billingDoc.ticket_code || billingDoc.doc_number || code,
      patient_id: billingDoc.patient_id,
      first_name: billingDoc.first_name,
      last_name: billingDoc.last_name,
      total_amount: billingDoc.ticket_total ?? billingDoc.total_amount,
      amount_paid: billingDoc.ticket_total ?? billingDoc.total_amount,
      status: 'paid',
      payment_method: billingDoc.ticket_payment_method || billingDoc.payment_method || 'Cash',
      lines_json: billingDoc.lines_json || '[]',
      paid_at: billingDoc.paid_at || billingDoc.created_at,
      created_at: billingDoc.ticket_created_at || billingDoc.created_at,
    };
    return { ticket, source: 'billing_document' };
  }

  const [[visit]] = await pool
    .query(
      `SELECT v.id, v.patient_id, TRIM(v.payment_code) AS payment_code,
              p.first_name, p.last_name
         FROM tbl_opd_visit v
         JOIN tbl_patient p ON p.id = v.patient_id
        WHERE TRIM(v.payment_code) = ? OR UPPER(TRIM(v.payment_code)) = UPPER(?)
        LIMIT 1`,
      [code, code]
    )
    .catch(() => [[null]]);

  if (visit?.payment_code) {
    const ticket = await queryPaymentTicketByCode(pool, visit.payment_code);
    if (ticket) return { ticket, source: 'payment_ticket' };
    return {
      ticket: {
        id: 0,
        ticket_code: visit.payment_code,
        patient_id: visit.patient_id,
        first_name: visit.first_name,
        last_name: visit.last_name,
        total_amount: 0,
        amount_paid: 0,
        status: 'pending',
        payment_method: 'Cash',
        lines_json: '[]',
        created_at: new Date(),
      },
      source: 'opd_visit',
    };
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
