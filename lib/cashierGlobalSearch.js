'use strict';

const { lookupCashierBill } = require('./cashierLookupBill');
const {
  normalizeSearchTerm,
  patientSearchWhere,
  patientSearchBindings,
} = require('./hmsCaseInsensitiveSearch');

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Global cashier search — patients, bills (payment tickets), receipts.
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} rawQ
 * @param {{ limit?: number }} [opts]
 */
async function searchCashierGlobal(pool, rawQ, opts = {}) {
  const q = String(rawQ || '').trim();
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 8, 1), 25);
  if (!q || q.length < 2) {
    return { ok: true, q, patients: [], bills: [], receipts: [] };
  }

  const normalized = normalizeSearchTerm(q);
  const like = `%${q.replace(/[%_\\]/g, ' ').trim()}%`;

  const patients = [];
  if (normalized) {
    const [rows] = await pool
      .query(
        `SELECT id, first_name, last_name, phone, patient_code
           FROM tbl_patient
          WHERE status = 1
            AND ${patientSearchWhere('')}
          ORDER BY last_name, first_name
          LIMIT ?`,
        [...patientSearchBindings(q), limit]
      )
      .catch(() => [[]]);
    for (const r of rows || []) {
      patients.push({
        type: 'patient',
        id: r.id,
        label: `${r.first_name || ''} ${r.last_name || ''}`.trim() || `Patient #${r.id}`,
        sub: r.phone || r.patient_code || `ID ${r.id}`,
        patient_id: r.id,
      });
    }
  }

  const bills = [];
  const [billRows] = await pool
    .query(
      `SELECT
        t.id,
        t.ticket_code,
        t.status,
        t.total_amount,
        t.amount_paid,
        p.id AS patient_id,
        p.first_name,
        p.last_name
       FROM tbl_payment_ticket t
       JOIN tbl_patient p ON p.id = t.patient_id
      WHERE LOWER(t.ticket_code) LIKE LOWER(?)
         OR LOWER(CONCAT(COALESCE(p.first_name,''), ' ', COALESCE(p.last_name,''))) LIKE LOWER(?)
      ORDER BY t.id DESC
      LIMIT ?`,
      [like, like, limit]
    )
    .catch(() => [[]]);

  for (const r of billRows || []) {
    const total = n(r.total_amount);
    const paid = n(r.amount_paid);
    const st = String(r.status || '').toLowerCase();
    const balance = st === 'paid' ? 0 : Math.max(0, total - paid);
    bills.push({
      type: 'bill',
      id: r.id,
      ticket_id: r.id,
      ticket_code: r.ticket_code,
      label: r.ticket_code || `Bill #${r.id}`,
      sub: `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—',
      status: st,
      balance_due: balance,
      patient_id: r.patient_id,
      patient_name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
    });
  }

  const receipts = [];
  const [receiptRows] = await pool
    .query(
      `SELECT
        d.id,
        d.doc_number,
        d.invoice_doc_number,
        d.total_amount,
        d.payment_method,
        d.created_at,
        d.patient_id,
        p.first_name,
        p.last_name,
        t.id AS ticket_id,
        t.ticket_code
       FROM tbl_billing_document d
       LEFT JOIN tbl_patient p ON p.id = d.patient_id
       LEFT JOIN tbl_payment_ticket t
         ON d.source_module = 'payment_ticket' AND d.source_pk = t.id
      WHERE d.doc_type IN ('receipt', 'invoice', 'refund')
        AND (
          LOWER(d.doc_number) LIKE LOWER(?)
          OR LOWER(COALESCE(d.invoice_doc_number, '')) LIKE LOWER(?)
          OR LOWER(COALESCE(t.ticket_code, '')) LIKE LOWER(?)
        )
      ORDER BY d.id DESC
      LIMIT ?`,
      [like, like, like, limit]
    )
    .catch(() => [[]]);

  for (const r of receiptRows || []) {
    receipts.push({
      type: 'receipt',
      id: r.id,
      billing_doc_id: r.id,
      ticket_id: r.ticket_id || null,
      label: r.doc_number || r.invoice_doc_number || `Receipt #${r.id}`,
      sub: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.ticket_code || '—',
      ticket_code: r.ticket_code || null,
      patient_id: r.patient_id || null,
    });
  }

  if (bills.length === 0 && /^[A-Z0-9-]{6,}$/i.test(q)) {
    const exact = await lookupCashierBill(pool, q).catch(() => null);
    if (exact?.ok && exact.bill) {
      const b = exact.bill;
      bills.push({
        type: 'bill',
        id: b.ticket_id,
        ticket_id: b.ticket_id,
        ticket_code: b.ticket_code,
        label: b.ticket_code,
        sub: b.patient_name,
        status: b.status,
        balance_due: b.balance_due,
        patient_id: b.patient_id,
        patient_name: b.patient_name,
      });
    }
  }

  return { ok: true, q, patients, bills, receipts };
}

module.exports = { searchCashierGlobal };
