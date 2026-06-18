'use strict';

const ipdHosp = require('../lib/ipdHospitalization');

module.exports = function ipdHospitalizationRoutes(app, pool, requireAuth, requirePerm) {
  const ipdRead = requirePerm(
    'adt.read',
    'adt.write',
    'nursing.read',
    'nursing.write',
    'clinical.read',
    'clinical.write'
  );
  const ipdWrite = requirePerm('adt.write', 'clinical.write', 'nursing.write');

  function redirectWards(msg, err) {
    const q = msg ? `?msg=${encodeURIComponent(msg)}` : err ? `?err=${encodeURIComponent(err)}` : '';
    return `/wards${q}`;
  }

  // ── Hub ─────────────────────────────────────────────────────────────
  app.get('/ipd', requireAuth, ipdRead, async (req, res) => {
    try {
      const nd = ipdHosp.NOT_DISCHARGED;
      const [[stats]] = await pool.query(`
        SELECT
          SUM(CASE WHEN ${nd} THEN 1 ELSE 0 END) AS active_count,
          SUM(CASE WHEN ${ipdHosp.IS_DISCHARGED} THEN 1 ELSE 0 END) AS completed_count,
          SUM(CASE WHEN ${nd} AND a.ipd_status='clinical_discharged' THEN 1 ELSE 0 END) AS awaiting_financial
        FROM tbl_admission a`).catch(() => [[{ active_count: 0, completed_count: 0, awaiting_financial: 0 }]]);
      const [[bedStats]] = await pool.query(`
        SELECT
          COUNT(*) AS total,
          SUM(status='available') AS avail,
          SUM(status='occupied') AS occ,
          SUM(status='housekeeping') AS hk,
          SUM(status='reserved') AS reserved,
          SUM(status='out_of_service') AS oos
        FROM tbl_bed`).catch(() => [[{}]]);
      res.render('ipd-hub', {
        title: 'Hospitalization (IPD) — ZAIZENS',
        pageData: {
          stats: stats || {},
          bedStats: bedStats || {},
          flash: req.query.msg || null,
          error: req.query.err || null,
        },
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  // ── Hospitalizations list ───────────────────────────────────────────
  app.get('/ipd/hospitalizations', requireAuth, ipdRead, async (req, res) => {
    const filter = String(req.query.filter || 'active');
    const nd = ipdHosp.NOT_DISCHARGED;
    let where = nd;
    if (filter === 'completed') where = ipdHosp.IS_DISCHARGED;
    else if (filter === 'all') where = '1=1';
    const safeAdm = ipdHosp.safeDateTimeSql('a.admitted_at');
    const safeDis = ipdHosp.safeDateTimeSql('a.discharged_at');
    try {
      const [rows] = await pool.query(`
        SELECT a.id, a.patient_id, a.ipd_status, ${safeAdm} AS admitted_at, ${safeDis} AS discharged_at,
               a.hospitalization_reason, a.running_bill, a.deposit_amount,
               p.first_name, p.last_name, b.ward_name, b.bed_label,
               (SELECT COUNT(*) FROM tbl_ipd_surgery s WHERE s.admission_id=a.id AND s.status NOT IN ('cancelled')) AS surgery_count
        FROM tbl_admission a
        JOIN tbl_patient p ON p.id = a.patient_id
        LEFT JOIN tbl_bed b ON b.id = a.bed_id
        WHERE ${where}
        ORDER BY ${ipdHosp.ORDER_ADMISSION_RECENT}
        LIMIT 200`);
      const { ipdPageData } = require('../lib/reactRouteHelpers');
      res.render('ipd-hospitalizations', {
        title: 'Hospitalizations — ZAIZENS',
        ...ipdPageData('hospitalizations', {
          rows: (rows || []).map((r) => ({
            ...r,
            patient_name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          })),
          filter,
          flash: req.query.msg || null,
          error: req.query.err || null,
        }),
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  // ── Hospitalization detail ──────────────────────────────────────────
  app.get('/ipd/hospitalization/:id', requireAuth, ipdRead, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    if (id < 1) return res.redirect('/ipd/hospitalizations?err=Invalid+admission');
    try {
      const adm = await ipdHosp.loadAdmissionDetail(pool, id);
      if (!adm) return res.redirect('/ipd/hospitalizations?err=Admission+not+found');
      try {
        await ipdHosp.ensureAdmissionChecklists(pool, id);
      } catch (_) { /* schema may not be migrated yet */ }
      const checklist = await ipdHosp.getChecklistProgress(pool, id).catch(() => ({
        rows: [],
        byType: { admission: [], pre_ward: [], pre_op: [] },
        done: 0,
        total: 0,
        pct: 0,
      }));
      const forecast =
        (await ipdHosp.getInvoiceForecast(pool, id)) || {
          los_days: 0,
          lines: [],
          charges_total: 0,
          running_bill: 0,
          deposit: 0,
          balance_due: 0,
          forecast_total: 0,
        };
      const [surgeries] = await pool
        .query(
          `SELECT s.*, t.name AS template_name, e.first_name AS surg_fn, e.last_name AS surg_ln, ot.name AS ot_name
         FROM tbl_ipd_surgery s
         LEFT JOIN tbl_ipd_surgery_template t ON t.id = s.template_id
         LEFT JOIN tbl_employee e ON e.id = s.surgeon_id
         LEFT JOIN tbl_ipd_operation_theater ot ON ot.id = s.operation_theater_id
         WHERE s.admission_id = ?
         ORDER BY s.id DESC`,
          [id]
        )
        .catch(() => [[]]);
      const [[death]] = await pool
        .query('SELECT * FROM tbl_death_registry WHERE admission_id=? LIMIT 1', [id])
        .catch(() => [[]]);
      const [employees] = await pool.query(
        `SELECT id, first_name, last_name FROM tbl_employee WHERE status=1 ORDER BY first_name LIMIT 500`
      ).catch(() => [[]]);
      const [carePlans] = await pool.query(
        'SELECT id, name FROM tbl_ipd_care_plan_template WHERE active=1 ORDER BY name'
      ).catch(() => [[]]);
      const [surgeryTemplates] = await pool.query(
        'SELECT id, code, name, default_charge FROM tbl_ipd_surgery_template WHERE active=1 ORDER BY name'
      ).catch(() => [[]]);
      const [ots] = await pool.query(
        'SELECT id, name FROM tbl_ipd_operation_theater WHERE active=1 ORDER BY name'
      ).catch(() => [[]]);
      const tab = String(req.query.tab || 'overview');
      const { ipdPageData } = require('../lib/reactRouteHelpers');
      const detailPayload = {
        adm,
        checklist,
        forecast,
        surgeries: surgeries || [],
        death: death || null,
        tab,
        employees: employees || [],
        carePlans: carePlans || [],
        surgeryTemplates: surgeryTemplates || [],
        operationTheaters: ots || [],
        flash: req.query.msg || null,
        error: req.query.err || null,
      };
      res.render('ipd-hospitalization-detail', {
        title: `Hospitalization #${id} — ZAIZENS`,
        ...detailPayload,
        ...ipdPageData('hospitalization-detail', detailPayload),
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/ipd/hospitalization/:id/update', requireAuth, ipdWrite, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const back = `/ipd/hospitalization/${id}?tab=overview`;
    try {
      await pool.query(
        `UPDATE tbl_admission SET
          relative_name=?, relative_phone=?, relative_relation=?,
          hospitalization_reason=?, primary_surgeon_id=?, primary_nurse_id=?,
          care_plan_template_id=?, legal_case_notes=?
         WHERE id=?`,
        [
          (req.body.relative_name || '').trim() || null,
          (req.body.relative_phone || '').trim() || null,
          (req.body.relative_relation || '').trim() || null,
          (req.body.hospitalization_reason || '').trim() || null,
          parseInt(req.body.primary_surgeon_id, 10) || null,
          parseInt(req.body.primary_nurse_id, 10) || null,
          parseInt(req.body.care_plan_template_id, 10) || null,
          (req.body.legal_case_notes || '').trim() || null,
          id,
        ]
      );
      res.redirect(`${back}&msg=${encodeURIComponent('Hospitalization updated.')}`);
    } catch (e) {
      res.redirect(`${back}&err=${encodeURIComponent(e.message)}`);
    }
  });

  app.post('/ipd/hospitalization/:id/checklist', requireAuth, ipdWrite, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const templateId = parseInt(req.body.template_id, 10) || 0;
    const done = req.body.done === '1';
    const uid = req.session.userId || req.session.user?.id || null;
    try {
      await ipdHosp.ensureAdmissionChecklists(pool, id);
      if (done) {
        await pool.query(
          `INSERT INTO tbl_ipd_admission_checklist (admission_id, template_id, completed_at, completed_by)
           VALUES (?,?,NOW(),?)
           ON DUPLICATE KEY UPDATE completed_at=NOW(), completed_by=VALUES(completed_by)`,
          [id, templateId, uid]
        );
      } else {
        await pool.query(
          'UPDATE tbl_ipd_admission_checklist SET completed_at=NULL, completed_by=NULL WHERE admission_id=? AND template_id=?',
          [id, templateId]
        );
      }
      res.redirect(`/ipd/hospitalization/${id}?tab=checklists&msg=Checklist+updated`);
    } catch (e) {
      res.redirect(`/ipd/hospitalization/${id}?tab=checklists&err=${encodeURIComponent(e.message)}`);
    }
  });

  app.post('/ipd/hospitalization/:id/surgery', requireAuth, requirePerm('clinical.write', 'adt.write'), async (req, res) => {
    const admissionId = parseInt(req.params.id, 10) || 0;
    const uid = req.session.userId || req.session.user?.id || null;
    try {
      const [[adm]] = await pool.query('SELECT patient_id FROM tbl_admission WHERE id=?', [admissionId]);
      if (!adm) throw new Error('Admission not found');
      const templateId = parseInt(req.body.template_id, 10) || null;
      let title = (req.body.title || '').trim();
      let charge = parseFloat(req.body.charge_amount) || 0;
      if (templateId) {
        const [[tpl]] = await pool.query(
          'SELECT name, default_charge FROM tbl_ipd_surgery_template WHERE id=?',
          [templateId]
        );
        if (tpl) {
          if (!title) title = tpl.name;
          if (!charge) charge = Number(tpl.default_charge) || 0;
        }
      }
      if (!title) title = 'Surgery';
      await pool.query(
        `INSERT INTO tbl_ipd_surgery
         (admission_id, patient_id, template_id, surgeon_id, operation_theater_id, title, status,
          scheduled_at, charge_amount, print_in_discharge, created_by)
         VALUES (?,?,?,?,?,?,'scheduled',?,?,?,?)`,
        [
          admissionId,
          adm.patient_id,
          templateId,
          parseInt(req.body.surgeon_id, 10) || null,
          parseInt(req.body.operation_theater_id, 10) || null,
          title,
          req.body.scheduled_at || null,
          charge,
          req.body.print_in_discharge === '1' ? 1 : 0,
          uid,
        ]
      );
      if (charge > 0) {
        const { admissionAcceptsNewCharges } = require('../lib/ipdSettlementGuard');
        const guard = await admissionAcceptsNewCharges(pool, admissionId);
        if (!guard.ok) {
          return res.redirect(
            `/ipd/hospitalization/${admissionId}?tab=surgery&err=${encodeURIComponent('Cannot add surgery charge: admission bill already settled at cashier.')}`
          );
        }
        await pool.query(
          `INSERT INTO tbl_ipd_charge (facility_id, admission_id, patient_id, charge_type, description, amount, added_by, source_module)
           VALUES (?, ?, ?, 'procedure', ?, ?, ?, 'ipd_surgery')`,
          [req.session.facilityId || 1, admissionId, adm.patient_id, `Surgery: ${title}`, charge, uid]
        );
        await pool.query(
          'UPDATE tbl_admission SET running_bill = COALESCE(running_bill,0) + ? WHERE id=?',
          [charge, admissionId]
        );
      }
      res.redirect(`/ipd/hospitalization/${admissionId}?tab=surgery&msg=Surgery+scheduled`);
    } catch (e) {
      res.redirect(`/ipd/hospitalization/${admissionId}?tab=surgery&err=${encodeURIComponent(e.message)}`);
    }
  });

  app.post('/ipd/surgery/:id/complete', requireAuth, requirePerm('clinical.write'), async (req, res) => {
    const sid = parseInt(req.params.id, 10) || 0;
    try {
      const [[s]] = await pool.query('SELECT admission_id FROM tbl_ipd_surgery WHERE id=?', [sid]);
      await pool.query(
        `UPDATE tbl_ipd_surgery SET status='completed', completed_at=NOW(), notes=COALESCE(?,notes) WHERE id=?`,
        [(req.body.notes || '').trim() || null, sid]
      );
      res.redirect(`/ipd/hospitalization/${s?.admission_id || 0}?tab=surgery&msg=Surgery+marked+complete`);
    } catch (e) {
      res.redirect(`/ipd?err=${encodeURIComponent(e.message)}`);
    }
  });

  // Death registry — legacy paths redirect in routes/deathRegistry.js

  // ── Configuration hub ───────────────────────────────────────────────
  app.get('/ipd/config', requireAuth, requirePerm('adt.write', 'access_control.manage', 'clinical.write'), async (req, res) => {
    const section = String(req.query.section || 'checklists');
    try {
      const [checklists] = await pool.query(
        'SELECT * FROM tbl_ipd_checklist_template ORDER BY checklist_type, sort_order'
      );
      const [surgeryTpl] = await pool.query(
        'SELECT * FROM tbl_ipd_surgery_template ORDER BY name'
      );
      const [buildings] = await pool.query('SELECT * FROM tbl_ipd_building ORDER BY name');
      const [ots] = await pool.query(
        `SELECT ot.*, b.name AS building_name FROM tbl_ipd_operation_theater ot
         LEFT JOIN tbl_ipd_building b ON b.id = ot.building_id ORDER BY ot.name`
      );
      const [carePlans] = await pool.query('SELECT * FROM tbl_ipd_care_plan_template ORDER BY name');
      const { ipdPageData } = require('../lib/reactRouteHelpers');
      res.render('ipd-config', {
        title: 'IPD Configuration — ZAIZENS',
        ...ipdPageData('config', {
          section,
          checklists: checklists || [],
          surgeryTpl: surgeryTpl || [],
          buildings: buildings || [],
          operationTheaters: ots || [],
          carePlans: carePlans || [],
          flash: req.query.msg || null,
          error: req.query.err || null,
          title: 'IPD configuration',
          rows: (checklists || []).map((c) => ({ id: c.id, label: c.label || c.name, value: c.checklist_type })),
          columns: [
            { key: 'label', label: 'Checklist' },
            { key: 'value', label: 'Type' },
          ],
        }),
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/ipd/config/checklist', requireAuth, requirePerm('adt.write', 'access_control.manage'), async (req, res) => {
    try {
      await pool.query(
        `INSERT INTO tbl_ipd_checklist_template (checklist_type, label, sort_order, active) VALUES (?,?,?,1)`,
        [req.body.checklist_type || 'admission', (req.body.label || '').trim(), parseInt(req.body.sort_order, 10) || 0]
      );
      res.redirect('/ipd/config?section=checklists&msg=Checklist+item+added');
    } catch (e) {
      res.redirect(`/ipd/config?section=checklists&err=${encodeURIComponent(e.message)}`);
    }
  });

  app.post('/ipd/config/surgery-template', requireAuth, requirePerm('adt.write', 'clinical.write'), async (req, res) => {
    try {
      await pool.query(
        `INSERT INTO tbl_ipd_surgery_template (code, name, default_charge, summary_text, active) VALUES (?,?,?,?,1)`,
        [
          (req.body.code || '').trim() || null,
          (req.body.name || '').trim(),
          parseFloat(req.body.default_charge) || 0,
          (req.body.summary_text || '').trim() || null,
        ]
      );
      res.redirect('/ipd/config?section=surgery&msg=Template+saved');
    } catch (e) {
      res.redirect(`/ipd/config?section=surgery&err=${encodeURIComponent(e.message)}`);
    }
  });

  app.post('/ipd/config/building', requireAuth, requirePerm('adt.write'), async (req, res) => {
    try {
      await pool.query('INSERT INTO tbl_ipd_building (name, notes, active) VALUES (?,?,1)', [
        (req.body.name || '').trim(),
        (req.body.notes || '').trim() || null,
      ]);
      res.redirect('/ipd/config?section=facilities&msg=Building+added');
    } catch (e) {
      res.redirect(`/ipd/config?section=facilities&err=${encodeURIComponent(e.message)}`);
    }
  });

  app.post('/ipd/config/operation-theater', requireAuth, requirePerm('adt.write'), async (req, res) => {
    try {
      await pool.query('INSERT INTO tbl_ipd_operation_theater (building_id, name, active) VALUES (?,?,1)', [
        parseInt(req.body.building_id, 10) || null,
        (req.body.name || '').trim(),
      ]);
      res.redirect('/ipd/config?section=facilities&msg=Operation+theater+added');
    } catch (e) {
      res.redirect(`/ipd/config?section=facilities&err=${encodeURIComponent(e.message)}`);
    }
  });

  app.post('/ipd/config/care-plan', requireAuth, requirePerm('adt.write', 'clinical.write'), async (req, res) => {
    try {
      await pool.query('INSERT INTO tbl_ipd_care_plan_template (name, description, active) VALUES (?,?,1)', [
        (req.body.name || '').trim(),
        (req.body.description || '').trim() || null,
      ]);
      res.redirect('/ipd/config?section=careplans&msg=Care+plan+added');
    } catch (e) {
      res.redirect(`/ipd/config?section=careplans&err=${encodeURIComponent(e.message)}`);
    }
  });

  app.get('/api/ipd/hospitalization/:id/forecast', requireAuth, ipdRead, async (req, res) => {
    try {
      const forecast = await ipdHosp.getInvoiceForecast(pool, parseInt(req.params.id, 10));
      res.json({ ok: true, forecast });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });
};
