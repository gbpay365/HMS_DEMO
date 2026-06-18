'use strict';

/**
 * Vaccination module — SSR pages under /vaccination/* plus REST integration API under /api/vaccination/*.
 * Primary UI uses server-rendered forms; JSON API is for mobile/integrations (see docs/INTEGRATION-APIS.md).
 */
const createController = require('../controllers/vaccination.controller');
const vac = require('../lib/hmsVaccination');

module.exports = function (app, pool, requireAuth, requirePerm) {
  const ctrl = createController(pool);
  function _rp(...keys) {
    if (typeof requirePerm === 'function') return requirePerm(...keys);
    return (req, res, next) => next();
  }
  const view = _rp('vaccination.read', 'vaccination.write', 'clinical.read', 'clinical.write', 'nursing.read', 'nursing.write');
  const mutate = _rp('vaccination.write', 'clinical.write', 'nursing.write');
  const uid = (req) => parseInt(req.session?.user?.id || req.session?.userId, 10) || null;

  const wantsJson = (req) =>
    req.xhr ||
    String(req.get('accept') || '').includes('application/json') ||
    (req.path || '').startsWith('/api/vaccination');

  function flashRedirect(req, res, url, msg, err) {
    const q = err ? `err=${encodeURIComponent(err)}` : `msg=${encodeURIComponent(msg)}`;
    return res.redirect(url + (url.includes('?') ? '&' : '?') + q);
  }

  function vacPage(extra) {
    return Object.assign({ vaccinationOdooApp: true }, extra || {});
  }

  // ── Pages ─────────────────────────────────────────────────────
  app.get('/vaccination', requireAuth, view, async (req, res) => {
    try {
      const stats = await vac.getDashboardStats(pool);
      const duePatients = await vac.getDuePatients(pool, 10);
      const [queue] = await pool.query(
        `SELECT vq.*, p.first_name, p.last_name, p.patient_code
         FROM vaccination_queue vq
         JOIN tbl_patient p ON p.id = vq.patient_id
         WHERE vq.status IN ('waiting','in_progress')
         ORDER BY vq.priority DESC, vq.created_at ASC LIMIT 12`
      );
      res.render('vaccination-dashboard', vacPage({
        title: 'Vaccination — ZAIZENS',
        stats,
        duePatients,
        queue,
        flash: req.query.msg,
        error: req.query.err,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/vaccination/patients', requireAuth, view, async (req, res) => {
    try {
      const search = String(req.query.q || '').trim();
      const dueOnly = req.query.due === '1';
      let where = 'WHERE 1=1';
      const params = [];

      if (search) {
        where += ' AND (p.first_name LIKE ? OR p.last_name LIKE ? OR p.patient_code LIKE ? OR CAST(p.id AS CHAR) LIKE ?)';
        const like = `%${search}%`;
        params.push(like, like, like, like);
      }

      if (dueOnly) {
        where += ` AND EXISTS (
          SELECT 1 FROM vaccination_records vr2
          WHERE vr2.patient_id = p.id AND vr2.next_dose_due <= CURDATE() AND vr2.status = 'given'
        )`;
      } else {
        where += ` AND EXISTS (SELECT 1 FROM vaccination_records vr2 WHERE vr2.patient_id = p.id)`;
      }

      const [rows] = await pool.query(
        `SELECT p.id, p.first_name, p.last_name, p.phone, p.patient_code, p.dob,
          (SELECT COUNT(*) FROM vaccination_records vr WHERE vr.patient_id = p.id AND vr.status = 'given') AS dose_count,
          (SELECT MAX(vr.administered_date) FROM vaccination_records vr WHERE vr.patient_id = p.id) AS last_dose_date,
          (SELECT MIN(vr.next_dose_due) FROM vaccination_records vr
           WHERE vr.patient_id = p.id AND vr.next_dose_due IS NOT NULL AND vr.status = 'given') AS next_due
         FROM tbl_patient p
         ${where}
         ORDER BY next_due IS NULL, next_due ASC, last_dose_date DESC
         LIMIT 100`,
        params
      );

      res.render('vaccination-patients', vacPage({
        title: 'Immunization registry — Vaccination',
        rows,
        search,
        dueOnly,
        flash: req.query.msg,
        error: req.query.err,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/vaccination/administer', requireAuth, mutate, async (req, res) => {
    const patientId = parseInt(req.query.patient_id, 10) || 0;
    let patient = null;
    if (patientId > 0) {
      const [p] = await pool.query(
        'SELECT id, first_name, last_name, phone, dob, gender, patient_code FROM tbl_patient WHERE id = ?',
        [patientId]
      );
      patient = p[0] || null;
    }
    const [vaccines] = await pool.query(
      `SELECT * FROM vaccination_vaccines WHERE active = 1 ORDER BY sort_order, name`
    );
    res.render('vaccination-administer', vacPage({
      title: 'Administer vaccine — Vaccination',
      patient,
      vaccines,
      flash: req.query.msg,
      error: req.query.err,
    }));
  });

  app.post('/vaccination/administer', requireAuth, mutate, async (req, res) => {
    req.body.administered_by = uid(req);
    if (wantsJson(req)) return ctrl.administerDose(req, res);
    try {
      let recordId = null;
      await ctrl.administerDose(req, {
        status() { return this; },
        json(b) {
          if (!b || !b.success) throw new Error((b && b.message) || 'Failed to record dose');
          recordId = b.data && b.data.id;
        },
      });
      const pid = req.body.patient_id;
      const msg = encodeURIComponent('Vaccine dose recorded successfully');
      return res.redirect(302, `/vaccination/chart/${pid}?msg=${msg}`);
    } catch (e) {
      return flashRedirect(
        req,
        res,
        '/vaccination/administer?patient_id=' + (req.body.patient_id || ''),
        null,
        e.message
      );
    }
  });

  app.get('/vaccination/chart/:patient_id', requireAuth, view, async (req, res) => {
    try {
      const summary = await vac.loadPatientSummary(pool, req.params.patient_id);
      if (!summary) {
        return res.status(404).render('error', { title: 'Not found', message: 'Patient not found', status: 404 });
      }
      res.render('vaccination-chart', vacPage({
        title: 'Immunization chart — ' + (summary.patient.first_name || '') + ' ' + (summary.patient.last_name || ''),
        summary,
        vac,
        flash: req.query.msg,
        error: req.query.err,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/vaccination/vaccines', requireAuth, view, async (req, res) => {
    try {
      const [vaccines] = await pool.query(
        `SELECT vv.*,
          (SELECT COUNT(*) FROM vaccination_records vr WHERE vr.vaccine_id = vv.id AND vr.status = 'given') AS doses_given
         FROM vaccination_vaccines vv
         ORDER BY vv.sort_order, vv.name`
      );
      res.render('vaccination-vaccines', vacPage({
        title: 'Vaccine catalog — Vaccination',
        vaccines,
        flash: req.query.msg,
        error: req.query.err,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  // ── JSON API ──────────────────────────────────────────────────
  app.get('/api/vaccination/stats', requireAuth, view, (req, res) => ctrl.getDashboardStats(req, res));
  app.get('/api/vaccination/patients', requireAuth, view, (req, res) => ctrl.listPatients(req, res));
  app.get('/api/vaccination/patient/:patient_id', requireAuth, view, (req, res) => ctrl.getPatientSummary(req, res));
  app.post('/api/vaccination/administer', requireAuth, mutate, (req, res) => ctrl.administerDose(req, res));
  app.post('/api/vaccination/queue', requireAuth, mutate, (req, res) => ctrl.addToQueue(req, res));
};
