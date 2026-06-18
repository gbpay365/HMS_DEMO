'use strict';

const { resolvePeriodBounds, loadPaidTickets } = require('./cashierBatchPrint');
const { enrichBillingReceiptForPrint, amountWordsForPrint } = require('./billingReceiptPrint');
const { resolveBillingDocPrintPayload } = require('./billingPrintPayload');
const { nextReceiptNumber } = require('./receiptNumber');
const { nextInvoiceNumber } = require('./invoiceNumber');

async function billingDocIdForTicketCode(pool, code) {
  const c = String(code || '').trim();
  if (!c) return null;
  const [[tk]] = await pool.query('SELECT id FROM tbl_payment_ticket WHERE ticket_code=? LIMIT 1', [c]).catch(() => [[null]]);
  const tid = tk && tk.id ? parseInt(tk.id, 10) || 0 : 0;
  if (tid < 1) return null;
  const [[doc]] = await pool
    .query(
      `SELECT id FROM tbl_billing_document
        WHERE source_module='payment_ticket' AND source_pk=?
        ORDER BY id DESC LIMIT 1`,
      [tid]
    )
    .catch(() => [[null]]);
  return doc && doc.id ? parseInt(doc.id, 10) || null : null;
}

async function ensureBillingDocumentForPaidTicket(conn, ticketCode, userId) {
  const c = String(ticketCode || '').trim();
  if (!c) return null;
  const [[t]] = await conn
    .query(
      `SELECT id, facility_id, patient_id, total_amount, payment_method, status
       FROM tbl_payment_ticket WHERE ticket_code=? LIMIT 1`,
      [c]
    )
    .catch(() => [[null]]);
  if (!t || !t.id || String(t.status || '').toLowerCase() !== 'paid') return null;
  const tid = parseInt(t.id, 10) || 0;
  const [[existing]] = await conn
    .query(`SELECT id FROM tbl_billing_document WHERE source_module='payment_ticket' AND source_pk=? LIMIT 1`, [tid])
    .catch(() => [[null]]);
  if (existing && existing.id) return parseInt(existing.id, 10) || null;
  const fid = parseInt(String(t.facility_id || 1), 10) || 1;
  const receiptNo = await nextReceiptNumber(conn, fid);
  const invoiceNo = await nextInvoiceNumber(conn, fid);
  const [ins] = await conn.query(
    `INSERT INTO tbl_billing_document
     (facility_id, patient_id, doc_type, doc_number, invoice_doc_number, total_amount, payment_method,
      status, source_module, source_pk, created_by, created_at)
     VALUES (?, ?, 'receipt', ?, ?, ?, ?, 'paid', 'payment_ticket', ?, ?, NOW())`,
    [fid, t.patient_id, receiptNo, invoiceNo, t.total_amount, t.payment_method || 'Cash', tid, userId]
  );
  const nid = ins && ins.insertId ? parseInt(String(ins.insertId), 10) : 0;
  return nid > 0 ? nid : null;
}

async function resolveBillingDocId(pool, ticketCode, userId) {
  let id = await billingDocIdForTicketCode(pool, ticketCode);
  if (id) return id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    id = await ensureBillingDocumentForPaidTicket(conn, ticketCode, userId);
    await conn.commit();
    conn.release();
    return id;
  } catch (e) {
    await conn.rollback().catch(() => {});
    conn.release();
    throw e;
  }
}

async function loadReceiptPayloadForDoc(pool, docId) {
  const [rows] = await pool.query(
    'SELECT d.*, p.first_name, p.last_name FROM tbl_billing_document d JOIN tbl_patient p ON p.id = d.patient_id WHERE d.id = ?',
    [docId]
  );
  if (!rows.length) return null;
  const receipt = await enrichBillingReceiptForPrint(pool, rows[0]);
  let printPayload = {
    paymentCode: null,
    lineItems: [],
    sectionCodes: { laboratory: null, radiology: null, pharmacy: null },
    prescriptionItems: [],
    paymentSettled: false,
  };
  try {
    printPayload = await resolveBillingDocPrintPayload(pool, receipt);
  } catch (_) {
    /* keep defaults */
  }
  const subtotal = (printPayload.lineItems || []).reduce((s, it) => s + (Number(it.amount || 0) || 0), 0);
  const grandTotal = subtotal || (Number(receipt.total_amount || 0) || 0);
  return {
    receipt,
    ticket_code: receipt.ticket_code || null,
    paymentCode: printPayload.paymentSettled ? printPayload.paymentCode : null,
    paymentSettled: !!printPayload.paymentSettled,
    lineItems: printPayload.lineItems || [],
    sectionCodes: printPayload.sectionCodes || {},
    prescriptionItems: printPayload.prescriptionItems || [],
    subtotal,
    grandTotal,
    amountWords: amountWordsForPrint(grandTotal),
  };
}

async function loadTicketsByCodes(pool, codes) {
  const list = [...new Set((codes || []).map((c) => String(c || '').trim()).filter(Boolean))];
  if (!list.length) return [];
  const placeholders = list.map(() => '?').join(',');
  const [rows] = await pool
    .query(
      `SELECT t.*, p.first_name, p.last_name
         FROM tbl_payment_ticket t
         JOIN tbl_patient p ON p.id = t.patient_id
        WHERE t.ticket_code IN (${placeholders})
          AND LOWER(TRIM(COALESCE(t.status,''))) = 'paid'
        ORDER BY COALESCE(t.paid_at, t.created_at) ASC, t.id ASC`,
      list
    )
    .catch(() => [[]]);
  return rows || [];
}

function aggregateReceiptSummary(items) {
  return {
    receiptCount: items.length,
    totalCollected: items.reduce((s, it) => s + (Number(it.grandTotal) || 0), 0),
  };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} opts
 */
async function buildCashierReceiptBatchPayload(pool, opts = {}) {
  const userId = opts.userId || null;
  let tickets = [];
  let bounds = null;
  let patientLabel = null;

  const codes = (opts.ticketCodes || [])
    .flatMap((c) => String(c || '').split(','))
    .map((c) => c.trim())
    .filter(Boolean);

  if (codes.length) {
    tickets = await loadTicketsByCodes(pool, codes);
  } else if (opts.period) {
    bounds = resolvePeriodBounds(opts.period, opts.date);
    const patientId = parseInt(String(opts.patientId || 0), 10) || 0;
    tickets = await loadPaidTickets(pool, bounds, opts);
    if (patientId > 0) {
      tickets = tickets.filter((t) => parseInt(t.patient_id, 10) === patientId);
      if (tickets.length) {
        patientLabel = `${tickets[0].first_name || ''} ${tickets[0].last_name || ''}`.trim();
      }
    }
  }

  const receipts = [];
  for (const ticket of tickets) {
    const code = ticket.ticket_code;
    if (!code) continue;
    const docId = await resolveBillingDocId(pool, code, userId);
    if (!docId) continue;
    const payload = await loadReceiptPayloadForDoc(pool, docId);
    if (payload) {
      receipts.push({
        ...payload,
        ticket_code: code,
        patient_name: `${ticket.first_name || ''} ${ticket.last_name || ''}`.trim(),
      });
    }
  }

  if (!patientLabel && receipts.length) {
    const names = [...new Set(receipts.map((r) => r.patient_name).filter(Boolean))];
    if (names.length === 1) patientLabel = names[0];
  }

  return {
    bounds,
    patientLabel,
    receipts,
    count: receipts.length,
    summary: aggregateReceiptSummary(receipts),
  };
}

module.exports = {
  buildCashierReceiptBatchPayload,
  billingDocIdForTicketCode,
};
