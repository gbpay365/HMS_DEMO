'use strict';

/**
 * Internal business-rule APIs for HMS_Python and cross-UI parity.
 * Protected by INTERNAL_API_KEY env (header X-HMS-Internal-Key).
 */
module.exports = function internalBusinessRulesRoutes(app, pool) {
  const clinicalBusinessRules = require('../lib/clinicalBusinessRules');
  const { findDuplicatePatient } = require('../lib/patientDuplicate');
  const followUpConsultation = require('../lib/followUpConsultation');
  const { authorizeLabTest } = require('../lib/authorizeLabTest');
  const paymentValidity = require('../lib/paymentValidity');

  const expectedKey = String(process.env.INTERNAL_API_KEY || '').trim();

  function requireInternalKey(req, res, next) {
    if (!expectedKey) {
      return res.status(503).json({
        ok: false,
        error: 'Internal API disabled — set INTERNAL_API_KEY on HMS_JS.',
        code: 'internal_api_disabled',
      });
    }
    const got = String(req.headers['x-hms-internal-key'] || req.query.key || '').trim();
    if (got !== expectedKey) {
      return res.status(403).json({ ok: false, error: 'Invalid internal API key.', code: 'forbidden' });
    }
    return next();
  }

  app.post('/internal/validate-consultation', requireInternalKey, async (req, res) => {
    try {
      const visitId = parseInt(String(req.body.opd_visit_id || req.body.visit_id || ''), 10) || 0;
      const fid = parseInt(String(req.body.facility_id || ''), 10) || 1;
      if (visitId < 1) {
        return res.status(400).json({ ok: false, error: 'opd_visit_id required.', code: 'bad_request' });
      }
      const [[visit]] = await pool
        .query('SELECT * FROM tbl_opd_visit WHERE id = ? LIMIT 1', [visitId])
        .catch(() => [[null]]);
      if (!visit) {
        return res.status(404).json({ ok: false, error: 'Visit not found.', code: 'not_found' });
      }
      const gate = await clinicalBusinessRules.assertOpdVisitConsultationPayment(pool, visit, fid);
      return res.json({ ok: !!gate.ok, error: gate.error || null, code: gate.code || null, meta: gate.meta || null });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Server error', code: 'server_error' });
    }
  });

  app.post('/internal/check-duplicate-patient', requireInternalKey, async (req, res) => {
    try {
      const b = req.body || {};
      const dup = await findDuplicatePatient(pool, {
        first_name: b.first_name,
        last_name: b.last_name,
        phone: b.phone,
        dob: b.dob,
        age_years: b.age_years,
        age_only_registration: b.age_only_registration,
        excludeId: b.exclude_id || b.excludeId,
      });
      return res.json({ ok: true, duplicate: dup, is_duplicate: !!dup });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Server error', code: 'server_error' });
    }
  });

  app.post('/internal/diagnostic-new-test-gate', requireInternalKey, async (req, res) => {
    try {
      const pid = parseInt(String(req.body.patient_id || ''), 10) || 0;
      const dept = String(req.body.dept || 'laboratory');
      const fid = parseInt(String(req.body.facility_id || ''), 10) || 1;
      const gate = await clinicalBusinessRules.assertDiagnosticNewTestAllowed(pool, pid, dept, fid);
      return res.json({ ok: !!gate.ok, error: gate.error || null, code: gate.code || null, meta: gate.meta || null });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Server error', code: 'server_error' });
    }
  });

  app.post('/internal/opd-prescription-gate', requireInternalKey, async (req, res) => {
    try {
      const pid = parseInt(String(req.body.patient_id || ''), 10) || 0;
      const fid = parseInt(String(req.body.facility_id || ''), 10) || 1;
      const did = parseInt(String(req.body.doctor_employee_id || req.body.doctor_id || ''), 10) || 0;
      const gate = await clinicalBusinessRules.assertOpdPrescriptionAllowed(pool, fid, pid, did);
      return res.json({ ok: !!gate.ok, error: gate.error || null, code: gate.code || null, meta: gate.meta || null });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Server error', code: 'server_error' });
    }
  });

  app.post('/internal/follow-up-eligible', requireInternalKey, async (req, res) => {
    try {
      const pid = parseInt(String(req.body.patient_id || ''), 10) || 0;
      const fid = parseInt(String(req.body.facility_id || ''), 10) || 1;
      const did = parseInt(String(req.body.doctor_employee_id || ''), 10) || 0;
      const gate = await followUpConsultation.assertFollowUpEligible(pool, fid, pid, did);
      return res.json({
        ok: !!gate.ok,
        errors: gate.errors || [],
        meta: gate.meta || null,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Server error', code: 'server_error' });
    }
  });

  app.post('/internal/authorize-lab-test', requireInternalKey, async (req, res) => {
    try {
      const b = req.body || {};
      const auth = await authorizeLabTest(pool, {
        patientId: b.patient_id,
        facilityId: b.facility_id,
        dept: b.dept,
        serviceCode: b.service_code,
        opdOrderItemId: b.opd_order_item_id,
        testName: b.test_name,
      });
      return res.json(auth);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Server error', code: 'server_error' });
    }
  });

  app.post('/internal/payment-ticket-validity', requireInternalKey, async (req, res) => {
    try {
      const code = paymentValidity.normalizePaymentCodeInput(req.body.payment_code || req.body.code);
      const fid = parseInt(String(req.body.facility_id || ''), 10) || 1;
      if (!code) {
        return res.status(400).json({ ok: false, error: 'payment_code required.', code: 'bad_request' });
      }
      const tkt = await paymentValidity.findPaidTicketByNormalizedCode(pool, code);
      if (!tkt) {
        return res.json({ ok: false, error: 'No paid ticket for this code.', code: 'no_ticket' });
      }
      const vchk = await paymentValidity.assertPaidTicketValidityForVisit(pool, tkt, code, fid);
      return res.json({ ok: !!vchk.ok, error: vchk.error || null, meta: vchk.meta || null, patient_notice: vchk.patient_notice || null });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Server error', code: 'server_error' });
    }
  });
};
