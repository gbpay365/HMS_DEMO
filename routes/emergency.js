// ============================================================
// EMERGENCY DEPARTMENT — revamped 4-phase workflow
// routes/emergency.js
//
// Phase 1: Arrival → Quick Reg → Triage (acuity + vitals + bed)
// Phase 2: Doctor SOAP + parallel orders (lab/rad/pharm/blood)
// Phase 3: Disposition (Discharge / SSU / IPD / OT / Transfer / Deceased / LWBS)
// Phase 4: Real-time charge capture → ER closure → bill settlement
// + MLC lock / tri-copy report
// + KPI dashboard (door-to-doctor, LWBS rate, ER→IPD rate, etc.)
//
// Schema is created by lib/ensureEmergencySchema.js at boot.
// ============================================================
const crypto = require('crypto');
const { formatMoney: fmtMoney } = require('../lib/hmsMoneyFormat');
const syncEmergencyCashierTickets = require('../lib/syncEmergencyCashierTickets');
const { buildClinicalDetailFromBody, summarizeChargeClinical } = require('../lib/ipdChargeClinical');
const clinicalDeptAlerts = require('../lib/clinicalDeptAlerts');
const doctorErAlerts = require('../lib/doctorErAlerts');
const { fetchActiveDoctors } = require('../lib/hmsDoctorStaff');
const { createErIpdAdmission } = require('../lib/createErIpdAdmission');
const { enqueueClinicalAlertFromCharge } = require('../lib/enqueueClinicalAlertFromCharge');

module.exports = function (app, pool, requireAuth) {

  // ──────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────
  const ACUITY = {
    0: { label: 'Awaiting Triage', color: '#f59e0b', bg: '#fef3c7', sla: null, short: 'L0' },
    1: { label: 'Resuscitation', color: '#7f1d1d', bg: '#fee2e2', sla: 0,  short: 'L1' },
    2: { label: 'Emergent',      color: '#b45309', bg: '#fef3c7', sla: 10, short: 'L2' },
    3: { label: 'Urgent',        color: '#92400e', bg: '#fef9c3', sla: 30, short: 'L3' },
    4: { label: 'Less urgent',   color: '#166534', bg: '#dcfce7', sla: 60, short: 'L4' },
    5: { label: 'Non-urgent',    color: '#1e40af', bg: '#dbeafe', sla: 120,short: 'L5' },
  };

  const sq = async (sql, p = []) => {
    try { const [r] = await pool.query(sql, p); return r || []; }
    catch (e) { console.warn('[emergency]', sql.split('\n')[0].slice(0,80), e.message); return []; }
  };
  const one = async (sql, p = []) => {
    const r = await sq(sql, p); return r[0] || null;
  };
  const userId = (req) => req.session && req.session.user ? Number(req.session.user.id) || null : null;

  /** Block triage/bed/orders/charges/etc. once ER visit is finished. */
  async function assertErVisitMutable(vid) {
    const v = await one(
      'SELECT id, queue_status, is_emergency FROM tbl_opd_visit WHERE id=? LIMIT 1',
      [vid]
    );
    if (!v) return { ok: false, msg: 'Visit not found.' };
    if (!Number(v.is_emergency)) return { ok: false, msg: 'Not an Emergency visit.' };
    const qs = String(v.queue_status || '').toLowerCase();
    if (qs === 'completed' || qs === 'cancelled' || qs === 'clinical_discharged') {
      return {
        ok: false,
        msg: 'This ER visit is closed for clinical edits — awaiting financial discharge or already completed.',
      };
    }
    return { ok: true, visit: v };
  }

  function redirectErVisitLocked(res, vid, msg, wantJson) {
    const q = encodeURIComponent(msg);
    if (wantJson) return res.json({ ok: false, error: msg });
    return res.redirect('/emergency/visit/' + vid + '?err=' + q);
  }

  /**
   * LWBS policy: do not leave pending cashier EMG tickets or unsettled ER charges.
   * Cancels pending EMG-SET tickets, marks all ER charges settled (waived), syncs credit total.
   */
  async function waiveLwbsEmergencyBilling(pool, visitId) {
    await pool
      .query(
        `UPDATE tbl_payment_ticket
            SET status = 'cancelled'
          WHERE status = 'pending'
            AND emergency_visit_id = ?
            AND (ticket_category = 'emergency_settlement' OR ticket_code LIKE 'EMG-SET-%')`,
        [visitId]
      )
      .catch(() => {});
    await pool
      .query(
        'UPDATE tbl_emergency_charge SET settled = 1 WHERE visit_id = ? AND settled = 0',
        [visitId]
      )
      .catch(() => {});
    await pool
      .query(
        `UPDATE tbl_opd_visit v
            SET emg_credit_total = COALESCE(
              (SELECT SUM(c.amount) FROM tbl_emergency_charge c WHERE c.visit_id = v.id AND c.settled = 0),
              0
            )
          WHERE v.id = ?`,
        [visitId]
      )
      .catch(() => {});
  }

  /**
   * OPD consultation requires at least one row in tbl_vital_sign for this visit.
   * Mirror ER triage vitals into that table whenever triage is saved.
   */
  async function syncErTriageToNursingVitals(pool, facilityId, visitId, tri, createdBy) {
    const n = (v) => (v === '' || v == null ? null : Number(v));
    const bpSys = n(tri.bp_systolic);
    const bpDia = n(tri.bp_diastolic);
    const hr = n(tri.pulse);
    const tcRaw = n(tri.temp_celsius);
    const sp = n(tri.spo2);
    const rr = n(tri.respiratory_rate);
    const tc = Number.isFinite(tcRaw) ? tcRaw : null;
    const has =
      (bpSys != null && !Number.isNaN(bpSys)) ||
      (bpDia != null && !Number.isNaN(bpDia)) ||
      (hr != null && !Number.isNaN(hr)) ||
      (tc != null && !Number.isNaN(tc)) ||
      (sp != null && !Number.isNaN(sp)) ||
      (rr != null && !Number.isNaN(rr));
    if (!has) return;

    const vrow = await one('SELECT patient_id FROM tbl_opd_visit WHERE id=? LIMIT 1', [visitId]);
    if (!vrow || !vrow.patient_id) return;
    const pid = vrow.patient_id;
    const fid = facilityId || 1;
    const uid = createdBy || null;
    const syncNote = 'Synced from A&E triage';

    await pool
      .query(
        `
      CREATE TABLE IF NOT EXISTS tbl_vital_sign (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT DEFAULT 1,
        patient_id INT NOT NULL,
        opd_visit_id INT NULL,
        admission_id INT NULL,
        bp_sys INT NULL,
        bp_dia INT NULL,
        heart_rate INT NULL,
        temp_c DECIMAL(5,2) NULL,
        spo2 INT NULL,
        rr INT NULL,
        weight_kg DECIMAL(6,2) NULL,
        height_cm INT NULL,
        waist_cm DECIMAL(6,2) NULL,
        notes TEXT NULL,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY (patient_id),
        KEY (opd_visit_id)
      )`
      )
      .catch(() => {});
    await pool.query("ALTER TABLE tbl_vital_sign ADD COLUMN IF NOT EXISTS facility_id INT DEFAULT 1").catch(() => {});
    await pool.query("ALTER TABLE tbl_vital_sign ADD COLUMN IF NOT EXISTS opd_visit_id INT NULL").catch(() => {});
    await pool.query("ALTER TABLE tbl_vital_sign ADD COLUMN IF NOT EXISTS admission_id INT NULL").catch(() => {});
    const { insertVitalSign } = require('../lib/insertVitalSign');

    await pool
      .query('DELETE FROM tbl_vital_sign WHERE opd_visit_id=? AND patient_id=? AND notes=?', [visitId, pid, syncNote])
      .catch(() => {});

    await insertVitalSign(pool, {
      facility_id: fid,
      patient_id: pid,
      opd_visit_id: visitId,
      bp_sys: bpSys,
      bp_dia: bpDia,
      heart_rate: hr,
      temp_c: tc,
      spo2: sp,
      rr,
      notes: syncNote,
      recorded_by: uid,
      created_by: uid,
      source_station: 'emergency',
    }).catch((e) => {
      console.warn('[ER triage→tbl_vital_sign]', e.message);
    });
  }

  // Generate next MLC number e.g. MLC-2026-0001
  async function nextMlcNumber() {
    const year = new Date().getFullYear();
    const prefix = `MLC-${year}-`;
    const last = await one(
      'SELECT mlc_number FROM tbl_er_mlc WHERE mlc_number LIKE ? ORDER BY id DESC LIMIT 1',
      [prefix + '%']
    );
    let seq = 1;
    if (last && last.mlc_number) {
      const parts = String(last.mlc_number).split('-');
      seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
    }
    return prefix + String(seq).padStart(4, '0');
  }

  // ──────────────────────────────────────────────────────────
  // GET /emergency  → main triage board (5 acuity lanes)
  // ──────────────────────────────────────────────────────────
  app.get('/emergency', requireAuth, async (req, res) => {
    try {
      // All active ER visits with their latest triage row & bed.
      const active = await sq(`
        SELECT v.id, v.patient_id, v.ticket_number, v.queue_status,
               v.queue_started_at, v.chief_complaint, v.is_emergency,
               v.arrival_mode, v.referral_source, v.acuity_level,
               v.mlc_flag, v.lwbs, v.doctor_first_seen, v.er_bed_id,
               v.assigned_doctor_id,
               p.first_name, p.last_name, p.gender, p.dob, p.phone,
               TIMESTAMPDIFF(MINUTE, v.queue_started_at, NOW()) AS minutes_waiting,
               (SELECT SUM(amount) FROM tbl_emergency_charge WHERE visit_id=v.id) AS credit_total,
               t.bp_systolic, t.bp_diastolic, t.pulse, t.spo2, t.temp_celsius, t.gcs, t.pain_score,
               t.flag_trauma, t.flag_cardiac, t.flag_stroke, t.flag_pediatric,
               t.flag_psych, t.flag_obstetric,
               b.bed_code, b.bay_type, b.label AS bed_label,
               (SELECT COUNT(*) FROM tbl_er_order o WHERE o.visit_id=v.id) AS orders_count,
               (SELECT COUNT(*) FROM tbl_er_order o WHERE o.visit_id=v.id AND o.critical_alert=1 AND o.status!='completed') AS critical_count
          FROM tbl_opd_visit v
          JOIN tbl_patient p ON p.id = v.patient_id
          LEFT JOIN tbl_er_triage t ON t.visit_id = v.id
          LEFT JOIN tbl_er_bed b ON b.id = v.er_bed_id
         WHERE v.is_emergency = 1
           AND v.queue_status NOT IN ('completed','cancelled')
         ORDER BY COALESCE(v.acuity_level, 99) ASC, v.queue_started_at ASC
      `);

      // Group by acuity lane (untriaged → lane 0).
      const lanes = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] };
      for (const v of active) {
        const k = v.acuity_level || 0;
        if (!lanes[k]) lanes[k] = [];
        lanes[k].push(v);
      }

      const beds = await sq(
        `SELECT b.*,
                (SELECT CONCAT(p.first_name,' ',p.last_name)
                   FROM tbl_opd_visit v JOIN tbl_patient p ON p.id=v.patient_id
                  WHERE v.er_bed_id = b.id
                    AND v.queue_status NOT IN ('completed','cancelled')
                  LIMIT 1) AS occupant_name
           FROM tbl_er_bed b
          WHERE b.is_active = 1
          ORDER BY b.sort_order, b.bed_code`
      );

      const [patients, doctors] = await Promise.all([
        sq('SELECT id, first_name, last_name, phone FROM tbl_patient WHERE status=1 ORDER BY last_name, first_name LIMIT 2000'),
        fetchActiveDoctors(pool, 'e.id, e.first_name, e.last_name').catch(() => []),
      ]);

      // Quick KPIs (today only)
      const kpiRow = await one(`
        SELECT
          COUNT(*) AS total_today,
          SUM(lwbs=1)                                                AS lwbs_count,
          AVG(CASE WHEN doctor_first_seen IS NOT NULL
                   THEN TIMESTAMPDIFF(MINUTE, queue_started_at, doctor_first_seen)
              END)                                                    AS avg_door_to_doctor,
          SUM(CASE WHEN acuity_level = 1 THEN 1 ELSE 0 END)          AS l1_count,
          SUM(CASE WHEN acuity_level = 2 THEN 1 ELSE 0 END)          AS l2_count,
          SUM(mlc_flag=1)                                            AS mlc_count
          FROM tbl_opd_visit
         WHERE is_emergency = 1
           AND DATE(queue_started_at) = CURDATE()
      `) || {};

      const stats = {
        total:        active.length,
        untriaged:    lanes[0].length,
        l1:           lanes[1].length,
        l2:           lanes[2].length,
        l3:           lanes[3].length,
        l4:           lanes[4].length,
        l5:           lanes[5].length,
        critical:     active.filter(v => (v.critical_count || 0) > 0).length,
        creditTotal:  active.reduce((s, v) => s + parseFloat(v.credit_total || 0), 0),
        mlc:          active.filter(v => v.mlc_flag).length,
        beds: {
          total:      beds.length,
          occupied:   beds.filter(b => b.occupant_name).length,
        },
        today: {
          total:                Number(kpiRow.total_today)          || 0,
          lwbs:                 Number(kpiRow.lwbs_count)           || 0,
          avgDoorToDoctorMin:   kpiRow.avg_door_to_doctor != null ? Math.round(Number(kpiRow.avg_door_to_doctor)) : null,
          l1:                   Number(kpiRow.l1_count)             || 0,
          l2:                   Number(kpiRow.l2_count)             || 0,
          mlc:                  Number(kpiRow.mlc_count)            || 0,
        },
      };

      const staffDoctorId = parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || 0;
      const myDoctorQueue = (active || []).filter((v) => {
        const doc = parseInt(v.assigned_doctor_id, 10) || 0;
        if (!doc || doc !== staffDoctorId) return false;
        const qs = String(v.queue_status || '');
        return ['waiting_doctor', 'in_consultation', 'waiting_triage'].includes(qs);
      });

      res.render('emergency', {
        title:    'Emergency Department — ZAIZENS',
        pageData: {
          lanes,
          beds,
          stats,
          acuity: ACUITY,
          patients,
          doctors,
          staffDoctorId,
          myDoctorQueue,
          flash: req.query.msg || null,
          error: req.query.err || null,
        },
      });
    } catch (err) {
      console.error('EMERGENCY ERROR:', err.message);
      res.status(500).render('error', { title: 'Error', message: 'Emergency load failure: ' + err.message, status: 500 });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /emergency/visit/:id  → full ER chart for one patient
  // ──────────────────────────────────────────────────────────
  app.get('/emergency/visit/:id', requireAuth, async (req, res) => {
    const vid = parseInt(req.params.id, 10);
    if (!vid) return res.redirect('/emergency?err=Invalid+visit');

    const visit = await one(`
      SELECT v.*, p.first_name, p.last_name, p.gender, p.dob, p.phone,
             p.address, p.email
        FROM tbl_opd_visit v
        JOIN tbl_patient p ON p.id = v.patient_id
       WHERE v.id = ? AND v.is_emergency = 1
       LIMIT 1`, [vid]);
    if (!visit) return res.redirect('/emergency?err=Visit+not+found');

    await syncEmergencyCashierTickets(pool).catch(() => {});

    const triage      = await one('SELECT * FROM tbl_er_triage WHERE visit_id=? LIMIT 1', [vid]);
    const bed         = visit.er_bed_id ? await one('SELECT * FROM tbl_er_bed WHERE id=?', [visit.er_bed_id]) : null;
    const beds        = await sq("SELECT * FROM tbl_er_bed WHERE is_active=1 AND (current_visit_id IS NULL OR current_visit_id=?) ORDER BY sort_order", [vid]);
    const orders      = await sq('SELECT * FROM tbl_er_order WHERE visit_id=? ORDER BY ordered_at DESC', [vid]);
    const chargesRaw = await sq('SELECT * FROM tbl_emergency_charge WHERE visit_id=? ORDER BY created_at ASC', [vid]);
    const charges = (chargesRaw || []).map((c) =>
      Object.assign({}, c, { clinical_summary: summarizeChargeClinical(c.clinical_detail) })
    );
    const disposition = await one('SELECT * FROM tbl_er_disposition WHERE visit_id=? LIMIT 1', [vid]);
    const mlc         = await one('SELECT * FROM tbl_er_mlc WHERE visit_id=? LIMIT 1', [vid]);
    const departments = await sq('SELECT department_name AS name FROM tbl_department WHERE status=1 ORDER BY department_name').catch(() => []);
    const erConsult   = await one('SELECT id FROM tbl_consultation WHERE opd_visit_id=? LIMIT 1', [vid]);

    const totalCharges = charges.reduce((s, c) => s + parseFloat(c.amount || 0), 0);

    res.render('emergency-visit', {
      title: 'ER Chart — ' + (visit.first_name || '') + ' ' + (visit.last_name || ''),
      visit,
      reactPage: 'emergency-visit',
      pageData: {
        visit,
        triage,
        bed,
        beds,
        orders,
        charges,
        disposition,
        mlc,
        departments,
        totalCharges,
        ACUITY,
        hasErConsultation: !!(erConsult && erConsult.id),
        flash: req.query.msg || null,
        error: req.query.err || null,
      },
    });
  });

  // ──────────────────────────────────────────────────────────
  // POST /emergency/quick-register
  // Phase 1.1 — create or re-use a patient, open ER visit
  // ──────────────────────────────────────────────────────────
  app.post('/emergency/quick-register', requireAuth, async (req, res) => {
    const {
      patient_id, first_name, last_name, gender, dob, age, phone,
      arrival_mode, referral_source, chief_complaint, mlc_flag,
      assigned_doctor_id
    } = req.body;
    const uid = userId(req);
    const fid = req.session && req.session.facilityId ? Number(req.session.facilityId) : 1;

    const chiefNorm = String(chief_complaint || '').trim();
    if (!chiefNorm) {
      return res.redirect('/emergency?err=' + encodeURIComponent('Chief complaint is required.'));
    }

    try {
      const { preparePatientRegistrationSchemas, ensurePatientWalletRow } = require('../lib/preparePatientRegistration');
      const { createErQuickPatient } = require('../lib/createErQuickPatient');
      const { ensureFacilityRow } = require('../lib/ensureFacilityRow');
      await preparePatientRegistrationSchemas(pool);

      let pid = parseInt(patient_id, 10) || 0;

      // (a) New unknown / quick patient — create minimal record.
      if (!pid) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          const facilityId = await ensureFacilityRow(conn, fid);
          const created = await createErQuickPatient(conn, {
            first_name,
            last_name,
            gender,
            dob,
            age,
            phone,
            facility_id: facilityId,
          });
          pid = created.patientId;
          await conn.commit();
          await ensurePatientWalletRow(pool, pid);
        } catch (erIns) {
          await conn.rollback().catch(() => {});
          throw erIns;
        } finally {
          conn.release();
        }
      }

      // (b) Create the ER visit row in tbl_opd_visit (anchor).
      const year   = new Date().getFullYear();
      const prefix = `ER-${year}-`;
      const last = await one(
        'SELECT ticket_number FROM tbl_opd_visit WHERE ticket_number LIKE ? ORDER BY id DESC LIMIT 1',
        [prefix + '%']
      );
      let seq = 1;
      if (last && last.ticket_number) {
        const parts = String(last.ticket_number).split('-');
        seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
      }
      const ticket = prefix + String(seq).padStart(4, '0');

      const isMlc = parseInt(mlc_flag, 10) ? 1 : 0;
      const [visitIns] = await pool.query(
        `INSERT INTO tbl_opd_visit
           (facility_id, patient_id, ticket_number, department, visit_date,
            is_emergency, mlc_flag, arrival_mode, referral_source,
            chief_complaint, queue_status, queue_started_at,
            waiver_reason, assigned_doctor_id, created_by)
         VALUES (?, ?, ?, 'Emergency / A&E', CURDATE(),
                 1, ?, ?, ?,
                 ?, 'waiting_triage', NOW(),
                 'Emergency — No prepayment', ?, ?)`,
        [
          fid, pid, ticket, isMlc,
          arrival_mode || 'walk_in',
          referral_source || null,
          chiefNorm,
          parseInt(assigned_doctor_id, 10) || null,
          uid,
        ]
      );
      let vid = parseInt(visitIns && visitIns.insertId, 10) || 0;
      if (!vid) {
        const visitRow = await one('SELECT id FROM tbl_opd_visit WHERE ticket_number = ? AND patient_id = ? LIMIT 1', [
          ticket,
          pid,
        ]);
        vid = parseInt(visitRow && visitRow.id, 10) || 0;
      }
      if (!vid) throw new Error('Could not resolve emergency visit after registration');
      const assignedDoc = parseInt(assigned_doctor_id, 10) || 0;
      if (assignedDoc > 0) {
        await doctorErAlerts.enqueueFromVisit(pool, vid, 'patient_arrival', {
          target_doctor_id: assignedDoc,
          created_by: uid,
        });
      } else {
        await doctorErAlerts.enqueueFromVisit(pool, vid, 'patient_arrival', {
          broadcast_if_unassigned: true,
          created_by: uid,
        });
      }
      res.redirect('/emergency/visit/' + vid + '?msg=' + encodeURIComponent('Patient registered. Proceed to Triage.'));
    } catch (err) {
      console.error('ER QUICK REG:', err.message);
      res.redirect('/emergency?err=' + encodeURIComponent('Registration failed: ' + err.message));
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /emergency/triage  → Phase 1.2  (acuity + vitals + bed)
  // ──────────────────────────────────────────────────────────
  app.post('/emergency/triage', requireAuth, async (req, res) => {
    const vid = parseInt(req.body.visit_id, 10) || 0;
    if (!vid) return res.redirect('/emergency?err=Invalid+visit');
    const st = await assertErVisitMutable(vid);
    if (!st.ok) return res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent(st.msg));
    const uid = userId(req);

    const body = req.body;
    const acuity = parseInt(body.acuity_level, 10);
    if (![1,2,3,4,5].includes(acuity)) {
      return res.redirect('/emergency/visit/' + vid + '?err=Pick+an+acuity+level+(1-5)');
    }

    const num = (v) => (v === '' || v == null) ? null : Number(v);
    const tri = {
      acuity_level: acuity,
      bp_systolic:  num(body.bp_systolic),
      bp_diastolic: num(body.bp_diastolic),
      pulse:        num(body.pulse),
      spo2:         num(body.spo2),
      temp_celsius: num(body.temp_celsius),
      respiratory_rate: num(body.respiratory_rate),
      gcs:          num(body.gcs),
      pain_score:   num(body.pain_score),
      flag_trauma:    body.flag_trauma    ? 1 : 0,
      flag_cardiac:   body.flag_cardiac   ? 1 : 0,
      flag_stroke:    body.flag_stroke    ? 1 : 0,
      flag_pediatric: body.flag_pediatric ? 1 : 0,
      flag_psych:     body.flag_psych     ? 1 : 0,
      flag_obstetric: body.flag_obstetric ? 1 : 0,
      chief_complaint: String(body.chief_complaint || '').trim() || null,
      bed_id:       parseInt(body.bed_id, 10) || null,
      triage_nurse_id: uid,
    };

    try {
      const fid = req.session && req.session.facilityId ? Number(req.session.facilityId) : 1;
      const existing = await one('SELECT id FROM tbl_er_triage WHERE visit_id=? LIMIT 1', [vid]);
      if (existing) {
        await pool.query(
          `UPDATE tbl_er_triage SET
             acuity_level=?, bp_systolic=?, bp_diastolic=?, pulse=?, spo2=?,
             temp_celsius=?, respiratory_rate=?, gcs=?, pain_score=?,
             flag_trauma=?, flag_cardiac=?, flag_stroke=?, flag_pediatric=?,
             flag_psych=?, flag_obstetric=?, chief_complaint=?, bed_id=?,
             triage_nurse_id=?
           WHERE id=?`,
          [tri.acuity_level, tri.bp_systolic, tri.bp_diastolic, tri.pulse, tri.spo2,
           tri.temp_celsius, tri.respiratory_rate, tri.gcs, tri.pain_score,
           tri.flag_trauma, tri.flag_cardiac, tri.flag_stroke, tri.flag_pediatric,
           tri.flag_psych, tri.flag_obstetric, tri.chief_complaint, tri.bed_id,
           tri.triage_nurse_id, existing.id]
        );
      } else {
        await pool.query(
          `INSERT INTO tbl_er_triage
             (visit_id, acuity_level, bp_systolic, bp_diastolic, pulse, spo2,
              temp_celsius, respiratory_rate, gcs, pain_score,
              flag_trauma, flag_cardiac, flag_stroke, flag_pediatric,
              flag_psych, flag_obstetric, chief_complaint, bed_id, triage_nurse_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [vid, tri.acuity_level, tri.bp_systolic, tri.bp_diastolic, tri.pulse, tri.spo2,
           tri.temp_celsius, tri.respiratory_rate, tri.gcs, tri.pain_score,
           tri.flag_trauma, tri.flag_cardiac, tri.flag_stroke, tri.flag_pediatric,
           tri.flag_psych, tri.flag_obstetric, tri.chief_complaint, tri.bed_id, tri.triage_nurse_id]
        );
      }

      // Mirror acuity & bed onto opd_visit + advance queue status.
      // Level 5 (non-urgent) is routed to OPD per spec — we still keep the
      // visit row in ER but advance the status so it is picked up there.
      const nextStatus = acuity === 5 ? 'waiting_doctor' : 'waiting_doctor';
      await pool.query(
        `UPDATE tbl_opd_visit
            SET acuity_level=?, er_bed_id=?, queue_status=?,
                chief_complaint = COALESCE(NULLIF(?, ''), chief_complaint)
          WHERE id=?`,
        [acuity, tri.bed_id, nextStatus, tri.chief_complaint || '', vid]
      );

      // Refresh bed occupancy pointers.
      if (tri.bed_id) {
        await pool.query('UPDATE tbl_er_bed SET current_visit_id=NULL WHERE current_visit_id=?', [vid]).catch(()=>{});
        await pool.query('UPDATE tbl_er_bed SET current_visit_id=? WHERE id=?', [vid, tri.bed_id]).catch(()=>{});
      }

      // Auto-add triage fee charge once (idempotent guard).
      const hasFee = await one(
        "SELECT id FROM tbl_emergency_charge WHERE visit_id=? AND charge_type='triage' LIMIT 1", [vid]
      );
      if (!hasFee) {
        const fee = acuity === 1 ? 5000 : acuity === 2 ? 4000 : acuity === 3 ? 3000 : acuity === 4 ? 2000 : 1500;
        await pool.query(
          `INSERT INTO tbl_emergency_charge
             (visit_id, patient_id, charge_type, description, amount, added_by, source_module)
           SELECT id, patient_id, 'triage', ?, ?, ?, 'er.triage'
             FROM tbl_opd_visit WHERE id=?`,
          [`Triage fee (Level ${acuity} — ${ACUITY[acuity].label})`, fee, uid, vid]
        ).catch(()=>{});
      }

      await syncErTriageToNursingVitals(pool, fid, vid, tri, uid);
      await syncEmergencyCashierTickets(pool).catch(() => {});

      const visitRow = await one('SELECT assigned_doctor_id FROM tbl_opd_visit WHERE id=? LIMIT 1', [vid]);
      const triageDoc = parseInt(visitRow && visitRow.assigned_doctor_id, 10) || 0;
      if (triageDoc > 0) {
        await doctorErAlerts.enqueueFromVisit(pool, vid, 'awaiting_doctor', {
          target_doctor_id: triageDoc,
          created_by: uid,
        });
      } else {
        await doctorErAlerts.enqueueFromVisit(pool, vid, 'awaiting_doctor', {
          broadcast_if_unassigned: true,
          created_by: uid,
        });
      }

      res.redirect('/emergency/visit/' + vid + '?msg=' + encodeURIComponent('Triage saved (Level ' + acuity + ' · ' + ACUITY[acuity].label + ')'));
    } catch (err) {
      console.error('ER TRIAGE:', err.message);
      res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent('Triage save failed: ' + err.message));
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /emergency/assign-bed
  // ──────────────────────────────────────────────────────────
  app.post('/emergency/assign-bed', requireAuth, async (req, res) => {
    const vid = parseInt(req.body.visit_id, 10);
    const bid = parseInt(req.body.bed_id, 10);
    if (!vid || !bid) return res.redirect('/emergency?err=Invalid+bed/visit');
    const st = await assertErVisitMutable(vid);
    if (!st.ok) return res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent(st.msg));
    try {
      await pool.query('UPDATE tbl_er_bed SET current_visit_id=NULL WHERE current_visit_id=?', [vid]).catch(()=>{});
      await pool.query('UPDATE tbl_er_bed SET current_visit_id=? WHERE id=?', [vid, bid]);
      await pool.query('UPDATE tbl_opd_visit SET er_bed_id=? WHERE id=?', [bid, vid]);
      await pool.query('UPDATE tbl_er_triage SET bed_id=? WHERE visit_id=?', [bid, vid]).catch(()=>{});
      res.redirect('/emergency/visit/' + vid + '?msg=Bed+assigned');
    } catch (err) {
      res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent(err.message));
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /emergency/doctor-seen — stamp when doctor first opens the chart
  // ──────────────────────────────────────────────────────────
  app.post('/emergency/doctor-seen', requireAuth, async (req, res) => {
    const vid = parseInt(req.body.visit_id, 10);
    const wantJson =
      String(req.get('Accept') || '').includes('application/json') ||
      String(req.get('Content-Type') || '').includes('application/json') ||
      req.xhr;
    if (!vid) {
      if (wantJson) return res.json({ ok: false, error: 'Invalid visit.' });
      return res.redirect('/emergency?err=Invalid+visit');
    }
    try {
      const st = await assertErVisitMutable(vid);
      if (!st.ok) return redirectErVisitLocked(res, vid, st.msg, wantJson);
      const uid = userId(req);
      await pool.query(
        `UPDATE tbl_opd_visit
            SET doctor_first_seen = COALESCE(doctor_first_seen, NOW()),
                queue_status = 'in_consultation'
          WHERE id=?`, [vid]
      );
      await doctorErAlerts.acknowledgeForVisit(pool, vid, uid);
      if (wantJson) return res.json({ ok: true });
      const back = String(req.get('Referer') || '').trim();
      if (back) return res.redirect(back);
      return res.redirect('/emergency/visit/' + vid + '?msg=' + encodeURIComponent('Doctor seen time recorded.'));
    } catch (e) {
      if (wantJson) return res.json({ ok: false, error: e.message });
      return res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent(e.message));
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /emergency/order  → Phase 2 parallel order
  // ──────────────────────────────────────────────────────────
  app.post('/emergency/order', requireAuth, async (req, res) => {
    const vid = parseInt(req.body.visit_id, 10);
    const { order_type, description, priority } = req.body;
    const catalogId = parseInt(req.body.catalog_id, 10) || 0;
    const sourceModule = String(req.body.source_module || '').trim();
    const amount = parseFloat(req.body.amount);
    const quantity = parseInt(req.body.quantity, 10) || 1;
    if (!vid || !order_type || !description) {
      return res.redirect('/emergency?err=Invalid+order');
    }
    const uid = userId(req);
    const fid = req.session && req.session.facilityId ? Number(req.session.facilityId) : 1;
    try {
      const st = await assertErVisitMutable(vid);
      if (!st.ok) return res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent(st.msg));
      const [ins] = await pool.query(
        `INSERT INTO tbl_er_order
           (visit_id, order_type, description, priority, status, ordered_by)
         VALUES (?,?,?,?,'ordered',?)`,
        [vid, order_type, String(description).trim().slice(0, 250), priority || 'stat', uid]
      );
      const orderId = ins.insertId;
      const vrow = await one(
        `SELECT v.patient_id, b.label AS bed_label, b.bed_code
           FROM tbl_opd_visit v
           LEFT JOIN tbl_er_bed b ON b.id = v.er_bed_id
          WHERE v.id = ? LIMIT 1`,
        [vid]
      );
      const { autoChargeFromErOrder, syncAfterErCharge } = require('../lib/erOrderAutoCharge');
      let chargeMsg = '';
      if (vrow && vrow.patient_id) {
        const chargeResult = await autoChargeFromErOrder(pool, {
          visitId: vid,
          orderId,
          patientId: vrow.patient_id,
          orderType: order_type,
          description: String(description).trim(),
          catalogId,
          sourceModule,
          amount: Number.isFinite(amount) ? amount : null,
          quantity,
          facilityId: fid,
          addedBy: uid,
        });
        if (chargeResult.ok && chargeResult.amount > 0) {
          chargeMsg = ` — ${fmtMoney(chargeResult.amount)} added to credit tab`;
          await syncAfterErCharge(pool).catch(() => {});
        } else if (chargeResult.reason === 'no_price') {
          chargeMsg = ' — no catalog price matched; add charge manually if needed';
        }
      }
      const ot = String(order_type || '').trim().toLowerCase();
      if (ot === 'lab' || ot === 'radiology' || ot === 'pharmacy') {
        const targetDept = ot === 'lab' ? 'laboratory' : ot === 'radiology' ? 'radiology' : 'pharmacy';
        if (vrow && vrow.patient_id) {
          const pname = await one(
            `SELECT CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,'')) AS fulln FROM tbl_patient WHERE id=? LIMIT 1`,
            [vrow.patient_id]
          );
          const doc = await one('SELECT first_name, last_name FROM tbl_employee WHERE id=? LIMIT 1', [uid]);
          const doctorDisplay = doc
            ? `Dr. ${String(doc.first_name || '').trim()} ${String(doc.last_name || '').trim()}`.trim()
            : 'Doctor';
          const patientDisplay =
            pname && String(pname.fulln || '').trim() ? String(pname.fulln).trim() : `Patient #${vrow.patient_id}`;
          const bedDisplay = String(vrow.bed_label || vrow.bed_code || '').trim() || 'No bed assigned';
          const fid = req.session && req.session.facilityId ? Number(req.session.facilityId) : 1;
          await clinicalDeptAlerts.enqueueAlert(pool, {
            facility_id: fid,
            target_dept: targetDept,
            context: 'er',
            doctor_display: doctorDisplay,
            patient_display: patientDisplay,
            ward_display: 'Emergency / A&E',
            bed_display: bedDisplay,
            test_display: String(description || '').trim().slice(0, 500),
            patient_id: vrow.patient_id,
            opd_visit_id: vid,
            admission_id: null,
            consultation_id: null,
            opd_order_item_id: null,
            created_by: uid,
          });
        }
      }
      res.redirect('/emergency/visit/' + vid + '?msg=' + encodeURIComponent('Order placed' + chargeMsg));
    } catch (err) {
      res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent(err.message));
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /emergency/order/update  → status / result / critical
  // ──────────────────────────────────────────────────────────
  app.post('/emergency/order/update', requireAuth, async (req, res) => {
    const oid = parseInt(req.body.order_id, 10);
    const vid = parseInt(req.body.visit_id, 10);
    const { status, result_summary, critical_alert } = req.body;
    if (!oid || !vid) return res.redirect('/emergency?err=Invalid+order');
    try {
      const st = await assertErVisitMutable(vid);
      if (!st.ok) return res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent(st.msg));
      const fields = ['status=?'];
      const values = [status || 'ordered'];
      if (result_summary != null) { fields.push('result_summary=?'); values.push(String(result_summary).slice(0, 4000)); }
      fields.push('critical_alert=?'); values.push(critical_alert ? 1 : 0);
      if (status === 'completed') { fields.push('completed_at=NOW()'); }
      values.push(oid);
      await pool.query(`UPDATE tbl_er_order SET ${fields.join(', ')} WHERE id=?`, values);

      if (String(status || '').toLowerCase() === 'cancelled') {
        const { voidErOrderCharge, syncAfterErCharge } = require('../lib/erOrderAutoCharge');
        const voidResult = await voidErOrderCharge(pool, oid);
        if (voidResult.voided) {
          await syncAfterErCharge(pool).catch(() => {});
        }
      }

      res.redirect('/emergency/visit/' + vid + '?msg=Order+updated');
    } catch (err) {
      res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent(err.message));
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /emergency/add-charge — Phase 4 real-time charge capture
  // ──────────────────────────────────────────────────────────
  app.post('/emergency/add-charge', requireAuth, async (req, res) => {
    const { visit_id, description, amount, charge_type, source_module, source_pk } = req.body;
    const uid = userId(req);
    const fid = req.session && req.session.facilityId ? Number(req.session.facilityId) : 1;
    const vid = parseInt(visit_id, 10) || 0;
    const amt = parseFloat(amount) || 0;
    if (vid < 1 || amt <= 0) return res.redirect('/emergency?err=Invalid+charge+data');
    try {
      const st = await assertErVisitMutable(vid);
      if (!st.ok) return res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent(st.msg));
      const v = await one('SELECT patient_id FROM tbl_opd_visit WHERE id=?', [vid]);
      if (!v) return res.redirect('/emergency?err=Visit+not+found');
      const clinicalDetail = buildClinicalDetailFromBody(req.body);
      await pool.query(
        `INSERT INTO tbl_emergency_charge
           (facility_id, visit_id, patient_id, charge_type, description, amount,
            added_by, source_module, source_pk, clinical_detail)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [fid, vid, v.patient_id, charge_type || 'misc',
         String(description || 'Charge').slice(0, 290), amt, uid,
         source_module || null, parseInt(source_pk, 10) || null, clinicalDetail]
      );
      await pool.query(
        'UPDATE tbl_opd_visit SET emg_credit_total = COALESCE(emg_credit_total,0)+? WHERE id=?',
        [amt, vid]
      ).catch(() => {});
      await syncEmergencyCashierTickets(pool).catch(() => {});

      try {
        const [[doc]] = await pool.query('SELECT first_name, last_name FROM tbl_employee WHERE id=? LIMIT 1', [uid]).catch(() => [[null]]);
        const doctorDisplay = doc
          ? `Dr. ${String(doc.first_name || '').trim()} ${String(doc.last_name || '').trim()}`.trim()
          : 'Doctor';
        const [[pn]] = await pool.query(
          `SELECT TRIM(CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,''))) AS fulln FROM tbl_patient WHERE id=? LIMIT 1`,
          [v.patient_id]
        ).catch(() => [[null]]);
        const patientDisplay =
          pn && String(pn.fulln || '').trim() ? String(pn.fulln).trim() : `Patient #${v.patient_id}`;
        const [[vr]] = await pool.query(
          `SELECT b.label AS bed_label, b.bed_code
             FROM tbl_opd_visit ov
             LEFT JOIN tbl_er_bed b ON b.id = ov.er_bed_id
            WHERE ov.id=? LIMIT 1`,
          [vid]
        ).catch(() => [[null]]);
        const bedDisplay =
          vr && (vr.bed_label || vr.bed_code)
            ? String(vr.bed_label || vr.bed_code || '').trim()
            : 'No bed assigned';
        await enqueueClinicalAlertFromCharge(pool, {
          charge_type,
          description,
          facility_id: fid,
          context: 'er',
          doctor_display: doctorDisplay,
          patient_display: patientDisplay,
          ward_display: 'Emergency / A&E',
          bed_display: bedDisplay.slice(0, 160),
          patient_id: v.patient_id,
          opd_visit_id: vid,
          admission_id: null,
          created_by: uid,
        });
      } catch (e) {
        console.warn('[emergency/add-charge] dept alert:', e.message);
      }

      res.redirect('/emergency/visit/' + vid + '?msg=Charge+added');
    } catch (err) {
      res.redirect('/emergency?err=' + encodeURIComponent('Charge failed: ' + err.message));
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /emergency/disposition  → Phase 3: 4 pathways + extras
  // ──────────────────────────────────────────────────────────
  app.post('/emergency/disposition', requireAuth, async (req, res) => {
    const vid = parseInt(req.body.visit_id, 10);
    const { pathway, summary, take_home_meds, return_precautions,
            admit_department, ssu_expected_hours, ot_procedure,
            transfer_to } = req.body;
    if (!vid || !pathway) return res.redirect('/emergency?err=Invalid+disposition');
    const uid = userId(req);
    const allowed = ['discharge','ssu','ipd','ot','transfer','deceased','lwbs'];
    if (!allowed.includes(pathway)) {
      return res.redirect('/emergency/visit/' + vid + '?err=Unknown+pathway');
    }

    const closed = await assertErVisitMutable(vid);
    if (!closed.ok) {
      return res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent(closed.msg));
    }

    try {
      // Upsert tbl_er_disposition.
      const existing = await one('SELECT id FROM tbl_er_disposition WHERE visit_id=? LIMIT 1', [vid]);
      const params = {
        pathway,
        summary:            summary             || null,
        take_home_meds:     take_home_meds      || null,
        return_precautions: return_precautions  || null,
        admit_department:   admit_department    || null,
        ssu_expected_hours: parseInt(ssu_expected_hours, 10) || null,
        ot_procedure:       ot_procedure        || null,
        transfer_to:        transfer_to         || null,
        decided_by:         uid,
      };

      if (existing) {
        await pool.query(
          `UPDATE tbl_er_disposition SET
             pathway=?, summary=?, take_home_meds=?, return_precautions=?,
             admit_department=?, ssu_expected_hours=?, ot_procedure=?,
             transfer_to=?, decided_by=?, decided_at=NOW()
           WHERE id=?`,
          [params.pathway, params.summary, params.take_home_meds, params.return_precautions,
           params.admit_department, params.ssu_expected_hours, params.ot_procedure,
           params.transfer_to, params.decided_by, existing.id]
        );
      } else {
        await pool.query(
          `INSERT INTO tbl_er_disposition
             (visit_id, pathway, summary, take_home_meds, return_precautions,
              admit_department, ssu_expected_hours, ot_procedure, transfer_to,
              decided_by)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [vid, params.pathway, params.summary, params.take_home_meds,
           params.return_precautions, params.admit_department,
           params.ssu_expected_hours, params.ot_procedure, params.transfer_to,
           params.decided_by]
        );
      }

      if (pathway === 'lwbs') {
        await waiveLwbsEmergencyBilling(pool, vid);
      }

      // Close/advance the OPD visit row appropriately.
      const closingPathways = ['transfer', 'deceased', 'lwbs'];
      const isClosing = closingPathways.includes(pathway);
      let nextStatus = 'completed';

      if (pathway === 'discharge') {
        // Station 8 — clinical discharge only (IPD-style); financial settlement follows at Cashier.
        await pool.query(
          `UPDATE tbl_opd_visit
              SET queue_status='clinical_discharged',
                  er_status='clinical_discharged',
                  clinical_discharged_at=NOW(),
                  clinical_discharged_by=?,
                  disposition_at=NOW(),
                  treatment_note = COALESCE(NULLIF(?, ''), treatment_note)
            WHERE id=?`,
          [uid, summary || '', vid]
        );
      } else if (pathway === 'ssu') {
        nextStatus = 'ssu_observation';
        await pool.query(
          `UPDATE tbl_opd_visit
              SET queue_status=?, disposition_at=NOW(),
                  treatment_note = COALESCE(NULLIF(?, ''), treatment_note)
            WHERE id=?`,
          [nextStatus, summary || '', vid]
        );
      } else if (pathway === 'ipd') {
        nextStatus = 'ipd_pending_admit';
        await pool.query(
          `UPDATE tbl_opd_visit
              SET queue_status=?, disposition_at=NOW(),
                  treatment_note = COALESCE(NULLIF(?, ''), treatment_note)
            WHERE id=?`,
          [nextStatus, summary || '', vid]
        );
      } else if (pathway === 'ot') {
        nextStatus = 'ot_pending';
        await pool.query(
          `UPDATE tbl_opd_visit
              SET queue_status=?, disposition_at=NOW(),
                  treatment_note = COALESCE(NULLIF(?, ''), treatment_note)
            WHERE id=?`,
          [nextStatus, summary || '', vid]
        );
      } else {
        await pool.query(
          `UPDATE tbl_opd_visit
              SET queue_status=?, disposition_at=NOW(),
                  completed_at = CASE WHEN ? THEN NOW() ELSE completed_at END,
                  lwbs = CASE WHEN ?='lwbs' THEN 1 ELSE lwbs END,
                  treatment_note = COALESCE(NULLIF(?, ''), treatment_note)
            WHERE id=?`,
          [nextStatus, isClosing ? 1 : 0, pathway, summary || '', vid]
        );
      }

      // Free bed if closing (discharge pathway keeps bed until financial confirm).
      if (isClosing || pathway === 'ipd' || pathway === 'ot') {
        await pool.query('UPDATE tbl_er_bed SET current_visit_id=NULL WHERE current_visit_id=?', [vid]).catch(()=>{});
      }

      // IPD pathway — pending admission on ward board + ER charges transferred to IPD ledger.
      let ipdAdmitMsg = '';
      if (pathway === 'ipd') {
        const fid = req.session && req.session.facilityId ? Number(req.session.facilityId) : 1;
        const admitResult = await createErIpdAdmission(pool, {
          visitId: vid,
          createdBy: uid,
          facilityId: fid,
          admittingDepartment: admit_department || 'General Medicine',
          admittingDiagnosis: summary || 'Emergency — admit from A&E',
          notes: summary || '',
        });
        await pool.query(`
          CREATE TABLE IF NOT EXISTS tbl_ipd_admit_request (
            id INT AUTO_INCREMENT PRIMARY KEY,
            facility_id INT DEFAULT 1,
            patient_id INT NOT NULL,
            opd_visit_id INT DEFAULT NULL,
            admission_id INT DEFAULT NULL,
            admitting_diagnosis VARCHAR(500) DEFAULT '',
            admitting_department VARCHAR(120) DEFAULT '',
            notes TEXT, requested_by INT DEFAULT NULL,
            requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(30) DEFAULT 'pending',
            KEY idx_patient (patient_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        `).catch(()=>{});
        await pool.query('ALTER TABLE tbl_ipd_admit_request ADD COLUMN IF NOT EXISTS admission_id INT NULL').catch(() => {});
        const v = await one('SELECT patient_id FROM tbl_opd_visit WHERE id=?', [vid]);
        const ar = await pool.query(
          `INSERT INTO tbl_ipd_admit_request
             (patient_id, opd_visit_id, admission_id, admitting_diagnosis,
              admitting_department, notes, requested_by, status)
           VALUES (?,?,?,?,?,?,?,'admitted_pending_bed')`,
          [
            v.patient_id,
            vid,
            admitResult && admitResult.admissionId ? admitResult.admissionId : null,
            summary || 'Emergency — admit from A&E',
            admit_department || 'General Medicine',
            summary || '',
            uid,
          ]
        );
        await pool.query('UPDATE tbl_er_disposition SET admit_request_id=? WHERE visit_id=?', [ar[0].insertId, vid]).catch(
          () => {}
        );
        const n = admitResult && admitResult.chargeTransfer ? admitResult.chargeTransfer.transferred : 0;
        const tot = admitResult && admitResult.chargeTransfer ? admitResult.chargeTransfer.total : 0;
        ipdAdmitMsg =
          n > 0
            ? `IPD admission queued on Ward board. ${n} emergency charge line(s) (${fmtMoney(tot)}) added to hospitalisation bill.`
            : 'IPD admission queued on Ward board — assign bed and collect HOS deposit at Cashier.';
      }

      // Friendly redirect by pathway.
      if (pathway === 'deceased') {
        await syncEmergencyCashierTickets(pool).catch(() => {});
        const q = new URLSearchParams({ source: 'er', visit_id: String(vid) });
        return res.redirect(
          '/death-registry?' +
            q.toString() +
            '&msg=' +
            encodeURIComponent('ER disposition recorded — complete the death certificate.')
        );
      }

      const msg = ({
        discharge: 'Clinical discharge signed — patient awaits financial settlement at Cashier, then ER confirmation.',
        ssu:       'Patient moved to Short Stay Unit (SSU).',
        ipd:       ipdAdmitMsg || 'IPD admission queued — Ward board will assign a bed.',
        ot:        'OT booking handoff recorded.',
        transfer:  'Transfer recorded.',
        lwbs:      'Left Without Being Seen logged. Pending ED charges and cashier EMG tickets were waived (no collection).',
      })[pathway];
      await syncEmergencyCashierTickets(pool).catch(() => {});
      res.redirect('/emergency/visit/' + vid + '?msg=' + encodeURIComponent(msg));
    } catch (err) {
      console.error('ER DISPOSITION:', err.message);
      res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent('Disposition failed: ' + err.message));
    }
  });

  // ──────────────────────────────────────────────────────────
  // MLC: create / update  (POST /emergency/mlc)
  // ──────────────────────────────────────────────────────────
  app.post('/emergency/mlc', requireAuth, async (req, res) => {
    const vid = parseInt(req.body.visit_id, 10);
    if (!vid) return res.redirect('/emergency?err=Invalid+visit');
    const uid = userId(req);
    const b = req.body;

    try {
      // Refuse to modify a locked MLC.
      const existing = await one('SELECT * FROM tbl_er_mlc WHERE visit_id=? LIMIT 1', [vid]);
      if (existing && existing.locked) {
        return res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent('MLC is locked — cannot edit.'));
      }

      const num = existing && existing.mlc_number ? existing.mlc_number : await nextMlcNumber();
      const payload = [
        b.case_type || 'other',
        b.incident_at || null,
        b.incident_place || null,
        b.brought_by || null,
        b.police_station || null,
        b.officer_name || null,
        b.narrative || null,
        b.examination || null,
        b.injuries || null,
        b.provisional_dx || null,
      ];

      if (existing) {
        await pool.query(
          `UPDATE tbl_er_mlc SET
             case_type=?, incident_at=?, incident_place=?, brought_by=?,
             police_station=?, officer_name=?, narrative=?, examination=?,
             injuries=?, provisional_dx=?
           WHERE id=?`,
          [...payload, existing.id]
        );
      } else {
        await pool.query(
          `INSERT INTO tbl_er_mlc
             (visit_id, mlc_number, case_type, incident_at, incident_place,
              brought_by, police_station, officer_name, narrative,
              examination, injuries, provisional_dx, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [vid, num, ...payload, uid]
        );
      }

      await pool.query('UPDATE tbl_opd_visit SET mlc_flag=1 WHERE id=?', [vid]).catch(()=>{});
      res.redirect('/emergency/visit/' + vid + '?msg=' + encodeURIComponent('MLC ' + num + ' saved'));
    } catch (err) {
      console.error('ER MLC:', err.message);
      res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent(err.message));
    }
  });

  // POST /emergency/mlc/notify-police
  app.post('/emergency/mlc/notify-police', requireAuth, async (req, res) => {
    const vid = parseInt(req.body.visit_id, 10);
    if (!vid) return res.redirect('/emergency?err=Invalid+visit');
    try {
      await pool.query(
        'UPDATE tbl_er_mlc SET police_notified_at=NOW() WHERE visit_id=? AND locked=0',
        [vid]
      );
      res.redirect('/emergency/visit/' + vid + '?msg=Police+notification+logged');
    } catch (err) {
      res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent(err.message));
    }
  });

  // POST /emergency/mlc/lock — once locked the record cannot be edited.
  app.post('/emergency/mlc/lock', requireAuth, async (req, res) => {
    const vid = parseInt(req.body.visit_id, 10);
    if (!vid) return res.redirect('/emergency?err=Invalid+visit');
    const uid = userId(req);
    try {
      const m = await one('SELECT * FROM tbl_er_mlc WHERE visit_id=? LIMIT 1', [vid]);
      if (!m)         return res.redirect('/emergency/visit/' + vid + '?err=No+MLC+to+lock');
      if (m.locked)   return res.redirect('/emergency/visit/' + vid + '?msg=Already+locked');

      const payload = JSON.stringify({
        v: vid, n: m.mlc_number, t: m.case_type, at: new Date().toISOString(),
        narr: m.narrative, exam: m.examination, dx: m.provisional_dx
      });
      const hash = crypto.createHash('sha256').update(payload).digest('hex');
      await pool.query(
        'UPDATE tbl_er_mlc SET locked=1, locked_at=NOW(), locked_by=?, hash=? WHERE id=?',
        [uid, hash, m.id]
      );
      res.redirect('/emergency/mlc/print/' + vid);
    } catch (err) {
      res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent(err.message));
    }
  });

  // GET /emergency/mlc/print/:visit_id — tri-copy report (Hospital / Police / Patient)
  app.get('/emergency/mlc/print/:visit_id', requireAuth, async (req, res) => {
    const vid = parseInt(req.params.visit_id, 10);
    if (!vid) return res.redirect('/emergency?err=Invalid+visit');

    const m = await one('SELECT * FROM tbl_er_mlc WHERE visit_id=? LIMIT 1', [vid]);
    if (!m) return res.redirect('/emergency/visit/' + vid + '?err=No+MLC');
    const visit = await one(`
      SELECT v.*, p.first_name, p.last_name, p.gender, p.dob, p.phone, p.address
        FROM tbl_opd_visit v JOIN tbl_patient p ON p.id = v.patient_id
       WHERE v.id=?`, [vid]);
    res.render('emergency-mlc-print', {
      title:  'MLC Report — ' + m.mlc_number,
      layout: false,
      pageData: { visit, mlc: m, user: req.session.user },
    });
  });

  // ──────────────────────────────────────────────────────────
  // GET /emergency/validate-er-code — validate cashier discharge code (Station 10)
  // ──────────────────────────────────────────────────────────
  app.get('/emergency/validate-er-code', requireAuth, async (req, res) => {
    const vid = parseInt(req.query.visit_id, 10) || 0;
    const code = String(req.query.code || '').trim().toUpperCase();
    if (vid < 1) return res.json({ ok: false, error: 'Invalid visit.' });
    try {
      const v = await one(
        `SELECT v.*, p.first_name, p.last_name
           FROM tbl_opd_visit v
           JOIN tbl_patient p ON p.id = v.patient_id
          WHERE v.id = ? AND v.is_emergency = 1 LIMIT 1`,
        [vid]
      );
      if (!v) return res.json({ ok: false, error: 'Visit not found.' });
      if (v.queue_status === 'completed') {
        return res.json({ ok: false, error: 'This ER visit is already discharged.' });
      }
      if (v.er_code_consumed_at && v.er_payment_code) {
        return res.json({ ok: false, error: 'Discharge code already confirmed for this visit.' });
      }
      if (!v.er_payment_code) {
        return res.json({ ok: false, error: 'No settlement code yet — Cashier must settle first.' });
      }
      if (!code) return res.json({ ok: false, error: 'Enter the ER payment code from Cashier.' });
      const expected = String(v.er_payment_code || '').trim().toUpperCase();
      if (code !== expected) return res.json({ ok: false, error: 'Invalid payment code.' });
      const [[sum]] = await pool
        .query(
          'SELECT COALESCE(SUM(amount),0) AS total FROM tbl_emergency_charge WHERE visit_id=? AND settled=0',
          [vid]
        )
        .catch(() => [[{ total: 0 }]]);
      const balance = parseFloat(sum?.total || 0) || 0;
      return res.json({
        ok: true,
        payment_code: v.er_payment_code,
        patient_name: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
        ticket_number: v.ticket_number,
        balance_due: balance,
        zero_balance: balance <= 0.001,
      });
    } catch (e) {
      return res.json({ ok: false, error: e.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /emergency/confirm-discharge — financial discharge confirm (Station 10)
  // ──────────────────────────────────────────────────────────
  app.post('/emergency/confirm-discharge', requireAuth, async (req, res) => {
    const vid = parseInt(req.body.visit_id, 10) || 0;
    const paymentCodeIn = String(req.body.payment_code || '').trim().toUpperCase();
    if (vid < 1) return res.redirect('/emergency?err=Invalid+visit');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[v]] = await conn.query(
        `SELECT id, er_payment_code, er_code_consumed_at, er_bed_id, queue_status
           FROM tbl_opd_visit
          WHERE id = ? AND is_emergency = 1
          LIMIT 1 FOR UPDATE`,
        [vid]
      );
      if (!v || v.queue_status === 'completed') {
        await conn.rollback();
        conn.release();
        return res.redirect('/emergency/visit/' + vid + '?err=Visit+not+found+or+already+discharged');
      }
      const expected = String(v.er_payment_code || '').trim().toUpperCase();
      if (!expected || paymentCodeIn !== expected) {
        await conn.rollback();
        conn.release();
        return res.redirect('/emergency/visit/' + vid + '?err=Invalid+payment+code');
      }
      if (v.er_code_consumed_at) {
        await conn.rollback();
        conn.release();
        return res.redirect('/emergency/visit/' + vid + '?err=Code+already+confirmed');
      }
      await conn.query(
        `UPDATE tbl_opd_visit
            SET queue_status='completed',
                er_status='discharged',
                completed_at=NOW(),
                er_code_consumed_at=NOW()
          WHERE id=?`,
        [vid]
      );
      await conn.query('UPDATE tbl_er_bed SET current_visit_id=NULL WHERE current_visit_id=?', [vid]).catch(() => {});
      await conn.commit();
      conn.release();
      res.redirect('/emergency/visit/' + vid + '?msg=' + encodeURIComponent('Financial discharge confirmed — patient may leave.'));
    } catch (e) {
      await conn.rollback().catch(() => {});
      conn.release();
      res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent(e.message));
    }
  });

  // ──────────────────────────────────────────────────────────
  // Cashier: settle ER bill (legacy — use /cashier/er-settle for clinical-discharged visits)
  // ──────────────────────────────────────────────────────────
  app.post('/emergency/settle-bill', requireAuth, async (req, res) => {
    const { visit_id, payment_method, amount_paid, discount_amount } = req.body;
    const uid = userId(req);
    const fid = req.session && req.session.facilityId ? Number(req.session.facilityId) : 1;
    const vid = parseInt(visit_id, 10) || 0;
    const paid = parseFloat(amount_paid) || 0;
    const disc = parseFloat(discount_amount) || 0;
    if (vid < 1) return res.redirect('/emergency?err=Invalid+visit');
    try {
      const v = await one('SELECT * FROM tbl_opd_visit WHERE id=?', [vid]);
      if (!v) return res.redirect('/emergency?err=Visit+not+found');
      if (String(v.queue_status) !== 'clinical_discharged') {
        return res.redirect('/emergency/visit/' + vid + '?err=' + encodeURIComponent('Sign clinical discharge first, then settle at Cashier.'));
      }

      await pool.query('UPDATE tbl_emergency_charge SET settled=1 WHERE visit_id=?', [vid]).catch(()=>{});

      const year   = new Date().getFullYear();
      const prefix = `EMG-RCPT-${year}-`;
      const last = await one('SELECT ticket_code FROM tbl_payment_ticket WHERE ticket_code LIKE ? ORDER BY id DESC LIMIT 1', [prefix + '%']);
      let seq = 1;
      if (last && last.ticket_code) {
        const parts = String(last.ticket_code).split('-');
        seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
      }
      const code = prefix + String(seq).padStart(4, '0');
      const net = Math.max(0, paid - disc);
      const lines = [
        { kind:'emergency_settlement', description:'Emergency Retrospective Bill', unit_price: net, quantity: 1, visit_id: vid },
        ...(disc > 0 ? [{ kind:'waiver_discount', description:'Emergency Waiver/Discount', unit_price: -disc, quantity: 1 }] : [])
      ];
      await pool.query(`
        INSERT INTO tbl_payment_ticket
          (facility_id, ticket_code, patient_id, total_amount, status, lines_json, created_by, paid_at, created_at)
        VALUES (?,?,?,?,'paid',?,?,NOW(),NOW())`,
        [fid, code, v.patient_id, net, JSON.stringify(lines), uid]
      );
      await syncEmergencyCashierTickets(pool).catch(() => {});
      res.redirect('/emergency?msg=Bill+settled.+Receipt+' + code);
    } catch (err) {
      console.error('ER SETTLE:', err.message);
      res.redirect('/emergency?err=' + encodeURIComponent('Settlement failed: ' + err.message));
    }
  });

  // GET /emergency/credit-tab/:visit_id  (legacy URL kept)
  app.get('/emergency/credit-tab/:visit_id', requireAuth, async (req, res) => {
    const vid = parseInt(req.params.visit_id, 10);
    if (!vid) return res.redirect('/emergency?err=Invalid+visit');
    res.redirect('/emergency/visit/' + vid + '#charges');
  });

  // ──────────────────────────────────────────────────────────
  // KPI dashboard
  // ──────────────────────────────────────────────────────────
  app.get('/emergency/kpi', requireAuth, async (req, res) => {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));

    const summary = await one(`
      SELECT
        COUNT(*) AS total_visits,
        SUM(lwbs=1) AS lwbs,
        SUM(mlc_flag=1) AS mlc,
        AVG(CASE WHEN doctor_first_seen IS NOT NULL
                 THEN TIMESTAMPDIFF(MINUTE, queue_started_at, doctor_first_seen) END) AS avg_door_to_doctor,
        AVG(CASE WHEN disposition_at IS NOT NULL
                 THEN TIMESTAMPDIFF(MINUTE, queue_started_at, disposition_at) END)    AS avg_length_of_stay,
        SUM(CASE WHEN acuity_level=1 THEN 1 ELSE 0 END) AS l1,
        SUM(CASE WHEN acuity_level=2 THEN 1 ELSE 0 END) AS l2,
        SUM(CASE WHEN acuity_level=3 THEN 1 ELSE 0 END) AS l3,
        SUM(CASE WHEN acuity_level=4 THEN 1 ELSE 0 END) AS l4,
        SUM(CASE WHEN acuity_level=5 THEN 1 ELSE 0 END) AS l5,
        SUM(arrival_mode='ambulance') AS by_ambulance,
        SUM(arrival_mode='walk_in')   AS by_walk_in,
        SUM(arrival_mode='referral')  AS by_referral
        FROM tbl_opd_visit
       WHERE is_emergency=1 AND queue_started_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `, [days]) || {};

    const dispoCounts = await sq(`
      SELECT d.pathway, COUNT(*) AS n
        FROM tbl_er_disposition d
        JOIN tbl_opd_visit v ON v.id = d.visit_id
       WHERE v.is_emergency=1 AND d.decided_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY d.pathway`, [days]);

    const dailyTrend = await sq(`
      SELECT DATE(queue_started_at) AS d, COUNT(*) AS n
        FROM tbl_opd_visit
       WHERE is_emergency=1 AND queue_started_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(queue_started_at) ORDER BY d ASC`, [days]);

    res.render('emergency-kpi', {
      title: 'ER KPI Dashboard — ZAIZENS',
      pageData: {
        days,
        summary,
        dispoCounts,
        dailyTrend,
      },
    });
  });

  // ──────────────────────────────────────────────────────────
  // API for sidebar widget (kept compatible with legacy callers)
  // ──────────────────────────────────────────────────────────
  app.get('/api/emergency/active', requireAuth, async (req, res) => {
    try {
      const rows = await sq(`
        SELECT v.id, v.ticket_number, v.queue_status, v.queue_started_at,
               v.acuity_level, p.first_name, p.last_name,
               TIMESTAMPDIFF(MINUTE, v.queue_started_at, NOW()) AS minutes_waiting
          FROM tbl_opd_visit v
          JOIN tbl_patient p ON p.id = v.patient_id
         WHERE v.is_emergency = 1
           AND v.queue_status NOT IN ('completed','cancelled')
         ORDER BY COALESCE(v.acuity_level,99), v.queue_started_at ASC
         LIMIT 30
      `);
      res.json(rows);
    } catch (e) { res.json([]); }
  });

  // ──────────────────────────────────────────────────────────
  // Legacy migrate endpoint — now just runs the new self-heal.
  // ──────────────────────────────────────────────────────────
  app.get('/migrate-emergency', requireAuth, async (req, res) => {
    try {
      const fn = require('../lib/ensureEmergencySchema');
      await fn(pool);
      res.send('<h2>Emergency schema OK</h2><p>All ER tables verified.</p><a href="/emergency">Open Emergency Department</a>');
    } catch (e) {
      res.status(500).send('<h2>Schema error</h2><pre>' + (e.message || e) + '</pre>');
    }
  });

};
