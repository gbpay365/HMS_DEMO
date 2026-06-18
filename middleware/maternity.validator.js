'use strict';

function validationRedirectTarget(req, fallbackPath) {
  const referer = String(req.get('Referer') || '').trim();
  if (referer) {
    try {
      const u = new URL(referer);
      if (u.pathname.startsWith('/maternity')) {
        return u.pathname + u.search;
      }
    } catch (_) {
      /* ignore malformed referer */
    }
  }
  const chartId = parseInt(req.params && req.params.id, 10) || 0;
  if (chartId > 0) {
    const tab = String(req.query && req.query.tab ? req.query.tab : '').trim();
    return tab ? `/maternity/chart/${chartId}?tab=${encodeURIComponent(tab)}` : `/maternity/chart/${chartId}`;
  }
  return fallbackPath || '/maternity';
}

function sendValidationErrors(req, res, errors, wantsJson, fallbackPath) {
  if (wantsJson) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors });
  }
  const msg = errors.map((e) => e.message).join('; ');
  let target = validationRedirectTarget(req, fallbackPath);
  const pid = req.body && req.body.patient_id ? String(req.body.patient_id).trim() : '';
  if (target.includes('/maternity/register') && pid && !/[?&]patient_id=/.test(target)) {
    target += (target.includes('?') ? '&' : '?') + `patient_id=${encodeURIComponent(pid)}`;
  }
  const sep = target.includes('?') ? '&' : '?';
  return res.redirect(302, `${target}${sep}err=${encodeURIComponent(msg)}`);
}

function validate(req, res, next, rules, fallbackPath) {
  const errors = [];
  const b = req.body || {};
  for (const rule of rules) {
    const err = rule(b, req);
    if (err) errors.push({ field: err.field, message: err.message });
  }
  if (errors.length) {
    const wantsJson =
      req.xhr ||
      String(req.get('accept') || '').includes('application/json') ||
      String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';
    return sendValidationErrors(req, res, errors, wantsJson, fallbackPath);
  }
  next();
}

exports.validateMaternityPatient = (req, res, next) =>
  validate(
    req,
    res,
    next,
    [
    (b) => (!b.patient_id ? { field: 'patient_id', message: 'Patient is required' } : null),
    (b) => {
      if (!b.lmp) return null;
      const lmp = new Date(b.lmp);
      if (Number.isNaN(lmp.getTime())) return { field: 'lmp', message: 'Invalid LMP date' };
      if (lmp > new Date()) return { field: 'lmp', message: 'LMP cannot be in the future' };
      return null;
    },
    ],
    '/maternity/register'
  );

exports.validateANCVisit = (req, res, next) =>
  validate(req, res, next, [
    (b) =>
      !b.maternity_patient_id
        ? { field: 'maternity_patient_id', message: 'Maternity patient is required' }
        : null,
  ]);

exports.validateLaborRecord = (req, res, next) =>
  validate(req, res, next, [
    (b) =>
      !b.maternity_patient_id
        ? { field: 'maternity_patient_id', message: 'Maternity patient is required' }
        : null,
    (b) =>
      !b.admission_type
        ? { field: 'admission_type', message: 'Admission type is required' }
        : null,
  ]);

exports.validateDelivery = (req, res, next) =>
  validate(req, res, next, [
    (b) => (!b.labor_record_id ? { field: 'labor_record_id', message: 'Labor record is required' } : null),
    (b) => (!b.delivery_type ? { field: 'delivery_type', message: 'Delivery type is required' } : null),
    (b) => (!b.outcome ? { field: 'outcome', message: 'Outcome is required' } : null),
  ]);

exports.validateNewborn = (req, res, next) =>
  validate(req, res, next, [
    (b) => (!b.delivery_record_id ? { field: 'delivery_record_id', message: 'Delivery record is required' } : null),
    (b) => (!b.sex ? { field: 'sex', message: 'Sex is required' } : null),
    (b) => (!b.birth_weight ? { field: 'birth_weight', message: 'Birth weight is required' } : null),
  ]);

exports.validatePostnatal = (req, res, next) =>
  validate(req, res, next, [
    (b) =>
      !b.maternity_patient_id
        ? { field: 'maternity_patient_id', message: 'Maternity patient is required' }
        : null,
    (b) => (!b.visit_type ? { field: 'visit_type', message: 'Visit type is required' } : null),
  ]);
