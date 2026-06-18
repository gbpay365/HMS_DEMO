'use strict';

const {
  normalizePaymentCodeInput,
  findPaidTicketByNormalizedCode,
  assertPaidTicketValidityForVisit,
  inferPaymentKind,
  seedMissingPaymentValidityRules,
} = require('./paymentValidity');

const TELE_KINDS = new Set(['telemedicine', 'consultation', 'general']);

async function ensureAppointmentPaymentSchema(pool) {
  await pool.query('ALTER TABLE tbl_appointment ADD COLUMN payment_code VARCHAR(64) DEFAULT NULL').catch(() => {});
  await pool.query('ALTER TABLE tbl_appointment ADD COLUMN payment_ticket_id INT DEFAULT NULL').catch(() => {});
  await pool
    .query('CREATE INDEX idx_appt_payment_code ON tbl_appointment (payment_code(32))')
    .catch(() => {});
}

function normSqlExpr(col) {
  return `
  UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
   TRIM(IFNULL(${col},'')),
   ' ', ''),
   '\u2010', '-'),
   '\u2011', '-'),
   '\u2012', '-'),
   '\u2013', '-'),
   '\u2014', '-'),
   '\u2015', '-'),
   '\u2212', '-'),
   '\u00AD', ''))
 `;
}

/**
 * Active portal/staff appointments consuming a payment code allowance.
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} codeRaw
 * @param {{ excludeAppointmentId?: number }} [opts]
 */
async function countAppointmentUsesForCode(pool, codeRaw, opts) {
  opts = opts || {};
  const code = normalizePaymentCodeInput(codeRaw);
  if (!code) return 0;
  const excludeId = parseInt(String(opts.excludeAppointmentId || ''), 10) || 0;
  const excludeSql = excludeId > 0 ? ' AND id <> ?' : '';
  const params = excludeId > 0 ? [code, excludeId] : [code];
  const [rows] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_appointment
        WHERE ${normSqlExpr('payment_code')} = ?
          AND (
            portal_state IN ('pending','confirmed')
            OR status IN (1, 3)
          )
          AND (portal_state IS NULL OR portal_state NOT IN ('declined','cancelled'))
          AND status NOT IN (0, 2)${excludeSql}`,
      params
    )
    .catch(() => [[{ c: 0 }]]);
  return parseInt(String(rows[0]?.c ?? 0), 10) || 0;
}

/**
 * @param {object} ticket
 */
function ticketKindAllowedForTele(ticket) {
  const kind = inferPaymentKind(ticket.lines_json);
  return TELE_KINDS.has(kind);
}

/**
 * Validate a paid ticket for telemedicine appointment booking or modification.
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ patientId: number, paymentCode: string, facilityId?: number, excludeAppointmentId?: number, lang?: string }} opts
 */
async function validatePaymentForTeleAppointment(pool, opts) {
  const patientId = parseInt(String(opts.patientId || ''), 10) || 0;
  const code = normalizePaymentCodeInput(opts.paymentCode);
  const facilityId = Number(opts.facilityId) || 1;
  const excludeAppointmentId = parseInt(String(opts.excludeAppointmentId || ''), 10) || 0;
  const lang = opts.lang || 'en';

  if (!code) {
    return { ok: false, error: 'A payment code from the cashier is required for telemedicine appointments.' };
  }
  if (!patientId) {
    return { ok: false, error: 'Patient is required.' };
  }

  await seedMissingPaymentValidityRules(pool, facilityId);
  await ensureAppointmentPaymentSchema(pool);

  const ticket = await findPaidTicketByNormalizedCode(pool, code);
  if (!ticket) {
    return {
      ok: false,
      error:
        'No payment ticket matches this code. Pay for teleconsultation at the cashier first, then enter the code from your receipt.',
    };
  }

  if (parseInt(ticket.patient_id, 10) !== patientId) {
    return { ok: false, error: 'This payment code belongs to a different patient.' };
  }

  if (!ticketKindAllowedForTele(ticket)) {
    return {
      ok: false,
      error: 'This payment code is not for a consultation or telemedicine service. Use a consultation prepayment receipt.',
    };
  }

  const base = await assertPaidTicketValidityForVisit(pool, ticket, code, facilityId, {
    lang,
    excludeVisitId: 0,
  });
  if (!base.ok) return base;

  const apptUses = await countAppointmentUsesForCode(pool, code, { excludeAppointmentId });
  const maxUses = base.meta?.max_uses != null ? Number(base.meta.max_uses) : 1;
  if (apptUses >= maxUses) {
    return {
      ok: false,
      error:
        'This payment code has already been used for the maximum number of telemedicine appointments allowed. Contact the cashier for a new code.',
    };
  }

  return {
    ok: true,
    code,
    ticketId: parseInt(ticket.id, 10) || null,
    meta: {
      ...base.meta,
      appointment_uses: apptUses,
      remaining_appointment_slots: Math.max(0, maxUses - apptUses),
    },
    validity_message: base.validity_message,
  };
}

/**
 * Payment code required for telemedicine only (in-person portal booking optional).
 * @param {string} visitType
 */
function requiresPaymentCode(visitType) {
  return String(visitType || '').trim().toLowerCase() === 'telemedicine';
}

/**
 * Ensure linked payment is still valid before patient cancel/reschedule.
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} appt
 */
async function assertPaymentStillValidForModify(pool, appt) {
  const code = String(appt.payment_code || '').trim();
  if (!code) return { ok: true };
  const patientId = parseInt(appt.patient_id, 10) || 0;
  return validatePaymentForTeleAppointment(pool, {
    patientId,
    paymentCode: code,
    facilityId: appt.facility_id || 1,
    excludeAppointmentId: appt.id,
  });
}

module.exports = {
  ensureAppointmentPaymentSchema,
  validatePaymentForTeleAppointment,
  countAppointmentUsesForCode,
  requiresPaymentCode,
  assertPaymentStillValidForModify,
  normalizePaymentCodeInput,
};
