'use strict';

const { allocateUniquePaymentCode } = require('./paymentTicketCode');
const { ensureCashierInvoiceSchema } = require('./ensureCashierInvoiceSchema');
const { patientActiveWhere } = require('./patientDirectory');

const CORPORATE_PATIENT_CODE = 'ZAI-CORP-BILL';

const VALID_SERVICE_CATEGORIES = new Set([
  'consultation',
  'laboratory',
  'radiology',
  'maternity',
  'surgery',
  'hospitalisation',
  'pharmacy',
  'service',
  'other',
]);

function resolveServiceCategory(input) {
  const fromBody = String(input.service_category || input.service_type || '').toLowerCase().trim();
  if (VALID_SERVICE_CATEGORIES.has(fromBody)) {
    if (fromBody === 'other' || fromBody === 'service') return 'hospitalisation';
    return fromBody;
  }
  const lines = input.lines;
  if (Array.isArray(lines) && lines.length) {
    const kind = String(lines[0].kind || '').toLowerCase();
    if (kind === 'other' || kind === 'service') return 'hospitalisation';
    if (VALID_SERVICE_CATEGORIES.has(kind)) return kind;
  }
  const legacy = String(input.category || 'service').toLowerCase();
  if (legacy === 'pharmacy') return 'pharmacy';
  return 'consultation';
}

function codeKindForCategory(serviceCategory) {
  if (serviceCategory === 'hospitalisation') return 'service';
  return serviceCategory;
}

function lineTotal(line) {
  const qty = parseFloat(line.quantity) || 1;
  const unit = parseFloat(line.unit_price) || 0;
  return Math.round(qty * unit * 100) / 100;
}

function normalizeLines(rawLines) {
  if (!Array.isArray(rawLines)) return [];
  return rawLines
    .map((ln) => {
      const qty = Math.max(1, parseInt(ln.quantity, 10) || 1);
      const unit = parseFloat(ln.unit_price) || 0;
      const insurer = parseFloat(ln.insurer_amount) || 0;
      const patientDue = Math.max(0, lineTotal({ quantity: qty, unit_price: unit }) - insurer);
      return {
        kind: String(ln.kind || 'service'),
        description: String(ln.description || 'Service').trim(),
        department: String(ln.department || '').trim(),
        unit_price: unit,
        list_unit_price: unit,
        quantity: qty,
        insurer_amount: insurer,
        patient_due: patientDue,
        catalog_id: ln.catalog_id != null ? parseInt(ln.catalog_id, 10) : null,
      };
    })
    .filter((ln) => ln.description);
}

function applyDiscountTax(subtotal, discountPct, taxPct) {
  const sub = Math.max(0, parseFloat(subtotal) || 0);
  const disc = Math.min(100, Math.max(0, parseFloat(discountPct) || 0));
  const tax = Math.min(100, Math.max(0, parseFloat(taxPct) || 0));
  const afterDiscount = sub - Math.round(sub * (disc / 100) * 100) / 100;
  const total = afterDiscount + Math.round(afterDiscount * (tax / 100) * 100) / 100;
  return Math.round(total * 100) / 100;
}

function parseIsoDate(raw, fallback) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return fallback;
}

async function findPatientByBillToName(pool, billTo) {
  const name = String(billTo || '').trim();
  if (!name) return 0;
  const active = patientActiveWhere('p', pool);
  const fullNameExpr =
    pool?.driver === 'postgres'
      ? `LOWER(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')))`
      : `LOWER(TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))))`;

  const [[exact]] = await pool
    .query(
      `SELECT p.id FROM tbl_patient p
       WHERE ${active}
         AND (
           ${fullNameExpr} = LOWER(?)
           OR LOWER(TRIM(COALESCE(p.patient_code, ''))) = LOWER(?)
         )
       ORDER BY p.id DESC
       LIMIT 1`,
      [name, name]
    )
    .catch(() => [[null]]);
  if (exact?.id) return parseInt(exact.id, 10) || 0;

  const like = `%${name.replace(/[%_\\]/g, ' ').trim()}%`;
  const likeExpr =
    pool?.driver === 'postgres'
      ? `${fullNameExpr} LIKE LOWER(?)`
      : `LOWER(TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, '')))) LIKE LOWER(?)`;

  const [rows] = await pool
    .query(
      `SELECT p.id FROM tbl_patient p
       WHERE ${active}
         AND ${likeExpr}
       ORDER BY p.id DESC
       LIMIT 2`,
      [like]
    )
    .catch(() => [[]]);
  if (Array.isArray(rows) && rows.length === 1 && rows[0]?.id) {
    return parseInt(rows[0].id, 10) || 0;
  }
  return 0;
}

async function getOrCreateCorporateBillingPatient(pool, facilityId) {
  const active = patientActiveWhere('p', pool);
  const [[existing]] = await pool
    .query(
      `SELECT p.id FROM tbl_patient p
       WHERE ${active}
         AND LOWER(TRIM(COALESCE(p.patient_code, ''))) = LOWER(?)
       LIMIT 1`,
      [CORPORATE_PATIENT_CODE]
    )
    .catch(() => [[null]]);
  if (existing?.id) return parseInt(existing.id, 10) || 0;

  const statusVal = pool?.driver === 'postgres' ? true : 1;
  const [ins] = await pool
    .query(
      `INSERT INTO tbl_patient
        (facility_id, first_name, last_name, patient_code, patient_type, status, created_at)
       VALUES (?, 'Corporate', 'Billing Account', ?, 'corporate', ?, NOW())`,
      [facilityId, CORPORATE_PATIENT_CODE, statusVal]
    )
    .catch(() => [null]);

  if (ins?.insertId) return parseInt(ins.insertId, 10) || 0;

  const [[retry]] = await pool
    .query(
      `SELECT p.id FROM tbl_patient p
       WHERE LOWER(TRIM(COALESCE(p.patient_code, ''))) = LOWER(?)
       LIMIT 1`,
      [CORPORATE_PATIENT_CODE]
    )
    .catch(() => [[null]]);
  return retry?.id ? parseInt(retry.id, 10) || 0 : 0;
}

async function resolvePatientId(pool, input, { facilityId = 1 } = {}) {
  const explicit = parseInt(String(input.patient_id), 10) || 0;
  if (explicit > 0) {
    const active = patientActiveWhere('p', pool);
    const [[row]] = await pool
      .query(`SELECT p.id FROM tbl_patient p WHERE p.id = ? AND ${active} LIMIT 1`, [explicit])
      .catch(() => [[null]]);
    if (row?.id) return parseInt(row.id, 10) || 0;
  }

  const billTo = String(input.bill_to_name || '').trim();
  if (!billTo) return 0;

  const matched = await findPatientByBillToName(pool, billTo);
  if (matched > 0) return matched;

  return getOrCreateCorporateBillingPatient(pool, facilityId);
}

/**
 * Create a pending invoice (payment ticket) from cashier billing workspace.
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} input
 * @param {object} session
 */
async function createCashierInvoice(pool, input, session) {
  await ensureCashierInvoiceSchema(pool);

  const fid = parseInt(String(session.facilityId || 1), 10) || 1;
  const userId = parseInt(String(session.userId || session.user?.id || 0), 10) || 0;
  const serviceCategory = resolveServiceCategory(input);
  const category = serviceCategory === 'pharmacy' ? 'pharmacy' : 'service';
  const lines = normalizeLines(input.lines);
  const billToName = String(input.bill_to_name || '').trim().slice(0, 200);
  const billToContact = String(input.bill_to_contact || '').trim().slice(0, 200);
  const notes = String(input.notes || '').trim().slice(0, 500);
  const claimStatus = String(input.claim_status || 'not_claimed').toLowerCase();
  const invoiceStatus = String(input.invoice_status || 'sent').toLowerCase() === 'draft' ? 'draft' : 'sent';
  const issueDate = parseIsoDate(input.issue_date, new Date().toISOString().slice(0, 10));
  let dueDate = parseIsoDate(input.due_date, null);
  if (!dueDate) {
    const d = new Date(`${issueDate}T12:00:00`);
    d.setDate(d.getDate() + 30);
    dueDate = d.toISOString().slice(0, 10);
  }
  const discountPct = parseFloat(input.discount_pct) || 0;
  const taxPct = parseFloat(input.tax_pct) || 0;

  const patientIdEarly = parseInt(String(input.patient_id), 10) || 0;
  if (!billToName && patientIdEarly < 1) {
    return { ok: false, error: 'Bill to (patient / company) is required.', status: 400 };
  }
  if (!lines.length) return { ok: false, error: 'Add at least one line item.', status: 400 };

  const pricedLines = lines.filter((ln) => ln.unit_price > 0);
  if (!pricedLines.length) {
    return { ok: false, error: 'Each line item needs a unit price (description, qty, unit price).', status: 400 };
  }

  const patientId = await resolvePatientId(pool, input, { facilityId: fid });
  if (patientId < 1) {
    return {
      ok: false,
      error: 'Could not link this invoice to a patient record. Register the patient first or try again.',
      status: 400,
    };
  }

  let resolvedBillTo = billToName;
  if (!resolvedBillTo) {
    const [[pRow]] = await pool.query(
      'SELECT first_name, last_name, patient_code FROM tbl_patient WHERE id = ? LIMIT 1',
      [patientId]
    );
    const code = String(pRow?.patient_code || '').trim();
    if (code === CORPORATE_PATIENT_CODE) {
      resolvedBillTo = billToName || 'Corporate billing';
    } else {
      resolvedBillTo = `${pRow?.first_name || ''} ${pRow?.last_name || ''}`.trim();
    }
  }

  const subtotal = pricedLines.reduce((s, ln) => s + lineTotal(ln), 0);
  const total = applyDiscountTax(subtotal, discountPct, taxPct);
  if (total <= 0) return { ok: false, error: 'Invoice total must be greater than zero.', status: 400 };

  const kind = codeKindForCategory(serviceCategory);
  const ticketCode = await allocateUniquePaymentCode(pool, pricedLines.length ? pricedLines : kind);

  const validClaims = new Set(['not_claimed', 'claimed', 'canceled', 'denied']);
  const claim = validClaims.has(claimStatus) ? claimStatus : 'not_claimed';

  const [ins] = await pool.query(
    `INSERT INTO tbl_payment_ticket
     (facility_id, ticket_code, patient_id, status, total_amount, amount_paid, lines_json,
      ticket_category, claim_status, notes, bill_to_name, bill_to_contact,
      issue_date, due_date, discount_pct, tax_pct, invoice_status, created_by, created_at)
     VALUES (?, ?, ?, 'pending', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fid,
      ticketCode,
      patientId,
      total,
      JSON.stringify(pricedLines),
      category,
      claim,
      notes || null,
      resolvedBillTo || null,
      billToContact || null,
      issueDate,
      dueDate,
      discountPct,
      taxPct,
      invoiceStatus,
      userId,
      `${issueDate} 00:00:00`,
    ]
  );

  return {
    ok: true,
    ticket_id: ins.insertId,
    ticket_code: ticketCode,
    total_amount: total,
    category,
    service_category: serviceCategory,
    invoice_status: invoiceStatus,
  };
}

module.exports = { createCashierInvoice, normalizeLines };
