'use strict';

/**
 * Maternity module — SSR pages under /maternity/* plus REST integration API under /api/maternity/*.
 * Primary UI uses server-rendered forms; JSON API is for mobile/integrations (see docs/INTEGRATION-APIS.md).
 */
const createController = require('../controllers/maternity.controller');
const v = require('../middleware/maternity.validator');
const mat = require('../lib/hmsMaternity');
const { invokeMaternityCtrl } = require('../lib/maternityRouteHelpers');

module.exports = function (app, pool, requireAuth, requirePerm) {
  const ctrl = createController(pool);
  function _rp(...keys) {
    if (typeof requirePerm === 'function') return requirePerm(...keys);
    return (req, res, next) => next();
  }
  const view = _rp('maternity.read', 'maternity.write', 'clinical.read', 'clinical.write', 'nursing.read', 'nursing.write');
  const mutate = _rp('maternity.write', 'clinical.write', 'nursing.write');
  const uid = (req) => parseInt(req.session?.user?.id || req.session?.userId, 10) || null;

  const wantsJson = (req) =>
    req.xhr ||
    String(req.get('accept') || '').includes('application/json') ||
    (req.path || '').startsWith('/api/maternity');

  function flashRedirect(req, res, url, msg, err) {
    const q = err ? `err=${encodeURIComponent(err)}` : `msg=${encodeURIComponent(msg)}`;
    return res.redirect(url + (url.includes('?') ? '&' : '?') + q);
  }

  function matPage(extra) {
    return Object.assign({ maternityOdooApp: true }, extra || {});
  }

  async function searchMaternityPatients(name, phone, limit = 25) {
    const nameQ = String(name || '').trim();
    const phoneQ = String(phone || '').trim();
    if (!nameQ && !phoneQ) return [];

    const params = [];
    const parts = ['COALESCE(status, 1) = 1'];
    if (nameQ) {
      const like = `%${nameQ.toLowerCase()}%`;
      parts.push(
        `(LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ? OR LOWER(CONCAT(first_name, ' ', last_name)) LIKE ? OR LOWER(CONCAT(last_name, ' ', first_name)) LIKE ?)`
      );
      params.push(like, like, like, like);
    }
    if (phoneQ) {
      const digits = phoneQ.replace(/\D/g, '');
      const phoneLike = `%${digits || phoneQ}%`;
      parts.push(`(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '+', '') LIKE ? OR phone LIKE ?)`);
      params.push(phoneLike, `%${phoneQ}%`);
    }

    const [rows] = await pool.query(
      `SELECT id, first_name, last_name, phone, dob
         FROM tbl_patient
        WHERE ${parts.join(' AND ')}
        ORDER BY last_name, first_name, id
        LIMIT ?`,
      [...params, Math.min(50, Math.max(1, limit))]
    );
    return rows || [];
  }

  function buildMaternityCreatePatientUrl(name, phone) {
    const q = new URLSearchParams({ from: 'maternity', action: 'new' });
    const nameQ = String(name || '').trim();
    const phoneQ = String(phone || '').trim();
    if (nameQ) q.set('prefill_name', nameQ);
    if (phoneQ) q.set('prefill_phone', phoneQ);
    return `/patients?${q.toString()}`;
  }

  /** Chart forms post to /maternity/chart/:id/* — bind id before validators run. */
  function bindChartMaternityPatientId(req, res, next) {
    const id = parseInt(req.params.id, 10) || 0;
    if (id > 0) {
      req.body = req.body || {};
      req.body.maternity_patient_id = String(id);
    }
    next();
  }

  /** Delivery form posts to /maternity/labor/:laborId/delivery — bind id before validators run. */
  function bindLaborRecordId(req, res, next) {
    const id = parseInt(req.params.laborId, 10) || 0;
    if (id > 0) {
      req.body = req.body || {};
      req.body.labor_record_id = String(id);
    }
    next();
  }

  // ── Pages ─────────────────────────────────────────────────────
  app.get('/maternity', requireAuth, view, async (req, res) => {
    try {
      const stats = await mat.getDashboardStats(pool);
      const [highRisk] = await pool.query(
        `SELECT mp.*, p.first_name, p.last_name FROM maternity_patients mp
         JOIN tbl_patient p ON p.id = mp.patient_id
         WHERE mp.risk_level = 'high' AND mp.status = 'active' ORDER BY mp.edd ASC LIMIT 8`
      );
      const [labor] = await pool.query(
        `SELECT lr.*, mp.antenatal_number, p.first_name, p.last_name
         FROM labor_records lr
         JOIN maternity_patients mp ON mp.id = lr.maternity_patient_id
         JOIN tbl_patient p ON p.id = mp.patient_id
         WHERE lr.status = 'in_labor' ORDER BY lr.admission_date ASC LIMIT 12`
      );
      res.render('maternity-dashboard', matPage({
        title: 'Maternity — ZAIZENS',
        stats,
        highRisk,
        labor,
        flash: req.query.msg,
        error: req.query.err,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/maternity/deliveries-today', requireAuth, view, async (req, res) => {
    try {
      const { date, rows } = await mat.listDeliveriesForDate(pool, req.query.date);
      res.render('maternity-deliveries-today', matPage({
        title: 'Deliveries today — Maternity',
        rows,
        date,
        flash: req.query.msg,
        error: req.query.err,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/maternity/patients', requireAuth, view, async (req, res) => {
    try {
      const search = String(req.query.q || '').trim();
      const status = req.query.status || '';
      const risk = req.query.risk || '';
      let where = 'WHERE 1=1';
      const params = [];
      if (status) {
        where += ' AND mp.status = ?';
        params.push(status);
      }
      if (risk) {
        where += ' AND mp.risk_level = ?';
        params.push(risk);
      }
      if (search) {
        where += ' AND (mp.antenatal_number LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ?)';
        const like = `%${search}%`;
        params.push(like, like, like);
      }
      const [rows] = await pool.query(
        `SELECT mp.*, p.first_name, p.last_name, p.phone,
          (SELECT COUNT(*) FROM antenatal_visits av WHERE av.maternity_patient_id = mp.id) AS anc_visits_count
         FROM maternity_patients mp JOIN tbl_patient p ON p.id = mp.patient_id
         ${where} ORDER BY mp.created_at DESC LIMIT 100`,
        params
      );
      res.render('maternity-patients', matPage({
        title: 'ANC registry — Maternity',
        rows,
        search,
        status,
        risk,
        flash: req.query.msg,
        error: req.query.err,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/maternity/register', requireAuth, mutate, async (req, res) => {
    const patientId = parseInt(req.query.patient_id, 10) || 0;
    const patientName = String(req.query.patient_name || '').trim();
    const patientPhone = String(req.query.patient_phone || '').trim();
    const searched = !!(patientId || patientName || patientPhone);

    let patient = null;
    let patientMatches = [];
    let searchNotFound = false;

    if (patientId > 0) {
      const [p] = await pool.query('SELECT id, first_name, last_name, phone, dob FROM tbl_patient WHERE id = ?', [
        patientId,
      ]);
      patient = p[0] || null;
      if (!patient) searchNotFound = true;
    } else if (patientName || patientPhone) {
      patientMatches = await searchMaternityPatients(patientName, patientPhone);
      if (patientMatches.length === 1) {
        patient = patientMatches[0];
        patientMatches = [];
      } else if (!patientMatches.length) {
        searchNotFound = true;
      }
    }

    res.render('maternity-register', matPage({
      title: 'ANC booking — Maternity',
      patient,
      patientMatches,
      searchNotFound,
      searched,
      searchPatientName: patientName,
      searchPatientPhone: patientPhone,
      searchPatientId: patientId > 0 && !patient ? String(patientId) : '',
      createPatientUrl: buildMaternityCreatePatientUrl(patientName, patientPhone),
      flash: req.query.msg,
      error: req.query.err,
    }));
  });

  app.post('/maternity/register', requireAuth, mutate, v.validateMaternityPatient, async (req, res) => {
    req.body.registered_by = uid(req);
    if (wantsJson(req)) return ctrl.registerMaternityPatient(req, res);
    try {
      let chartId = null;
      await ctrl.registerMaternityPatient(req, {
        status() {
          return this;
        },
        json(b) {
          if (!b || !b.success) throw new Error((b && b.message) || 'Registration failed');
          chartId = parseInt(b.data && b.data.id, 10) || 0;
          if (!chartId) throw new Error('Registration succeeded but no chart id was returned');
        },
      });
      const msg = encodeURIComponent('ANC registration complete');
      return res.redirect(302, `/maternity/chart/${chartId}?msg=${msg}`);
    } catch (e) {
      return flashRedirect(req, res, '/maternity/register?patient_id=' + (req.body.patient_id || ''), null, e.message);
    }
  });

  app.get('/maternity/chart/:id', requireAuth, view, async (req, res) => {
    try {
      await require('../lib/maternityIntegration').ensureMaternityIntegrationSchema(pool);
      const id = req.params.id;
      const summary = await new Promise((resolve, reject) => {
        req.params.id = id;
        const mockRes = {
          json: (b) => {
            if (b && b.success) resolve(b.data);
            else reject(new Error((b && b.message) || 'Failed to load chart'));
          },
        };
        mockRes.status = () => mockRes;
        ctrl.getPatientSummary(req, mockRes).catch(reject);
      });
      res.render('maternity-chart', matPage({
        title: 'Maternity chart — ' + (summary.patient.antenatal_number || ''),
        summary,
        billing: await require('../lib/maternityBilling').buildBillingSnapshot(pool, summary),
        mat,
        flash: req.query.msg,
        error: req.query.err,
        tab: req.query.tab || 'anc',
        delivery_id: parseInt(req.query.delivery_id, 10) || null,
        labor_id: parseInt(req.query.labor_id, 10) || null,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/maternity/labor', requireAuth, view, async (req, res) => {
    const laborId = parseInt(req.query.labor_id, 10) || 0;
    let labor = null;
    let partograph = [];
    let patient = null;
    if (laborId) {
      const [lr] = await pool.query(
        `SELECT lr.*, mp.*, p.first_name, p.last_name
         FROM labor_records lr
         JOIN maternity_patients mp ON mp.id = lr.maternity_patient_id
         JOIN tbl_patient p ON p.id = mp.patient_id
         WHERE lr.id = ?`,
        [laborId]
      );
      labor = lr[0] || null;
      if (labor) {
        patient = labor;
        const [pg] = await pool.query('SELECT * FROM partograph WHERE labor_record_id = ? ORDER BY recorded_at ASC', [
          laborId,
        ]);
        partograph = pg;
      }
    }
    const [activeRows] = await pool.query(
      `SELECT lr.id, lr.admission_date, lr.maternity_patient_id, mp.antenatal_number, p.first_name, p.last_name
       FROM labor_records lr
       JOIN maternity_patients mp ON mp.id = lr.maternity_patient_id
       JOIN tbl_patient p ON p.id = mp.patient_id
       WHERE lr.status = 'in_labor' ORDER BY lr.admission_date DESC, lr.id DESC`
    );
    const activeByPatient = new Map();
    for (const row of activeRows || []) {
      const key = row.maternity_patient_id || row.id;
      if (!activeByPatient.has(key)) activeByPatient.set(key, row);
    }
    const active = Array.from(activeByPatient.values()).sort(
      (a, b) => new Date(a.admission_date) - new Date(b.admission_date)
    );
    res.render('maternity-labor', matPage({
      title: 'Labor ward — Maternity',
      labor,
      patient,
      partograph,
      active,
      flash: req.query.msg,
      error: req.query.err,
    }));
  });

  // Form posts from chart
  app.post('/maternity/chart/:id/anc', requireAuth, mutate, bindChartMaternityPatientId, v.validateANCVisit, async (req, res) => {
    req.body.attended_by = uid(req);
    const chartUrl = '/maternity/chart/' + req.params.id + '?tab=anc';
    if (wantsJson(req)) return ctrl.createANCVisit(req, res);
    try {
      let errMsg = null;
      await ctrl.createANCVisit(req, {
        status() {
          return this;
        },
        json(b) {
          if (!b || !b.success) errMsg = (b && b.message) || 'Could not save ANC visit';
        },
      });
      if (errMsg) return flashRedirect(req, res, chartUrl, null, errMsg);
      return flashRedirect(req, res, chartUrl, 'ANC visit saved');
    } catch (e) {
      return flashRedirect(req, res, chartUrl, null, e.message);
    }
  });

  app.post('/maternity/chart/:id/risk', requireAuth, mutate, async (req, res) => {
    req.body.maternity_patient_id = req.params.id;
    req.body.reviewed_by = uid(req);
    if (req.body.risk_factors && typeof req.body.risk_factors === 'string') {
      req.body.risk_factors = req.body.risk_factors.split(',').map((s) => ({ code: s.trim() })).filter((x) => x.code);
    }
    const chartUrl = '/maternity/chart/' + req.params.id + '?tab=risk';
    try {
      const result = await invokeMaternityCtrl((rq, rs) => ctrl.createRiskAssessment(rq, rs), req);
      if (!result.ok) return flashRedirect(req, res, chartUrl, null, result.message);
      return flashRedirect(req, res, chartUrl, 'Risk assessment saved');
    } catch (e) {
      return flashRedirect(req, res, chartUrl, null, e.message);
    }
  });

  app.post('/maternity/chart/:id/labor', requireAuth, mutate, bindChartMaternityPatientId, v.validateLaborRecord, async (req, res) => {
    req.body.admitted_by = uid(req);
    const chartUrl = '/maternity/chart/' + req.params.id + '?tab=labor';
    if (wantsJson(req)) return ctrl.admitToLaborWard(req, res);
    try {
      let laborId = null;
      let errMsg = null;
      await ctrl.admitToLaborWard(req, {
        status() {
          return this;
        },
        json(b) {
          if (b && b.success) {
            laborId = parseInt(b.data && b.data.id, 10) || 0;
            if (!laborId) errMsg = 'Admitted but labor record id was not returned';
          } else {
            errMsg = (b && b.message) || 'Could not admit to labor ward';
          }
        },
      });
      if (errMsg) return flashRedirect(req, res, chartUrl, null, errMsg);
      if (!laborId) return flashRedirect(req, res, chartUrl, null, 'Could not admit to labor ward');
      const msg = encodeURIComponent('Admitted to labor ward');
      return res.redirect(
        302,
        `/maternity/chart/${req.params.id}?tab=labor&labor_id=${laborId}&msg=${msg}`
      );
    } catch (e) {
      return flashRedirect(req, res, chartUrl, null, e.message);
    }
  });

  app.post('/maternity/labor/:laborId/partograph', requireAuth, mutate, async (req, res) => {
    const chartUrl = '/maternity/labor?labor_id=' + req.params.laborId;
    try {
      const result = await invokeMaternityCtrl((rq, rs) => ctrl.addPartographEntry(rq, rs), req);
      if (!result.ok) return flashRedirect(req, res, chartUrl, null, result.message);
      return flashRedirect(req, res, chartUrl, 'Partograph entry saved');
    } catch (e) {
      return flashRedirect(req, res, chartUrl, null, e.message);
    }
  });

  app.post('/maternity/labor/:laborId/delivery', requireAuth, mutate, bindLaborRecordId, v.validateDelivery, async (req, res) => {
    const laborId = parseInt(req.params.laborId, 10) || 0;
    const [lr] = await pool.query('SELECT maternity_patient_id FROM labor_records WHERE id = ?', [laborId]);
    const matPatientId = parseInt(lr[0]?.maternity_patient_id, 10) || 0;
    const chartUrl = matPatientId ? '/maternity/chart/' + matPatientId + '?tab=delivery' : '/maternity/patients';
    if (!matPatientId) {
      return flashRedirect(req, res, chartUrl, null, 'Labor record not found');
    }
    req.body.maternity_patient_id = String(matPatientId);
    req.body.delivered_by = uid(req);
    if (wantsJson(req)) return ctrl.recordDelivery(req, res);
    try {
      let deliveryId = null;
      let errMsg = null;
      await ctrl.recordDelivery(req, {
        status() {
          return this;
        },
        json(b) {
          if (b && b.success) {
            deliveryId = parseInt(b.data && b.data.id, 10) || 0;
            if (!deliveryId) errMsg = 'Delivery saved but record id was not returned';
          } else {
            errMsg = (b && b.message) || 'Could not record delivery';
          }
        },
      });
      if (errMsg) return flashRedirect(req, res, chartUrl, null, errMsg);
      if (!deliveryId) return flashRedirect(req, res, chartUrl, null, 'Could not record delivery');
      if (req.body.register_newborn === '1') {
        return res.redirect(
          302,
          '/maternity/chart/' +
            matPatientId +
            '?tab=newborn&delivery_id=' +
            deliveryId +
            '&msg=' +
            encodeURIComponent('Delivery recorded')
        );
      }
      return flashRedirect(req, res, chartUrl, 'Delivery recorded');
    } catch (e) {
      return flashRedirect(req, res, chartUrl, null, e.message);
    }
  });

  app.post('/maternity/chart/:id/postnatal', requireAuth, mutate, bindChartMaternityPatientId, v.validatePostnatal, async (req, res) => {
    req.body.attended_by = uid(req);
    const chartUrl = '/maternity/chart/' + req.params.id + '?tab=postnatal';
    try {
      const result = await invokeMaternityCtrl((rq, rs) => ctrl.createPostnatalVisit(rq, rs), req);
      if (!result.ok) return flashRedirect(req, res, chartUrl, null, result.message);
      return flashRedirect(req, res, chartUrl, 'Postnatal visit saved');
    } catch (e) {
      return flashRedirect(req, res, chartUrl, null, e.message);
    }
  });

  app.post('/maternity/chart/:id/complication', requireAuth, mutate, bindChartMaternityPatientId, async (req, res) => {
    req.body.reported_by = uid(req);
    const chartUrl = '/maternity/chart/' + req.params.id + '?tab=complications';
    try {
      const result = await invokeMaternityCtrl((rq, rs) => ctrl.recordComplication(rq, rs), req);
      if (!result.ok) return flashRedirect(req, res, chartUrl, null, result.message);
      return flashRedirect(req, res, chartUrl, 'Complication recorded');
    } catch (e) {
      return flashRedirect(req, res, chartUrl, null, e.message);
    }
  });

  app.post('/maternity/chart/:id/scan', requireAuth, mutate, bindChartMaternityPatientId, async (req, res) => {
    const chartUrl = '/maternity/chart/' + req.params.id + '?tab=scans';
    try {
      const result = await invokeMaternityCtrl((rq, rs) => ctrl.addUltrasoundScan(rq, rs), req);
      if (!result.ok) return flashRedirect(req, res, chartUrl, null, result.message);
      return flashRedirect(req, res, chartUrl, 'Scan saved');
    } catch (e) {
      return flashRedirect(req, res, chartUrl, null, e.message);
    }
  });

  app.post('/maternity/chart/:id/newborn', requireAuth, mutate, bindChartMaternityPatientId, v.validateNewborn, async (req, res) => {
    const chartUrl = '/maternity/chart/' + req.params.id + '?tab=newborn';
    try {
      const result = await invokeMaternityCtrl((rq, rs) => ctrl.registerNewborn(rq, rs), req);
      if (!result.ok) return flashRedirect(req, res, chartUrl, null, result.message);
      return flashRedirect(req, res, chartUrl, result.message || 'Newborn registered');
    } catch (e) {
      return flashRedirect(req, res, chartUrl, null, e.message);
    }
  });

  // ── REST API (mobile / integrations) ────────────────────────
  const api = '/api/maternity';
  app.post(api + '/patients', requireAuth, mutate, v.validateMaternityPatient, ctrl.registerMaternityPatient);
  app.get(api + '/patients', requireAuth, view, ctrl.getAllMaternityPatients);
  app.get(api + '/patients/:id', requireAuth, view, ctrl.getMaternityPatientById);
  app.get(api + '/patients/hms/:patientId', requireAuth, view, ctrl.getByHMSPatientId);
  app.get(api + '/patients/:id/summary', requireAuth, view, ctrl.getPatientSummary);
  app.post(api + '/antenatal', requireAuth, mutate, v.validateANCVisit, ctrl.createANCVisit);
  app.get(api + '/antenatal/:maternityPatientId', requireAuth, view, ctrl.getANCVisits);
  app.post(api + '/risk-assessment', requireAuth, mutate, ctrl.createRiskAssessment);
  app.get(api + '/risk-assessment/:maternityPatientId', requireAuth, view, ctrl.getRiskAssessments);
  app.post(api + '/scans', requireAuth, mutate, ctrl.addUltrasoundScan);
  app.get(api + '/scans/:maternityPatientId', requireAuth, view, ctrl.getUltrasoundScans);
  app.post(api + '/labor', requireAuth, mutate, v.validateLaborRecord, ctrl.admitToLaborWard);
  app.get(api + '/labor/active', requireAuth, view, ctrl.getActiveLaborPatients);
  app.post(api + '/partograph/:laborId', requireAuth, mutate, ctrl.addPartographEntry);
  app.get(api + '/partograph/:laborId', requireAuth, view, ctrl.getPartographData);
  app.post(api + '/delivery', requireAuth, mutate, v.validateDelivery, ctrl.recordDelivery);
  app.post(api + '/newborn', requireAuth, mutate, v.validateNewborn, ctrl.registerNewborn);
  app.post(api + '/postnatal', requireAuth, mutate, v.validatePostnatal, ctrl.createPostnatalVisit);
  app.get(api + '/postnatal/:maternityPatientId', requireAuth, view, ctrl.getPostnatalVisits);
  app.post(api + '/complications', requireAuth, mutate, ctrl.recordComplication);
  app.get(api + '/complications/:maternityPatientId', requireAuth, view, ctrl.getComplications);
  app.get(api + '/reports/dashboard', requireAuth, view, ctrl.getDashboardStats);
  app.get(api + '/reports/high-risk', requireAuth, view, ctrl.getHighRiskPatients);
};
