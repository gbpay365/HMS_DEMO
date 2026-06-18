'use strict';

const { allocateUniquePaymentCode } = require('./paymentTicketCode');
const { ensureCashierInvoiceSchema } = require('./ensureCashierInvoiceSchema');

const VALID_SERVICE_CATEGORIES = new Set([
  'consultation',
  'laboratory',
  'radiology',
  'maternity',
  'surgery',
  'hospitalisation',
  'pharmacy',
]);

function resolveServiceCategory(input) {
  const fromBody = String(input.service_category || input.service_type || '').toLowerCase().trim();
  if (VALID_SERVICE_CATEGORIES.has(fromBody)) return fromBody;
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
    .filter((ln) => ln.description && ln.unit_price >= 0);
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
  const patientId = parseInt(String(input.patient_id), 10) || 0;
  const serviceCategory = resolveServiceCategory(input);
  const category = serviceCategory === 'pharmacy' ? 'pharmacy' : 'service';
  const lines = normalizeLines(input.lines);
  const notes = String(input.notes || '').trim().slice(0, 500);
  const claimStatus = String(input.claim_status || 'not_claimed').toLowerCase();

  if (patientId < 1) return { ok: false, error: 'Patient is required.', status: 400 };
  if (!lines.length) return { ok: false, error: 'Add at least one line item.', status: 400 };

  const [[pat]] = await pool.query('SELECT id FROM tbl_patient WHERE id = ? AND status = 1 LIMIT 1', [patientId]);
  if (!pat) return { ok: false, error: 'Patient not found.', status: 404 };

  const total = lines.reduce((s, ln) => s + lineTotal(ln), 0);
  if (total <= 0) return { ok: false, error: 'Invoice total must be greater than zero.', status: 400 };

  const kind = codeKindForCategory(serviceCategory);
  const ticketCode = await allocateUniquePaymentCode(pool, lines.length ? lines : kind);

  const validClaims = new Set(['not_claimed', 'claimed', 'canceled', 'denied']);
  const claim = validClaims.has(claimStatus) ? claimStatus : 'not_claimed';

  const [ins] = await pool.query(
    `INSERT INTO tbl_payment_ticket
     (facility_id, ticket_code, patient_id, status, total_amount, amount_paid, lines_json,
      ticket_category, claim_status, notes, created_by, created_at)
     VALUES (?, ?, ?, 'pending', ?, 0, ?, ?, ?, ?, ?, NOW())`,
    [fid, ticketCode, patientId, total, JSON.stringify(lines), category, claim, notes || null, userId]
  );

  return {
    ok: true,
    ticket_id: ins.insertId,
    ticket_code: ticketCode,
    total_amount: total,
    category,
    service_category: serviceCategory,
  };
}

module.exports = { createCashierInvoice, normalizeLines };
