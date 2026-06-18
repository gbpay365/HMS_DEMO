'use strict';

/**
 * Unified death registry — OPD, IPD, ER, Maternity.
 */
module.exports = function mountDeathRegistryRoutes(app, pool, requireAuth, requirePerm) {
  const deathRead = requirePerm('adt.read', 'adt.write', 'clinical.read', 'clinical.write', 'nursing.read', 'nursing.write', 'emergency.read');
  const deathWrite = requirePerm('adt.write', 'clinical.write', 'nursing.write', 'emergency.write', 'maternity.write');

  const { recordDeath, loadDeathRegistryPageData } = require('../lib/deathRegistry');
  const { pageTitle } = require('../lib/pageTitle');

  app.get('/death-registry/certifying-doctors', requireAuth, deathRead, async (req, res) => {
    try {
      const { loadCertifyingDoctors } = require('../lib/deathRegistry');
      const doctors = await loadCertifyingDoctors(pool);
      res.json({ ok: true, doctors });
    } catch (e) {
      console.error('death-registry certifying-doctors:', e);
      res.status(500).json({ ok: false, doctors: [], error: e.message });
    }
  });

  app.get('/death-registry', requireAuth, deathRead, async (req, res) => {
    try {
      const data = await loadDeathRegistryPageData(pool);
      const prefill = {
        source_module: String(req.query.source || req.query.module || '').toLowerCase(),
        admission_id: parseInt(req.query.admission_id, 10) || null,
        visit_id: parseInt(req.query.visit_id, 10) || null,
        maternity_patient_id: parseInt(req.query.maternity_patient_id, 10) || null,
      };
      res.render('death-registry', {
        title: pageTitle(res, 'document_titles.death_registry', 'Death registry'),
        pageData: {
          ...data,
          prefill,
          flash: req.query.msg || null,
          error: req.query.err || null,
        },
        flash: req.query.msg || null,
        error: req.query.err || null,
      });
    } catch (e) {
      console.error('death-registry GET:', e);
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/death-registry', requireAuth, deathWrite, async (req, res) => {
    const ret = '/death-registry';
    const sep = '?';
    const uid = parseInt(req.session.userId ?? req.session.user?.id ?? '', 10) || null;
    const sourceModule = String(req.body.source_module || 'ipd').toLowerCase();

    let patientId = parseInt(req.body.patient_id, 10) || 0;
    const admissionId = parseInt(req.body.admission_id, 10) || null;
    const visitId = parseInt(req.body.visit_id, 10) || null;
    const maternityPatientId = parseInt(req.body.maternity_patient_id, 10) || null;

    try {
      if (patientId < 1 && admissionId) {
        const [[a]] = await pool.query('SELECT patient_id FROM tbl_admission WHERE id=?', [admissionId]);
        patientId = parseInt(a?.patient_id, 10) || 0;
      }
      if (patientId < 1 && visitId) {
        const [[v]] = await pool.query('SELECT patient_id FROM tbl_opd_visit WHERE id=?', [visitId]);
        patientId = parseInt(v?.patient_id, 10) || 0;
      }
      if (patientId < 1 && maternityPatientId) {
        const [[m]] = await pool.query('SELECT patient_id FROM maternity_patients WHERE id=?', [maternityPatientId]);
        patientId = parseInt(m?.patient_id, 10) || 0;
      }

      const r = await recordDeath(pool, {
        sourceModule,
        patientId,
        admissionId,
        visitId,
        maternityPatientId,
        deliveryRecordId: parseInt(req.body.delivery_record_id, 10) || null,
        dateOfDeath: req.body.date_of_death,
        timeOfDeath: req.body.time_of_death,
        causeOfDeath: req.body.cause_of_death,
        certifyingDoctorId: req.body.certifying_doctor_id,
        notes: req.body.notes,
        reportedBy: uid,
      });

      if (!r.ok) {
        return res.redirect(ret + sep + 'err=' + encodeURIComponent(r.error || 'Save failed'));
      }
      return res.redirect(ret + sep + 'msg=' + encodeURIComponent('Death record saved.'));
    } catch (e) {
      console.error('death-registry POST:', e);
      return res.redirect(ret + sep + 'err=' + encodeURIComponent(e.message || 'Save failed'));
    }
  });

  app.post('/ipd/death-registry', requireAuth, deathWrite, (req, res) => {
    res.redirect(307, '/death-registry');
  });

  // Legacy IPD path → unified registry
  app.get('/ipd/death-registry', requireAuth, deathRead, (req, res) => {
    const q = new URLSearchParams({ source: 'ipd', ...(req.query.admission_id ? { admission_id: req.query.admission_id } : {}) });
    res.redirect('/death-registry?' + q.toString());
  });
};
