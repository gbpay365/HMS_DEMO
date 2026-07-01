'use strict';

const hmsBrand = require('./hmsBrand');
const { ensureCashierInvoiceSchema } = require('./ensureCashierInvoiceSchema');
const { resolveTicketPrintPayload, lineItemsFromTicketLines, parseTicketLines } = require('./billingPrintPayload');

const INVOICE_TERMS_DAYS = 30;

function isoDateOnly(val) {
  if (!val) return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val).slice(0, 10) || null;
  return d.toISOString().slice(0, 10);
}

function addDaysIso(iso, days) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function resolveInvoicePaymentStatus(ticket) {
  const st = String(ticket?.status || '').toLowerCase();
  if (st === 'cancelled' || st === 'canceled') return 'canceled';
  const total = parseFloat(ticket?.total_amount) || 0;
  const paid = parseFloat(ticket?.amount_paid) || 0;
  const invoiceSt = String(ticket?.invoice_status || '').toLowerCase();
  if (invoiceSt === 'refunded') return 'refunded';
  if (total > 0 && paid >= total - 0.005) return 'paid';
  if (paid > 0.005 && paid < total - 0.005) return 'partial';
  const dueIso = ticket?.due_date || addDaysIso(ticket?.issue_date || ticket?.created_at, INVOICE_TERMS_DAYS);
  if (dueIso) {
    const due = new Date(`${dueIso}T23:59:59`);
    if (!Number.isNaN(due.getTime()) && Date.now() > due.getTime()) return 'overdue';
  }
  return 'pending';
}

function calcInvoiceTotals(ticket, lineItems) {
  const subtotalFromLines = (lineItems || []).reduce(
    (sum, it) => sum + (Number(it.amount || 0) || 0),
    0
  );
  const subtotal = subtotalFromLines > 0 ? subtotalFromLines : parseFloat(ticket?.total_amount) || 0;
  const discountPct = parseFloat(ticket?.discount_pct) || 0;
  const taxPct = parseFloat(ticket?.tax_pct) || 0;
  const discountAmount = discountPct > 0 ? Math.round(subtotal * (discountPct / 100)) : 0;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxPct > 0 ? Math.round(afterDiscount * (taxPct / 100)) : 0;
  const grandTotal = afterDiscount + taxAmount;
  const amountPaid = parseFloat(ticket?.amount_paid) || 0;
  const balanceDue = Math.max(0, Math.round((grandTotal - amountPaid) * 100) / 100);
  return {
    subtotal,
    discountPct,
    discountAmount,
    taxPct,
    taxAmount,
    grandTotal,
    amountPaid,
    balanceDue,
  };
}

/**
 * Build pageData for premium hospital invoice print (paid or pending tickets).
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} ticketCode
 */
async function buildHospitalInvoicePageData(pool, ticketCode) {
  await ensureCashierInvoiceSchema(pool).catch(() => {});
  const code = String(ticketCode || '').trim();
  if (!code) return null;

  const [rows] = await pool.query(
    `SELECT
      t.*,
      p.first_name, p.last_name, p.phone, p.email, p.gender, p.patient_code,
      d.invoice_doc_number, d.doc_number AS receipt_number
     FROM tbl_payment_ticket t
     JOIN tbl_patient p ON p.id = t.patient_id
     LEFT JOIN (
       SELECT bd.source_pk, bd.invoice_doc_number, bd.doc_number
       FROM tbl_billing_document bd
       INNER JOIN (
         SELECT source_pk, MAX(id) AS max_id
         FROM tbl_billing_document
         WHERE source_module = 'payment_ticket'
         GROUP BY source_pk
       ) latest ON latest.max_id = bd.id
     ) d ON d.source_pk = t.id
     WHERE t.ticket_code = ?
     LIMIT 1`,
    [code]
  );
  if (!rows?.length) return null;

  const ticket = rows[0];
  ticket.lines = parseTicketLines(ticket);
  const printPayload = await resolveTicketPrintPayload(pool, ticket).catch(() => ({
    paymentSettled: false,
    paymentCode: null,
    lineItems: lineItemsFromTicketLines(ticket.lines),
    sectionCodes: { laboratory: null, radiology: null, pharmacy: null },
    prescriptionItems: [],
  }));

  const lineItems =
    printPayload.lineItems?.length > 0
      ? printPayload.lineItems
      : lineItemsFromTicketLines(ticket.lines);

  const totals = calcInvoiceTotals(ticket, lineItems);
  const paymentStatus = resolveInvoicePaymentStatus(ticket);
  const issueDate = isoDateOnly(ticket.issue_date || ticket.created_at);
  const dueDate =
    isoDateOnly(ticket.due_date) || addDaysIso(issueDate || ticket.created_at, INVOICE_TERMS_DAYS);

  const patientName = `${ticket.first_name || ''} ${ticket.last_name || ''}`.trim();
  const billToName = String(ticket.bill_to_name || '').trim() || patientName;
  const billToCompany = String(ticket.bill_to_company || '').trim();

  const [[cashier]] = ticket.created_by
    ? await pool
        .query('SELECT first_name, last_name FROM tbl_employee WHERE id = ? LIMIT 1', [
          ticket.created_by,
        ])
        .catch(() => [[null]])
    : [[null]];

  return {
    brand: {
      facilityName: hmsBrand.facilityName,
      orgName: hmsBrand.orgName,
      legalName: hmsBrand.legalName,
      tagline: hmsBrand.tagline,
      logoPath: hmsBrand.logoPath,
      letterheadPath: hmsBrand.letterheadPath,
      websiteUrl: hmsBrand.websiteUrl,
    },
    invoice: {
      invoice_number: ticket.invoice_doc_number || ticket.ticket_code,
      ticket_code: ticket.ticket_code,
      receipt_number: ticket.receipt_number || null,
      issue_date: issueDate,
      due_date: dueDate,
      payment_status: paymentStatus,
      payment_method: ticket.payment_method || null,
      notes: ticket.notes || null,
      created_at: ticket.created_at,
      paid_at: ticket.paid_at,
      patient_id: ticket.patient_id,
      patient_code: ticket.patient_code || null,
      first_name: ticket.first_name,
      last_name: ticket.last_name,
      phone: ticket.phone || null,
      email: ticket.email || null,
      gender: ticket.gender || null,
      bill_to_name: billToName,
      bill_to_contact: ticket.bill_to_contact || null,
      bill_to_company: billToCompany,
      cashier_name: cashier
        ? `${cashier.first_name || ''} ${cashier.last_name || ''}`.trim()
        : null,
      ...totals,
    },
    lineItems,
    paymentCode: printPayload.paymentSettled ? printPayload.paymentCode : null,
    paymentSettled: !!printPayload.paymentSettled,
    sectionCodes: printPayload.sectionCodes || {},
    prescriptionItems: printPayload.prescriptionItems || [],
  };
}

module.exports = {
  buildHospitalInvoicePageData,
  resolveInvoicePaymentStatus,
  calcInvoiceTotals,
};
