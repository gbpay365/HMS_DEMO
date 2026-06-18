// ============================================================
// OPD MEDICATION MANAGEMENT — Doctor / Nurse / Cashier workflow
// routes/opdMed.js
//
//   Doctor:  /opd/treatment/:visit_id
//   Nurse:   /opd/chart/:visit_id
// ============================================================
'use strict';

const clinicalNad = require('../lib/clinicalNotAssignedBypass');
const { resolveIpdDrugUnitPrice } = require('../lib/prescriptionPricing');
const { syncOpdPrescriptionBill, removeOpdPrescriptionBill } = require('../lib/opdPrescriptionBilling');
const opdDoctorMedAlerts = require('../lib/opdDoctorMedAlerts');
const ensureOpdMedSchema = require('../lib/ensureOpdMedSchema');

module.exports = function (app, pool, requireAuth, requirePerm) {
  const _rp = typeof requirePerm === 'function' ? requirePerm : (...keys) => (req, res, next) => next();
  const requireOpdView = _rp(
    'clinical.read', 'clinical.write', 'nursing.read', 'nursing.write', 'prescription.write'
  );
  const requireOpdMutate = _rp('clinical.write', 'nursing.write', 'prescription.write');

  app.use((req, res, next) => {
    const p = req.path || '';
    if (!p.startsWith('/opd/treatment') && !p.startsWith('/opd/chart') && !p.startsWith('/opd/prescription') && !p.startsWith('/opd/dose')) {
      return next();
    }
    if (req.query && req.query.msg) res.locals.flash = req.query.msg;
    if (req.query && req.query.err) res.locals.error = req.query.err;
    next();
  });

  const sq = async (sql, p = []) => {
    try {
      const [r] = await pool.query(sql, p);
      return r || [];
    } catch (e) {
      console.warn('[opdMed]', sql.split('\n')[0].slice(0, 80), e.message);
      return [];
    }
  };
  const one = async (sql, p = []) => {
    const r = await sq(sql, p);
    return r[0] || null;
  };
  const userId = (req) => (req.session && req.session.user ? Number(req.session.user.id) || null : null);
  const userRole = (req) => String((req.session.user || {}).role || '');
  const permList = (req, res) => {
    if (res && res.locals && Array.isArray(res.locals.userPerms)) return res.locals.userPerms;
    if (req.res && req.res.locals && Array.isArray(req.res.locals.userPerms)) return req.res.locals.userPerms;
    return [];
  };
  const isDoctor = (req, res) => {
    const role = userRole(req);
    if (role === '1' || role === '99') return true;
    const list = permList(req, res);
    return list.includes('*') || list.includes('clinical.write') || list.includes('prescription.write');
  };
  const isNurse = (req, res) => {
    const role = userRole(req);
    if (role === '1' || role === '99') return true;
    const list = permList(req, res);
    return list.includes('*') || list.includes('nursing.write');
  };

  async function resolveRxPricingFromBody(body) {
    const customName = (body.custom_drug_name || '').toString().trim();
    const drugName = (body.drug_name || '').toString().trim();
    return resolveIpdDrugUnitPrice(pool, {
      catalogName: customName ? '' : drugName,
      customName,
    });
  }

  function parseTreatmentStart(body, fallback) {
    const raw = (body && body.treatment_start != null ? body.treatment_start : '')
      .toString()
      .trim()
      .slice(0, 10);
    return raw || fallback || null;
  }

  function parseScheduleTimes(str) {
    const out = [];
    for (const part of String(str || '').split(',')) {
      const m = part.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (m) out.push({ h: parseInt(m[1], 10), mn: parseInt(m[2], 10) });
    }
    return out;
  }

  function defaultTimesForFrequency(tpd) {
    const t = Math.max(1, parseInt(tpd, 10) || 1);
    const presets = {
      1: ['08:00'],
      2: ['08:00', '20:00'],
      3: ['08:00', '14:00', '20:00'],
      4: ['08:00', '12:00', '16:00', '20:00'],
      6: ['04:00', '08:00', '12:00', '16:00', '20:00', '00:00'],
    };
    return presets[t] || presets[3];
  }

  async function generateDoseSlots(rx) {
    const tList =
      rx.scheduled_times && String(rx.scheduled_times).trim()
        ? rx.scheduled_times
        : defaultTimesForFrequency(rx.times_per_day).join(',');
    const slots = parseScheduleTimes(tList);
    if (!slots.length) return 0;

    const startRaw = rx.treatment_start ? String(rx.treatment_start).slice(0, 10) : null;
    const startDate = startRaw ? new Date(`${startRaw}T08:00:00`) : new Date();
    startDate.setSeconds(0, 0);
    const days = Math.max(1, parseInt(rx.duration_days, 10) || 1);
    let inserted = 0;
    for (let day = 0; day < days; day++) {
      for (const t of slots) {
        const dt = new Date(startDate);
        dt.setDate(dt.getDate() + day);
        dt.setHours(t.h, t.mn, 0, 0);
        const sched = dt.toISOString().slice(0, 19).replace('T', ' ');
        await pool
          .query(
            `INSERT INTO tbl_opd_dose_slot
               (prescription_id, treatment_id, opd_visit_id, patient_id, scheduled_at, day_index)
             VALUES (?,?,?,?,?,?)`,
            [rx.id, rx.treatment_id, rx.opd_visit_id, rx.patient_id, sched, day + 1]
          )
          .catch(() => {});
        inserted++;
      }
    }
    return inserted;
  }

  async function loadVisit(visitId) {
    const vid = parseInt(visitId, 10) || 0;
    if (!vid) return null;
    return one(
      `SELECT v.*,
              p.first_name, p.last_name, p.gender, p.dob,
              CONCAT(d.first_name,' ',d.last_name) AS doctor_name
         FROM tbl_opd_visit v
         JOIN tbl_patient p ON p.id = v.patient_id
         LEFT JOIN tbl_employee d ON d.id = v.assigned_doctor_id
        WHERE v.id = ? LIMIT 1`,
      [vid]
    );
  }

  async function renderTreatment(req, res, visitId) {
    await ensureOpdMedSchema(pool);
    const visit = await loadVisit(visitId);
    if (!visit) return res.redirect('/opd-queue?err=Visit+not+found');

    const roleNad = userRole(req);
    const uidNad = userId(req);
    const assignedDoc = parseInt(visit.assigned_doctor_id || 0, 10) || 0;
    if (roleNad === '2' && assignedDoc > 0 && uidNad !== assignedDoc && !clinicalNad.hasBypass(req, 'opd', visitId)) {
      return res.render('consultation-ack-not-assigned', {
        title: 'Patient not assigned to you',
        mode: 'opd',
        patientName: [visit.first_name, visit.last_name].filter(Boolean).join(' '),
        assignedDoctorLabel: (visit.doctor_name || 'the assigned physician').trim(),
        nextUrl: `/opd/treatment/${visitId}`,
        visitId,
        patientId: visit.patient_id,
        admissionId: 0,
        ticketNumber: visit.ticket_number || null,
      });
    }

    const treatments = await sq(
      `SELECT t.*,
              CONCAT(d.first_name,' ',d.last_name) AS doctor_name,
              (SELECT COUNT(*) FROM tbl_opd_prescription r WHERE r.treatment_id = t.id) AS rx_count,
              (SELECT COUNT(*) FROM tbl_opd_dose_slot s WHERE s.treatment_id = t.id) AS slots_total,
              (SELECT COUNT(*) FROM tbl_opd_dose_slot s WHERE s.treatment_id = t.id AND s.administered = 1) AS slots_given,
              (SELECT COUNT(*) FROM tbl_opd_dose_slot s WHERE s.treatment_id = t.id AND s.administered = 0 AND s.hidden_on_terminate = 0) AS slots_pending
         FROM tbl_opd_treatment t
         LEFT JOIN tbl_employee d ON d.id = t.doctor_id
        WHERE t.opd_visit_id = ?
        ORDER BY t.id DESC`,
      [visitId]
    );

    const active = treatments.find((t) => t.status === 'active') || null;
    const prescriptions = active
      ? await sq(
          `SELECT r.*,
                  (SELECT COUNT(*) FROM tbl_opd_dose_slot s WHERE s.prescription_id = r.id) AS slots_total,
                  (SELECT COUNT(*) FROM tbl_opd_dose_slot s WHERE s.prescription_id = r.id AND s.administered = 1) AS slots_given
             FROM tbl_opd_prescription r
            WHERE r.treatment_id = ?
            ORDER BY r.locked ASC, r.id ASC`,
          [active.id]
        )
      : [];

    const doseSlots = active
      ? await sq(
          `SELECT s.*, r.drug_name, r.dosage, r.frequency_label, r.route,
                  CONCAT(n.first_name,' ',n.last_name) AS nurse_name
             FROM tbl_opd_dose_slot s
             JOIN tbl_opd_prescription r ON r.id = s.prescription_id
             LEFT JOIN tbl_employee n ON n.id = s.administered_by
            WHERE s.treatment_id = ?
              AND (s.administered = 1 OR s.hidden_on_terminate = 0)
            ORDER BY s.scheduled_at ASC
            LIMIT 300`,
          [active.id]
        )
      : [];

    const { opdPageData } = require('../lib/reactRouteHelpers');
    res.render('opd-treatment', {
      title: 'OPD Treatment — Prescriptions',
      visit,
      ...opdPageData('treatment', {
        visit,
        treatments,
        active,
        prescriptions,
        doseSlots,
        canEdit: isDoctor(req, res),
        canAdminister: isNurse(req, res) && active && active.status === 'active',
        userRole: userRole(req),
      }),
    });
  }

  app.get('/opd/treatment/:visit_id', requireAuth, requireOpdView, async (req, res) => {
    const visitId = parseInt(req.params.visit_id, 10) || 0;
    if (!visitId) return res.redirect('/opd-queue?err=Invalid+visit');
    return renderTreatment(req, res, visitId);
  });

  app.post('/opd/treatment/create', requireAuth, requireOpdMutate, async (req, res) => {
    if (!isDoctor(req, res)) return res.redirect('back?err=Only+a+doctor+can+start+a+treatment');
    await ensureOpdMedSchema(pool);
    const { opd_visit_id, diagnosis, est_duration_days, start_date, notes, alert_on_administer } = req.body;
    const vid = parseInt(opd_visit_id, 10) || 0;
    if (!vid || !diagnosis) return res.redirect('back?err=Diagnosis+is+required');

    const visit = await loadVisit(vid);
    if (!visit) return res.redirect('/opd-queue?err=Visit+not+found');

    const existing = await one(
      `SELECT id FROM tbl_opd_treatment WHERE opd_visit_id=? AND status='active' LIMIT 1`,
      [vid]
    );
    if (existing) {
      return res.redirect(`/opd/treatment/${vid}?err=` + encodeURIComponent('Terminate the current treatment before starting a new one.'));
    }

    const alertFlag =
      alert_on_administer === '1' || alert_on_administer === 'on' || alert_on_administer === true ? 1 : 0;
    const startDt = (start_date || '').toString().trim().slice(0, 10) || null;

    await pool.query(
      `INSERT INTO tbl_opd_treatment
         (opd_visit_id, patient_id, doctor_id, diagnosis, est_duration_days, start_date,
          alert_on_administer, notes, status)
       VALUES (?,?,?,?,?,?,?,?,'active')`,
      [
        vid,
        visit.patient_id,
        userId(req),
        String(diagnosis).trim().slice(0, 500),
        parseInt(est_duration_days, 10) || null,
        startDt,
        alertFlag,
        (notes || '').trim() || null,
      ]
    );

    res.redirect(`/opd/treatment/${vid}?msg=Treatment+started`);
  });

  app.post('/opd/treatment/:id/terminate', requireAuth, requireOpdMutate, async (req, res) => {
    if (!isDoctor(req, res)) return res.redirect('back?err=Only+a+doctor+can+terminate');
    const tid = parseInt(req.params.id, 10) || 0;
    const t = await one('SELECT * FROM tbl_opd_treatment WHERE id=? LIMIT 1', [tid]);
    if (!t) return res.redirect('back?err=Treatment+not+found');
    const reason = (req.body.reason || 'Terminated by doctor').toString().trim().slice(0, 300);
    await pool.query(
      `UPDATE tbl_opd_treatment SET status='terminated', terminated_at=NOW(), terminated_by=?, terminated_reason=? WHERE id=?`,
      [userId(req), reason, tid]
    );
    await pool.query(
      `UPDATE tbl_opd_dose_slot SET hidden_on_terminate=1
        WHERE treatment_id=? AND administered=0`,
      [tid]
    );
    res.redirect(`/opd/treatment/${t.opd_visit_id}?msg=Treatment+terminated`);
  });

  app.post('/opd/treatment/:id/alerts', requireAuth, requireOpdMutate, async (req, res) => {
    if (!isDoctor(req, res)) return res.redirect('back?err=Only+a+doctor+can+change+alert+settings');
    const tid = parseInt(req.params.id, 10) || 0;
    const t = await one('SELECT * FROM tbl_opd_treatment WHERE id=? LIMIT 1', [tid]);
    if (!t) return res.redirect('back?err=Treatment+not+found');
    if (t.status !== 'active') {
      return res.redirect(`/opd/treatment/${t.opd_visit_id}?err=Treatment+is+not+active`);
    }
    const alertFlag =
      req.body.alert_on_administer === '1' || req.body.alert_on_administer === 'on' ? 1 : 0;
    await pool.query('UPDATE tbl_opd_treatment SET alert_on_administer=? WHERE id=?', [alertFlag, tid]);
    const msg = alertFlag ? 'Doctor+alerts+enabled' : 'Doctor+alerts+disabled';
    res.redirect(`/opd/treatment/${t.opd_visit_id}?msg=${msg}`);
  });

  app.post('/opd/prescription/add', requireAuth, requireOpdMutate, async (req, res) => {
    if (!isDoctor(req, res)) return res.redirect('back?err=Only+a+doctor+can+prescribe');
    await ensureOpdMedSchema(pool);
    const {
      treatment_id, drug_name, drug_type, dosage, route,
      frequency_label, times_per_day, duration_days, scheduled_times, notes,
    } = req.body;
    const tid = parseInt(treatment_id, 10) || 0;
    const t = await one('SELECT * FROM tbl_opd_treatment WHERE id=? LIMIT 1', [tid]);
    if (!t) return res.redirect('back?err=Treatment+not+found');
    if (t.status !== 'active') {
      return res.redirect(`/opd/treatment/${t.opd_visit_id}?err=Cannot+add+to+a+${t.status}+treatment`);
    }
    if (!dosage) return res.redirect(`/opd/treatment/${t.opd_visit_id}?err=Dosage+is+required`);

    const pricing = await resolveRxPricingFromBody(req.body);
    const finalDrugName = pricing.name || (drug_name || '').toString().trim();
    if (!finalDrugName) {
      return res.redirect(`/opd/treatment/${t.opd_visit_id}?err=Drug+name+is+required`);
    }
    const finalUnitPrice = pricing.isCustom ? 0 : pricing.unitPrice;
    const treatmentStart = parseTreatmentStart(req.body, t.start_date);

    const [r] = await pool.query(
      `INSERT INTO tbl_opd_prescription
         (treatment_id, opd_visit_id, patient_id, drug_name, drug_type, dosage, route,
          frequency_label, times_per_day, duration_days, scheduled_times, unit_price,
          treatment_start, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        tid, t.opd_visit_id, t.patient_id, finalDrugName, drug_type || 'tablet', dosage, route || 'oral',
        frequency_label || 'TDS', parseInt(times_per_day, 10) || 3, parseInt(duration_days, 10) || 1,
        scheduled_times || null, finalUnitPrice, treatmentStart, notes || null, userId(req),
      ]
    );

    const rx = {
      id: r.insertId,
      treatment_id: tid,
      opd_visit_id: t.opd_visit_id,
      patient_id: t.patient_id,
      times_per_day: parseInt(times_per_day, 10) || 3,
      duration_days: parseInt(duration_days, 10) || 1,
      scheduled_times,
      treatment_start: treatmentStart,
    };
    await generateDoseSlots(rx);

    const freshRx = await one('SELECT * FROM tbl_opd_prescription WHERE id=? LIMIT 1', [r.insertId]);
    if (freshRx) await syncOpdPrescriptionBill(pool, req, freshRx);

    res.redirect(`/opd/treatment/${t.opd_visit_id}?msg=Prescription+added`);
  });

  app.post('/opd/prescription/:id/delete', requireAuth, requireOpdMutate, async (req, res) => {
    if (!isDoctor(req, res)) return res.redirect('back?err=Only+a+doctor+can+remove+a+prescription');
    const rid = parseInt(req.params.id, 10) || 0;
    const rx = await one('SELECT * FROM tbl_opd_prescription WHERE id=? LIMIT 1', [rid]);
    if (!rx) return res.redirect('back?err=Prescription+not+found');
    if (rx.locked) return res.redirect('back?err=Prescription+is+locked');

    const given = await one(
      'SELECT COUNT(*) AS n FROM tbl_opd_dose_slot WHERE prescription_id=? AND administered=1',
      [rid]
    );
    if (given && given.n > 0) {
      return res.redirect(
        `/opd/treatment/${rx.opd_visit_id}?err=Cannot+delete+-+some+doses+already+administered`
      );
    }
    await removeOpdPrescriptionBill(pool, rx);
    await pool.query('DELETE FROM tbl_opd_dose_slot WHERE prescription_id=? AND administered=0', [rid]);
    await pool.query('DELETE FROM tbl_opd_prescription WHERE id=?', [rid]);
    res.redirect(`/opd/treatment/${rx.opd_visit_id}?msg=Prescription+removed`);
  });

  app.post('/opd/prescription/:id/revise', requireAuth, requireOpdMutate, async (req, res) => {
    if (!isDoctor(req, res)) return res.redirect('back?err=Only+a+doctor+can+revise');
    await ensureOpdMedSchema(pool);
    const rid = parseInt(req.params.id, 10) || 0;
    const rx = await one('SELECT * FROM tbl_opd_prescription WHERE id=? LIMIT 1', [rid]);
    if (!rx || rx.locked) return res.redirect('back?err=Prescription+not+found+or+locked');
    const t = await one('SELECT * FROM tbl_opd_treatment WHERE id=? LIMIT 1', [rx.treatment_id]);
    if (!t || t.status !== 'active') {
      return res.redirect(`/opd/treatment/${rx.opd_visit_id}?err=Treatment+is+not+active`);
    }

    const action = String(req.body.revise_action || 'labels').toLowerCase();
    const vid = rx.opd_visit_id;

    if (action === 'extend') {
      const extra = Math.min(60, Math.max(1, parseInt(req.body.extra_duration_days, 10) || 0));
      if (!extra) return res.redirect(`/opd/treatment/${vid}?err=Enter+days+to+extend`);
      await pool.query('UPDATE tbl_opd_prescription SET duration_days = duration_days + ? WHERE id=?', [extra, rid]);
      const fresh = await one('SELECT * FROM tbl_opd_prescription WHERE id=? LIMIT 1', [rid]);
      if (fresh) await syncOpdPrescriptionBill(pool, req, fresh);
      return res.redirect(`/opd/treatment/${vid}?msg=Plan+extended`);
    }

    if (action === 'shorten') {
      const newDur = Math.min(90, Math.max(1, parseInt(req.body.new_duration_days, 10) || 0));
      const givenRow = await one(
        'SELECT COUNT(*) AS n FROM tbl_opd_dose_slot WHERE prescription_id=? AND administered=1',
        [rid]
      );
      const slotsGiven = givenRow && Number(givenRow.n) > 0 ? Number(givenRow.n) : 0;
      const tpd = Math.max(1, parseInt(rx.times_per_day, 10) || 1);
      const minDur = Math.ceil(slotsGiven / tpd);
      if (newDur < minDur) {
        return res.redirect(
          `/opd/treatment/${vid}?err=` + encodeURIComponent(`Duration must be ≥ ${minDur} day(s).`)
        );
      }
      const totRow = await one('SELECT COUNT(*) AS n FROM tbl_opd_dose_slot WHERE prescription_id=?', [rid]);
      const T = Number(totRow && totRow.n) || 0;
      const targetTotal = newDur * tpd;
      if (T > targetTotal) {
        await pool.query(
          `DELETE FROM tbl_opd_dose_slot WHERE prescription_id=? AND administered=0
             ORDER BY scheduled_at DESC LIMIT ?`,
          [rid, T - targetTotal]
        );
      }
      await pool.query('UPDATE tbl_opd_prescription SET duration_days=? WHERE id=?', [newDur, rid]);
      const fresh = await one('SELECT * FROM tbl_opd_prescription WHERE id=? LIMIT 1', [rid]);
      if (fresh) await syncOpdPrescriptionBill(pool, req, fresh);
      return res.redirect(`/opd/treatment/${vid}?msg=Plan+shortened`);
    }

    const pricing = await resolveRxPricingFromBody(req.body);
    const f = {
      drug_name: pricing.name || (req.body.drug_name || '').trim(),
      drug_type: (req.body.drug_type || 'tablet').toString().trim(),
      dosage: (req.body.dosage || '').toString().trim(),
      route: (req.body.route || 'oral').toString().trim(),
      frequency_label: (req.body.frequency_label || 'TDS').toString().trim(),
      times_per_day: Math.min(8, Math.max(1, parseInt(req.body.times_per_day, 10) || 1)),
      duration_days: Math.min(90, Math.max(1, parseInt(req.body.duration_days, 10) || 1)),
      scheduled_times: (req.body.scheduled_times || '').toString().trim() || null,
      unit_price: pricing.isCustom ? 0 : pricing.unitPrice,
      treatment_start: parseTreatmentStart(req.body, rx.treatment_start),
      notes: (req.body.notes || '').toString().trim() || null,
    };

    const givenRow = await one(
      'SELECT COUNT(*) AS n FROM tbl_opd_dose_slot WHERE prescription_id=? AND administered=1',
      [rid]
    );
    const slotsGiven = givenRow && Number(givenRow.n) > 0 ? Number(givenRow.n) : 0;

    if (action === 'replace' && slotsGiven === 0) {
      await pool.query('DELETE FROM tbl_opd_dose_slot WHERE prescription_id=? AND administered=0', [rid]);
      await pool.query(
        `UPDATE tbl_opd_prescription SET
           drug_name=?, drug_type=?, dosage=?, route=?, frequency_label=?, times_per_day=?,
           duration_days=?, scheduled_times=?, unit_price=?, treatment_start=?, notes=?
         WHERE id=?`,
        [
          f.drug_name, f.drug_type, f.dosage, f.route, f.frequency_label, f.times_per_day,
          f.duration_days, f.scheduled_times, f.unit_price, f.treatment_start, f.notes, rid,
        ]
      );
      const updated = await one('SELECT * FROM tbl_opd_prescription WHERE id=? LIMIT 1', [rid]);
      await generateDoseSlots({
        id: rid,
        treatment_id: updated.treatment_id,
        opd_visit_id: updated.opd_visit_id,
        patient_id: updated.patient_id,
        times_per_day: updated.times_per_day,
        duration_days: updated.duration_days,
        scheduled_times: updated.scheduled_times,
        treatment_start: updated.treatment_start,
      });
      if (updated) await syncOpdPrescriptionBill(pool, req, updated);
      return res.redirect(`/opd/treatment/${vid}?msg=Medication+updated`);
    }

    if (action === 'labels' || (action === 'replace' && slotsGiven > 0)) {
      if (!f.dosage) return res.redirect(`/opd/treatment/${vid}?err=Dosage+is+required`);
      await pool.query(
        `UPDATE tbl_opd_prescription SET
           dosage=?, notes=?, frequency_label=?, route=?, drug_type=?, treatment_start=?
         WHERE id=?`,
        [f.dosage, f.notes, f.frequency_label, f.route, f.drug_type, f.treatment_start, rid]
      );
      return res.redirect(`/opd/treatment/${vid}?msg=Prescription+updated`);
    }

    return res.redirect(`/opd/treatment/${vid}?err=Unknown+action`);
  });

  app.get('/opd/chart/:visit_id', requireAuth, requireOpdView, async (req, res) => {
    await ensureOpdMedSchema(pool);
    const visitId = parseInt(req.params.visit_id, 10) || 0;
    const visit = await loadVisit(visitId);
    if (!visit) return res.redirect('/opd-queue?err=Visit+not+found');

    const active = await one(
      `SELECT * FROM tbl_opd_treatment WHERE opd_visit_id=? AND status='active' LIMIT 1`,
      [visitId]
    );

    const slots = active
      ? await sq(
          `SELECT s.*, r.drug_name, r.dosage, r.route, r.frequency_label,
                  CONCAT(n.first_name,' ',n.last_name) AS nurse_name
             FROM tbl_opd_dose_slot s
             JOIN tbl_opd_prescription r ON r.id = s.prescription_id
             LEFT JOIN tbl_employee n ON n.id = s.administered_by
            WHERE s.treatment_id = ?
              AND (s.administered = 1 OR s.hidden_on_terminate = 0)
              AND s.scheduled_at BETWEEN DATE_SUB(NOW(), INTERVAL 12 HOUR)
                                     AND DATE_ADD(NOW(), INTERVAL 24 HOUR)
            ORDER BY s.scheduled_at ASC`,
          [active.id]
        )
      : [];

    const { opdPageData } = require('../lib/reactRouteHelpers');
    res.render('opd-drug-chart', {
      title: 'OPD Drug Chart',
      visit,
      ...opdPageData('drug-chart', {
        visit,
        active,
        slots,
        canAdminister: isNurse(req, res) && active && active.status === 'active',
        userRole: userRole(req),
      }),
    });
  });

  app.post('/opd/dose/:id/administer', requireAuth, requireOpdMutate, async (req, res) => {
    if (!isNurse(req, res)) return res.redirect('back?err=Only+nurses+can+administer+doses');
    await ensureOpdMedSchema(pool);
    const sid = parseInt(req.params.id, 10) || 0;
    const slot = await one(
      `SELECT s.*, r.drug_name, r.dosage, t.status AS treatment_status, t.doctor_id, t.alert_on_administer
         FROM tbl_opd_dose_slot s
         JOIN tbl_opd_prescription r ON r.id = s.prescription_id
         JOIN tbl_opd_treatment t ON t.id = s.treatment_id
        WHERE s.id = ? LIMIT 1`,
      [sid]
    );
    if (!slot) return res.redirect('back?err=Dose+not+found');
    if (slot.treatment_status !== 'active') {
      return res.redirect(`/opd/chart/${slot.opd_visit_id}?err=Treatment+is+terminated`);
    }
    if (slot.administered) {
      return res.redirect(`/opd/chart/${slot.opd_visit_id}`);
    }

    const nurseComment = String(req.body.nurse_comment || '').trim().slice(0, 500) || null;
    await pool.query(
      `UPDATE tbl_opd_dose_slot
          SET administered=1, administered_at=NOW(), administered_by=?, nurse_comment=?, admin_locked=1
        WHERE id=? AND administered=0`,
      [userId(req), nurseComment, sid]
    );

    if (Number(slot.alert_on_administer) === 1) {
      const [[nurse]] = await pool
        .query('SELECT first_name, last_name FROM tbl_employee WHERE id=? LIMIT 1', [userId(req)])
        .catch(() => [[null]]);
      const nurseDisplay = nurse
        ? `${String(nurse.first_name || '').trim()} ${String(nurse.last_name || '').trim()}`.trim()
        : 'Nurse';
      await opdDoctorMedAlerts.enqueueDoseAdministeredAlert(pool, {
        facility_id: req.session?.facilityId || 1,
        opd_visit_id: slot.opd_visit_id,
        patient_id: slot.patient_id,
        target_doctor_id: slot.doctor_id,
        prescription_id: slot.prescription_id,
        dose_slot_id: sid,
        drug_display: slot.drug_name,
        dose_display: slot.dosage,
        nurse_display: nurseDisplay,
      });
    }

    const back = (req.body.return_to || 'chart') === 'treatment' ? 'treatment' : 'chart';
    res.redirect(`/opd/${back}/${slot.opd_visit_id}?msg=Dose+administered`);
  });

  app.post('/opd/med-alert/:id/ack', requireAuth, requireOpdView, async (req, res) => {
    const aid = parseInt(req.params.id, 10) || 0;
    await opdDoctorMedAlerts.acknowledge(pool, aid, userId(req));
    const vid = parseInt(req.body.visit_id, 10) || 0;
    if (vid > 0) return res.redirect(`/opd/treatment/${vid}`);
    return res.redirect('back');
  });
};
