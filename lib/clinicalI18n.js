'use strict';

const { flashT } = require('./flashI18n');

/** Map clinicalBusinessRules / workflow codes to errors.json flash keys. */
const CODE_TO_FLASH = {
  no_code: 'flash.consult_payment_required',
  no_ticket: 'flash.consult_payment_required',
  invalid_code: 'flash.consult_payment_required',
  no_payment: 'flash.vitals_payment_required',
  doctor_forbidden: 'flash.vitals_doctor_forbidden',
  vitals_locked: 'flash.vitals_already_recorded',
  no_visit: 'flash.vitals_no_active_visit',
  visit_not_found: 'flash.visit_not_found',
  no_patient: 'flash.select_patient_first',
  no_consultation: 'flash.prescription_needs_consult',
  er_no_consultation: 'flash.er_prescription_needs_consult',
  payment_or_request: 'flash.lab_rad_payment_or_request',
  alert_only: 'flash.lab_rad_alert_only',
  expired_ticket: 'flash.lab_rad_payment_or_request',
  invalid_args: 'flash.invalid_consultation_data',
  status_not_allowed: 'flash.vitals_retake_status_blocked',
  no_vitals: 'flash.vitals_retake_none',
};

/**
 * Translate a clinical gate result or code for flash / page errors.
 * @param {import('express').Response} res
 * @param {string|{ code?: string, error?: string }} gateOrCode
 * @param {object} [opts]
 */
function clinicalMsgT(res, gateOrCode, opts = {}) {
  const code =
    gateOrCode && typeof gateOrCode === 'object'
      ? String(gateOrCode.code || '').trim()
      : String(gateOrCode || '').trim();
  const key = CODE_TO_FLASH[code];
  if (key) return flashT(res, key, opts);
  if (gateOrCode && typeof gateOrCode === 'object' && gateOrCode.error) {
    return String(gateOrCode.error);
  }
  return flashT(res, opts.fallbackKey || 'flash.operation_failed', opts);
}

function opdVitalsRequiredMessage(res, patientFirst, patientLast) {
  const name = `${patientFirst || ''} ${patientLast || ''}`.trim();
  return flashT(res, 'flash.vitals_required_before_consult', {
    name: name || flashT(res, 'flash.this_patient'),
  });
}

module.exports = {
  clinicalMsgT,
  opdVitalsRequiredMessage,
};
