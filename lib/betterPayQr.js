'use strict';

const betterPayConfig = require('./betterPayConfig');
const hmsCountry = require('./hmsCountry');
const { getCashierPaymentMethods } = require('./cashierPaymentMethods');

/** Payment methods offered at cashier (country-aware). */
const CASHIER_PAYMENT_METHODS = getCashierPaymentMethods();

const NOT_CONFIGURED_MSG =
  'BetterPay partner ID is missing. Set it under Accounting → Settings → Payments, in config/betterpay.json, or BETTERPAY_PARTNER_IDENTIFIER in .env.';

/** Map legacy stored labels to current cashier values. */
function normalizePaymentMethod(method) {
  const s = String(method || '').trim();
  if (hmsCountry.isNigeria) {
    if (s === 'Bank' || s === 'Transfer') return 'Bank Transfer';
    if (s === 'Card' || s === 'CARD' || s === 'Debit Card') return 'POS';
    if (s === 'Mobile Money' || s === 'MOMO' || s === 'Mobile money') return 'USSD';
    if (s === 'Orange Money' || s === 'OM') return 'USSD';
    if (s === 'QR Code' || s === 'BetterPay') return 'Paystack';
    return s;
  }
  if (s === 'Mobile Money') return 'MOMO';
  if (s === 'Orange Money') return 'OM';
  if (s === 'QR Code') return 'BetterPay';
  return s;
}

function describeBillLines(lines) {
  if (!Array.isArray(lines) || !lines.length) return 'Hospital payment';
  const parts = lines
    .map((ln) => String((ln && (ln.description || ln.kind)) || '').trim())
    .filter(Boolean);
  if (!parts.length) return 'Hospital payment';
  const joined = parts.slice(0, 3).join(', ');
  return parts.length > 3 ? `${joined}…` : joined;
}

function patientFileNumber(patient) {
  if (!patient) return '';
  const code = String(patient.patient_code || '').trim();
  if (code) return code;
  const id = parseInt(patient.patient_id || patient.id, 10);
  if (Number.isFinite(id) && id > 0) return `P-${String(id).padStart(5, '0')}`;
  return '';
}

function patientFullName(patient) {
  if (!patient) return '';
  return [patient.first_name, patient.last_name].filter(Boolean).join(' ').trim();
}

/**
 * Build BetterPay payment URL.
 * @see https://betterpayme.com/pay/{PARTNER}?ref=&amount=&name=&phone=&patient_id=&description=
 */
async function buildBetterPayPaymentUrl(pool, opts = {}) {
  const cfg = await betterPayConfig.resolve(pool);
  const partner = String(opts.partnerIdentifier || cfg.partner || '').trim();
  if (!partner) return null;

  const base = String(cfg.baseUrl || 'https://betterpayme.com/pay').replace(/\/$/, '');
  const pathUrl = `${base}/${encodeURIComponent(partner)}`;
  const params = new URLSearchParams();

  if (opts.ref != null && String(opts.ref).trim()) params.set('ref', String(opts.ref).trim());
  const amount = Number(opts.amount);
  if (Number.isFinite(amount) && amount > 0) params.set('amount', String(Math.round(amount)));
  const name = patientFullName(opts) || String(opts.name || '').trim();
  if (name) params.set('name', name);
  const phone = String(opts.phone || '').trim();
  if (phone) params.set('phone', phone);
  const patientId = patientFileNumber(opts) || String(opts.patientId || '').trim();
  if (patientId) params.set('patient_id', patientId);
  const description = String(opts.description || describeBillLines(opts.lines) || '').trim();
  if (description) params.set('description', description.slice(0, 500));

  const qs = params.toString();
  return qs ? `${pathUrl}?${qs}` : pathUrl;
}

async function buildFromTicket(pool, ticket, opts = {}) {
  if (!ticket) return null;
  const lines = ticket.lines || (ticket.lines_json ? JSON.parse(ticket.lines_json) : []);
  return buildBetterPayPaymentUrl(pool, {
    partnerIdentifier: opts.partnerIdentifier,
    ref: ticket.ticket_code || ticket.id,
    amount: ticket.total_amount,
    first_name: ticket.first_name,
    last_name: ticket.last_name,
    phone: ticket.phone,
    patient_code: ticket.patient_code,
    patient_id: ticket.patient_id,
    lines,
    description: opts.description,
  });
}

async function isBetterPayConfigured(pool) {
  return betterPayConfig.isConfigured(pool);
}

module.exports = {
  CASHIER_PAYMENT_METHODS,
  NOT_CONFIGURED_MSG,
  normalizePaymentMethod,
  describeBillLines,
  patientFileNumber,
  patientFullName,
  buildBetterPayPaymentUrl,
  buildFromTicket,
  isBetterPayConfigured,
};
