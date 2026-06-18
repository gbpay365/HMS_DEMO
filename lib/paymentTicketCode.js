'use strict';

const crypto = require('crypto');
const { isConsultDoctorServiceName } = require('./cashierConsultServices');

/** Uppercase alphanumeric without ambiguous 0/O, 1/I/L. */
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Service kind → payment-code prefix (replaces legacy PAY / IPD / EMG-SET). */
const PAYMENT_CODE_PREFIX = {
  consultation: 'CON',
  laboratory: 'LAB',
  radiology: 'RAD',
  pharmacy: 'PHA',
  hospitalisation: 'HOS',
  ipd: 'HOS',
  ipd_settlement: 'HOS',
  ipd_total: 'HOS',
  ipd_balance: 'HOS',
  ipd_deposit: 'HOS',
  emergency: 'EMG',
  emergency_charge: 'EMG',
  emergency_settlement: 'EMG',
  maternity: 'MAT',
  surgery: 'SUR',
  scan: 'RAD',
  service: 'OTH',
  general: 'OTH',
  other: 'OTH',
};

const PRESCRIPTION_SERVICE_KINDS = ['laboratory', 'radiology', 'pharmacy'];

/**
 * @param {number} length
 * @returns {string}
 */
function randomAlphanumeric(length) {
  const n = Math.max(4, Math.min(16, parseInt(String(length), 10) || 8));
  let out = '';
  for (let i = 0; i < n; i += 1) {
    out += CHARSET[crypto.randomInt(0, CHARSET.length)];
  }
  return out;
}

/**
 * @param {number} [length]
 * @returns {string}
 */
function randomDigits(length) {
  const n = Math.max(4, Math.min(8, parseInt(String(length), 10) || 4));
  let out = '';
  for (let i = 0; i < n; i += 1) {
    out += String(crypto.randomInt(0, 10));
  }
  return out;
}

function normalizeKind(kind) {
  const k = String(kind || '').toLowerCase().trim();
  if (k === 'scan') return 'radiology';
  return k;
}

/** @param {string} kind */
function prefixForKind(kind) {
  const k = normalizeKind(kind);
  return PAYMENT_CODE_PREFIX[k] || 'OTH';
}

/** Human-readable label for payment-history / cashier codes list. */
function paymentCodeTypeLabel(prefix, scansLabel) {
  const p = String(prefix || 'OTH').toUpperCase();
  const map = {
    CON: 'Consultation payment',
    LAB: 'Laboratory payment',
    RAD: `${scansLabel || 'Scans & Imaging'} payment`,
    PHA: 'Pharmacy payment',
    MAT: 'Maternity payment',
    SUR: 'Surgery payment',
    OTH: 'Other services payment',
    HOS: 'Hospitalisation payment',
    EMG: 'Emergency Payments (A&E)',
  };
  return map[p] || 'Other services payment';
}

/** @param {unknown} input */
function parseLinesInput(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') {
    try {
      const j = JSON.parse(input);
      return Array.isArray(j) ? j : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

/**
 * Resolve a 2–4 letter service prefix from a kind string or ticket lines.
 * @param {string|object[]|null|undefined} input
 */
function resolvePaymentCodePrefix(input) {
  if (input == null) return 'OTH';

  if (typeof input === 'string') {
    const raw = input.trim();
    if (!raw) return 'OTH';
    const lower = raw.toLowerCase();
    if (PAYMENT_CODE_PREFIX[lower] || PAYMENT_CODE_PREFIX[normalizeKind(lower)]) {
      return prefixForKind(lower);
    }
    if (/^[A-Z]{2,4}$/.test(raw.toUpperCase())) return raw.toUpperCase();
    return 'OTH';
  }

  const lines = parseLinesInput(input);
  if (!lines.length) return 'OTH';

  for (const ln of lines) {
    if (isConsultDoctorServiceName(ln.description)) return 'CON';
    if (normalizeKind(ln.kind) === 'consultation') return 'CON';
  }

  const kinds = new Set();
  for (const ln of lines) {
    let kind = normalizeKind(ln.kind || 'service');
    if (kind === 'service' && isConsultDoctorServiceName(ln.description)) kind = 'consultation';
    kinds.add(kind);
  }

  const isOpdOrderTicket = lines.some((ln) => ln && ln.source_module === 'opd_order_item');
  const rxKindsPresent = PRESCRIPTION_SERVICE_KINDS.filter((k) => kinds.has(k));
  const hasRx = rxKindsPresent.length > 0;

  if (hasRx) {
    if (isOpdOrderTicket) return 'OTH';
    if (rxKindsPresent.length === 1 && kinds.size === 1) {
      return prefixForKind(rxKindsPresent[0]);
    }
    return 'OTH';
  }

  if (kinds.size === 1) return prefixForKind([...kinds][0]);
  return 'OTH';
}

/**
 * Accepts new codes (LAB-4829-K7HM3R9Q) and legacy sequential (LAB-2026-000001).
 * @param {string} code
 * @param {string} [expectedPrefix]
 */
function isPaymentCodeFormat(code, expectedPrefix) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return false;
  const prefix = expectedPrefix ? String(expectedPrefix).trim().toUpperCase() : c.split('-')[0];
  if (!prefix) return false;
  return new RegExp(`^${prefix}-\\d{4}-[A-Z0-9]{4,12}$`).test(c);
}

/**
 * Build a payment code: `{SERVICE}-{4_RANDOM_DIGITS}-{RANDOM_ALPHANUM}`.
 * Examples: CON-4829-K7HM3R9Q, LAB-1038-X2TN8W4P, HOS-7741-J9R4K2LM
 * @param {string|object[]} kindOrLines
 * @param {{ randomLength?: number, digitLength?: number }} [opts]
 */
function formatPaymentCode(kindOrLines, opts) {
  opts = opts || {};
  const prefix = resolvePaymentCodePrefix(kindOrLines);
  const digits = randomDigits(opts.digitLength || 4);
  const random = randomAlphanumeric(opts.randomLength || 8);
  return `${prefix}-${digits}-${random}`;
}

/**
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} db
 * @param {string} code
 */
async function paymentCodeExists(db, code) {
  if (!db || !code) return false;
  const [[ticket]] = await db
    .query('SELECT id FROM tbl_payment_ticket WHERE ticket_code = ? LIMIT 1', [code])
    .catch(() => [[null]]);
  if (ticket && ticket.id) return true;

  const [[adm]] = await db
    .query('SELECT id FROM tbl_admission WHERE ipd_payment_code = ? LIMIT 1', [code])
    .catch(() => [[null]]);
  if (adm && adm.id) return true;

  const [[visit]] = await db
    .query('SELECT id FROM tbl_opd_visit WHERE payment_code = ? LIMIT 1', [code])
    .catch(() => [[null]]);
  if (visit && visit.id) return true;

  const [[oi]] = await db
    .query('SELECT id FROM tbl_opd_order_item WHERE service_code = ? LIMIT 1', [code])
    .catch(() => [[null]]);
  return !!(oi && oi.id);
}

/**
 * After doctor consultation, assign one shared LAB/RAD/PHA code per category.
 * Idempotent: only fills rows with NULL/empty service_code.
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} db
 * @param {number|string} consultationId
 */
async function assignServiceCodesForConsultation(db, consultationId) {
  const cid = parseInt(String(consultationId || ''), 10) || 0;
  if (!cid) return {};
  const out = {};
  for (const kind of PRESCRIPTION_SERVICE_KINDS) {
    const [rows] = await db
      .query(
        `SELECT id FROM tbl_opd_order_item
         WHERE consultation_id=? AND item_type=?
         AND (service_code IS NULL OR service_code='')`,
        [cid, kind]
      )
      .catch(() => [[]]);
    if (!rows || rows.length === 0) continue;
    const code = await allocateUniquePaymentCode(db, kind);
    await db
      .query(
        `UPDATE tbl_opd_order_item SET service_code=?
         WHERE consultation_id=? AND item_type=? AND (service_code IS NULL OR service_code='')`,
        [code, cid, kind]
      )
      .catch(() => {});
    out[kind] = code;
  }
  return out;
}

/**
 * Assign LAB/RAD/PHA codes only to the order lines included in this cashier ticket.
 * Reuses an existing code for the same consultation + item type when present.
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} db
 * @param {number[]} orderItemIds
 */
async function assignServiceCodesForOrderItems(db, orderItemIds) {
  const ids = [...new Set((orderItemIds || []).map((id) => parseInt(String(id), 10) || 0).filter((n) => n > 0))];
  if (!ids.length) return {};

  const [rows] = await db
    .query(
      `SELECT id, consultation_id, item_type, service_code
         FROM tbl_opd_order_item
        WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    )
    .catch(() => [[]]);
  if (!rows || !rows.length) return {};

  const out = {};
  const byConsultType = new Map();
  for (const row of rows) {
    const kind = String(row.item_type || '').toLowerCase();
    if (!PRESCRIPTION_SERVICE_KINDS.includes(kind)) continue;
    const cid = parseInt(String(row.consultation_id || ''), 10) || 0;
    const key = `${cid}:${kind}`;
    if (!byConsultType.has(key)) byConsultType.set(key, []);
    byConsultType.get(key).push(row);
  }

  for (const [key, groupRows] of byConsultType) {
    const [cidStr, kind] = key.split(':');
    const cid = parseInt(cidStr, 10) || 0;
    let code =
      groupRows.map((r) => String(r.service_code || '').trim()).find(Boolean) || null;

    if (!code && cid > 0) {
      const [[existing]] = await db
        .query(
          `SELECT service_code FROM tbl_opd_order_item
           WHERE consultation_id=? AND item_type=?
             AND service_code IS NOT NULL AND TRIM(service_code) <> ''
           LIMIT 1`,
          [cid, kind]
        )
        .catch(() => [[null]]);
      code = existing && existing.service_code ? String(existing.service_code).trim() : null;
    }

    if (!code) {
      code = await allocateUniquePaymentCode(db, kind);
    }

    const updateIds = groupRows
      .filter((r) => !String(r.service_code || '').trim())
      .map((r) => r.id);
    if (updateIds.length) {
      await db
        .query(
          `UPDATE tbl_opd_order_item SET service_code=?
           WHERE id IN (${updateIds.map(() => '?').join(',')})
             AND (service_code IS NULL OR service_code='')`,
          [code, ...updateIds]
        )
        .catch(() => {});
    }
    out[key] = code;
  }

  return out;
}

/**
 * Allocate a unique auto-generated payment code.
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} db
 * @param {string|object[]} kindOrLines — service kind or ticket lines
 * @param {{ maxAttempts?: number, randomLength?: number, digitLength?: number }} [opts]
 * @returns {Promise<string>}
 */
async function allocateUniquePaymentCode(db, kindOrLines, opts) {
  opts = opts || {};
  const maxAttempts = Math.max(3, Math.min(30, parseInt(String(opts.maxAttempts || 12), 10) || 12));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = formatPaymentCode(kindOrLines, {
      randomLength: opts.randomLength || 8,
      digitLength: opts.digitLength || 4,
    });
    if (!(await paymentCodeExists(db, code))) return code;
  }
  throw new Error('Could not allocate a unique payment code. Try again.');
}

module.exports = {
  CHARSET,
  PAYMENT_CODE_PREFIX,
  PRESCRIPTION_SERVICE_KINDS,
  randomAlphanumeric,
  randomDigits,
  prefixForKind,
  paymentCodeTypeLabel,
  isPaymentCodeFormat,
  resolvePaymentCodePrefix,
  formatPaymentCode,
  paymentCodeExists,
  allocateUniquePaymentCode,
  assignServiceCodesForConsultation,
  assignServiceCodesForOrderItems,
};
