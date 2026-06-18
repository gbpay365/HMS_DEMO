'use strict';

const hmsI18n = require('./hmsI18n');

/** Translation keys for payment code errors (namespace errors). */
const KEYS = {
  MISSING: 'payment.missing',
  NOT_FOUND: 'payment.not_found',
  NOT_PAID: 'payment.not_paid',
  PENDING: 'payment.pending',
  EXPIRED: 'payment.expired',
  ALREADY_VALIDATED: 'payment.already_validated',
  USAGE_LIMIT: 'payment.usage_limit',
  PATIENT_MISSING: 'payment.patient_missing',
  NOT_VALID: 'payment.not_valid',
};

/** English fallbacks when i18n is unavailable. */
const FALLBACK = {
  MISSING: 'Enter a payment code.',
  NOT_FOUND: 'No payment ticket matches this code.',
  NOT_PAID: 'This ticket is not paid.',
  PENDING: 'Payment is still pending at cashier.',
  EXPIRED: 'This code has expired.',
  ALREADY_VALIDATED: 'This code has already been validated.',
  USAGE_LIMIT: 'This code has reached its usage limit.',
  PATIENT_MISSING: 'Patient record not found for this ticket.',
  NOT_VALID: 'This payment code is not valid.',
};

function msg(name, lang) {
  const key = KEYS[name];
  if (!key) return FALLBACK[name] || name;
  return hmsI18n.t(key, lang || hmsI18n.DEFAULT_LANG, { ns: 'errors', defaultValue: FALLBACK[name] });
}

function validSummary(meta, lang) {
  if (!meta) return msg('NOT_VALID', lang);
  const max = meta.max_uses != null ? Number(meta.max_uses) : 1;
  const used = meta.uses_so_far != null ? Number(meta.uses_so_far) : 0;
  const left = Math.max(0, max - used);
  const hmsFormatDate = require('./hmsFormatDate');
  const expRaw = String(meta.expires_on || meta.expires_display || '');
  const expDisplay = expRaw ? hmsFormatDate.formatDisplayDate(expRaw) : '—';
  const unit = hmsI18n.t(left === 1 ? 'payment.use_one' : 'payment.use_other', lang || hmsI18n.DEFAULT_LANG, {
    ns: 'errors',
    defaultValue: left === 1 ? 'use' : 'uses',
  });
  return hmsI18n.t('payment.valid_summary', lang || hmsI18n.DEFAULT_LANG, {
    ns: 'errors',
    date: expDisplay,
    count: left,
    unit,
    defaultValue: `Valid until ${expDisplay} · ${left} ${unit} remaining.`,
  });
}

module.exports = {
  KEYS,
  FALLBACK,
  msg,
  validSummary,
};
