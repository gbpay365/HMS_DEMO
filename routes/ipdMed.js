// ============================================================
// IPD MEDICATION MANAGEMENT — Doctor / Nurse / Billing workflow
// routes/ipdMed.js
//
//   Doctor flow:  /ipd/treatment/:admission_id   (Treatment Manager)
//   Nurse flow:   /ipd/chart/:admission_id       (Bedhead Drug Chart)
//                 /ipd/shift/:admission_id       (Shift Report + Extra Materials)
//   Audit:        /ipd/audit/:admission_id
//   Discharge:    /ipd/discharge/:admission_id
//
// Schema is created by lib/ensureIpdMedSchema.js at boot.
// ============================================================
'use strict';

const clinicalNad = require('../lib/clinicalNotAssignedBypass');
const { resolveIpdDrugUnitPrice } = require('../lib/prescriptionPricing');
const {
  syncIpdPrescriptionCharge,
  removeIpdPrescriptionCharge,
  ipdPrescriptionHasUpfrontCharge,
} = require('../lib/ipdPrescriptionBilling');

module.exports = function (app, pool, requireAuth, requirePerm) {
  const _rp = typeof requirePerm === 'function' ? requirePerm : (...keys) => (req, res, next) => next();
  /** Open hub + per-admission IPD medication screens (matches portal tile perms). */
  const requireIpdView = _rp(
    'ipd_medication.read', 'ipd_medication.write',
    'adt.read', 'clinical.read', 'clinical.write', 'nursing.read', 'nursing.write'
  );
  /** POST handlers: prescribing, administration, shift, discharge, inbox read. */
  const requireIpdMutate = _rp(
    'ipd_medication.write', 'clinical.write', 'nursing.write'
  );

  // ── Flash/error: map ?msg / ?err query params to locals for IPD views ──
  app.use((req, res, next) => {
    const p = req.path || '';
    if (!p.startsWith('/ipd') && !p.startsWith('/api/ipd')) return next();
    if (req.query && req.query.msg) res.locals.flash = req.query.msg;
    if (req.query && req.query.err) res.locals.error = req.query.err;
    next();
  });

  // ───────────────────── helpers ─────────────────────
  const sq = async (sql, p = []) => {
    try { const [r] = await pool.query(sql, p); return r || []; }
    catch (e) { console.warn('[ipdMed]', sql.split('\n')[0].slice(0, 80), e.message); return []; }
  };
  const one = async (sql, p = []) => {
    const r = await sq(sql, p); return r[0] || null;
  };
  const userId = (req) => req.session && req.session.user
    ? Number(req.session.user.id) || null
    : null;
  const userRole = (req) => String((req.session.user || {}).role || '');

  /** Did this request want a JSON response?  We trust Accept + X-Requested-With
   *  (not the request Content-Type — most fetch() POSTs omit it). */
  const wantsJson = (req) => {
    if (req.xhr) return true;
    const accept = String(req.get('accept') || '').toLowerCase();
    if (accept.includes('application/json')) return true;
    const xrw = String(req.get('x-requested-with') || '').toLowerCase();
    if (xrw === 'xmlhttprequest') return true;
    return req.is && req.is('application/json') === 'application/json';
  };
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

  const DOSE_EFFECTIVE_DOSAGE_SQL =
    `COALESCE(NULLIF(TRIM(s.slot_dosage), ''), r.dosage) AS dosage`;

  const effectiveDosage = (slot) => {
    const sd = slot && slot.slot_dosage != null ? String(slot.slot_dosage).trim() : '';
    if (sd) return sd;
    return slot && slot.dosage != null ? String(slot.dosage).trim() : '';
  };

  const doseReturnPath = (req, admissionId) => {
    const returnTo = String(req.body.return_to || req.query.return_to || '').trim();
    return returnTo === 'treatment'
      ? `/ipd/treatment/${admissionId}`
      : `/ipd/chart/${admissionId}`;
  };

  /** Submitted = handed over (report_status or legacy locked flag). */
  const shiftReportIsSubmitted = (row) => {
    if (!row) return false;
    const st = String(row.report_status || '').toLowerCase().trim();
    if (st === 'submitted') return true;
    if (st === 'open') return false;
    return Number(row.locked) === 1;
  };

  const actorFromReq = (req) => {
    const u = req.session && req.session.user;
    if (!u) return { id: null, name: null };
    const id = Number(u.id) || null;
    const name = (u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim()) || null;
    return { id, name: name ? String(name).slice(0, 120) : null };
  };

  /** Best-effort IPD clinical audit (never throws). */
  const logIpdMedAudit = async (req, row) => {
    const a = actorFromReq(req);
    const detail = row.detail != null
      ? (typeof row.detail === 'string' ? row.detail : JSON.stringify(row.detail)).slice(0, 8000)
      : null;
    try {
      await pool.query(
        `INSERT INTO tbl_ipd_med_audit
           (admission_id, patient_id, treatment_id, prescription_id, actor_id, actor_name, action, detail)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          row.admission_id != null ? parseInt(row.admission_id, 10) || null : null,
          row.patient_id != null ? parseInt(row.patient_id, 10) || null : null,
          row.treatment_id != null ? parseInt(row.treatment_id, 10) || null : null,
          row.prescription_id != null ? parseInt(row.prescription_id, 10) || null : null,
          a.id,
          a.name,
          String(row.action || '').slice(0, 80),
          detail,
        ]
      );
    } catch (e) {
      console.warn('[ipdMed] logIpdMedAudit failed:', e.message);
    }
  };

  async function loadAdmissionIpdMessages(admission_id) {
    const aid = parseInt(admission_id, 10) || 0;
    if (!aid) return [];
    return sq(`
      SELECT m.*,
             CONCAT(f.first_name,' ',f.last_name) AS from_name,
             CONCAT(t.first_name,' ',t.last_name) AS to_name
        FROM tbl_ipd_message m
        LEFT JOIN tbl_employee f ON f.id = m.from_user_id
        LEFT JOIN tbl_employee t ON t.id = m.to_user_id
       WHERE m.admission_id = ?
       ORDER BY m.sent_at ASC, m.id ASC
    `, [aid]);
  }

  const SHIFT_REPORT_FIELDS = ['ward_rounds', 'done_notes', 'not_done_notes', 'pending_notes', 'free_notes'];

  /** Prior values per field (chronological) for red strikethrough UI above textareas. */
  async function loadShiftReportRevisionStrikes(shift_report_id) {
    const sid = parseInt(shift_report_id, 10) || 0;
    if (!sid) return {};
    const rows = await sq(
      `SELECT field_key, old_text FROM tbl_ipd_shift_report_revision WHERE shift_report_id=? ORDER BY id ASC`,
      [sid]
    );
    const out = {
      ward_rounds: [], done_notes: [], not_done_notes: [], pending_notes: [], free_notes: [],
    };
    for (const r of rows) {
      if (out[r.field_key]) out[r.field_key].push(r.old_text != null ? String(r.old_text) : '');
    }
    return out;
  }

  /** Insert revision rows + med_audit for each changed shift field (rowBefore = DB row before update). */
  async function recordShiftReportFieldChanges(req, shiftReportId, admissionId, patientId, rowBefore, fields) {
    const a = actorFromReq(req);
    const norm = (v) => (v == null || v === '') ? '' : String(v);
    let count = 0;
    for (const key of SHIFT_REPORT_FIELDS) {
      const before = norm(rowBefore[key]);
      const after = norm(fields[key]);
      if (before === after) continue;
      await pool.query(
        `INSERT INTO tbl_ipd_shift_report_revision
           (shift_report_id, admission_id, field_key, old_text, new_text, edited_by, edited_name)
         VALUES (?,?,?,?,?,?,?)`,
        [shiftReportId, admissionId, key, before, after, a.id, a.name]
      ).catch((e) => { console.warn('[ipdMed] shift revision insert:', e.message); });
      await logIpdMedAudit(req, {
        admission_id: admissionId,
        patient_id: patientId,
        treatment_id: null,
        prescription_id: null,
        action: 'shift_report_field_edit',
        detail: {
          shift_report_id: shiftReportId,
          field: key,
          report_status: rowBefore.report_status || null,
          submitted: shiftReportIsSubmitted(rowBefore),
          before_preview: before.slice(0, 500),
          after_preview: after.slice(0, 500),
        },
      });
      count++;
    }
    return count;
  }

  async function loadShiftDoseActivity(admission_id, since, until) {
    const aid = parseInt(admission_id, 10) || 0;
    if (!aid) return { administered: [], missed: [], pending: [] };
    const sinceDt = since || '1970-01-01 00:00:00';
    const untilDt = until || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const rows = await sq(
      `SELECT s.id, s.scheduled_at, s.administered, s.administered_at, s.missed_reason, s.nurse_comment,
              r.drug_name, r.route, r.frequency_label,
              ${DOSE_EFFECTIVE_DOSAGE_SQL},
              CONCAT(n.first_name,' ',n.last_name) AS nurse_name
         FROM tbl_ipd_dose_slot s
         JOIN tbl_ipd_prescription r ON r.id = s.prescription_id
         LEFT JOIN tbl_employee n ON n.id = s.administered_by
        WHERE s.admission_id = ?
          AND s.hidden_on_terminate = 0
          AND (
            (s.administered = 1 AND s.administered_at >= ? AND s.administered_at <= ?)
            OR (s.administered = 0 AND s.missed_reason IS NOT NULL AND s.missed_reason <> '' AND s.scheduled_at >= ? AND s.scheduled_at <= ?)
            OR (s.administered = 0 AND (s.missed_reason IS NULL OR s.missed_reason = '') AND s.scheduled_at >= ? AND s.scheduled_at <= ?)
          )
        ORDER BY COALESCE(s.administered_at, s.scheduled_at) ASC`,
      [aid, sinceDt, untilDt, sinceDt, untilDt, sinceDt, untilDt]
    );
    const administered = [];
    const missed = [];
    const pending = [];
    for (const r of rows) {
      if (Number(r.administered) === 1) administered.push(r);
      else if (r.missed_reason) missed.push(r);
      else pending.push(r);
    }
    return { administered, missed, pending };
  }

  function formatDoseLine(d) {
    const drug = String(d.drug_name || '').trim();
    const dose = effectiveDosage(d);
    const route = String(d.route || '').trim();
    const at = d.administered_at || d.scheduled_at;
    let when = '';
    try {
      when = at ? new Date(at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    } catch {
      when = String(at || '');
    }
    const by = d.nurse_name ? ` (${d.nurse_name})` : '';
    return `${drug} ${dose} ${route} — ${when}${by}`.trim();
  }

  function buildTreatmentSummaryPayload(doseActivity) {
    return {
      administered: (doseActivity.administered || []).map((d) => ({
        drug_name: d.drug_name,
        dosage: effectiveDosage(d),
        route: d.route,
        at: d.administered_at,
        nurse_name: d.nurse_name,
        comment: d.nurse_comment || null,
      })),
      missed: (doseActivity.missed || []).map((d) => ({
        drug_name: d.drug_name,
        dosage: effectiveDosage(d),
        scheduled_at: d.scheduled_at,
        reason: d.missed_reason,
      })),
      pending: (doseActivity.pending || []).map((d) => ({
        drug_name: d.drug_name,
        dosage: effectiveDosage(d),
        scheduled_at: d.scheduled_at,
      })),
    };
  }

  async function loadShiftReportRevisions(shift_report_id) {
    const sid = parseInt(shift_report_id, 10) || 0;
    if (!sid) return [];
    return sq(
      `SELECT r.*, CONCAT(e.first_name,' ',e.last_name) AS editor_name
         FROM tbl_ipd_shift_report_revision r
         LEFT JOIN tbl_employee e ON e.id = r.edited_by
        WHERE r.shift_report_id = ?
        ORDER BY r.id DESC
        LIMIT 50`,
      [sid]
    );
  }

  // Convert "HH:MM,HH:MM,…" into Date objects for `start_date` offset.
  function parseScheduleTimes(str) {
    if (!str) return [];
    return String(str).split(',').map(s => s.trim()).filter(Boolean)
      .map(t => {
        const m = t.match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
        const mn = Math.min(59, Math.max(0, parseInt(m[2], 10)));
        return { h, mn };
      }).filter(Boolean);
  }

  // Auto-suggest scheduled times when only `times_per_day` is given.
  function defaultTimesForFrequency(timesPerDay) {
    const t = parseInt(timesPerDay, 10) || 1;
    const presets = {
      1: ['09:00'],
      2: ['09:00','21:00'],
      3: ['08:00','14:00','20:00'],
      4: ['06:00','12:00','18:00','00:00'],
      5: ['06:00','10:00','14:00','18:00','22:00'],
      6: ['04:00','08:00','12:00','16:00','20:00','00:00'],
    };
    return presets[t] || presets[3];
  }

  // Generate dose slots for a prescription.
  async function generateDoseSlots(rx) {
    const tList = (rx.scheduled_times && String(rx.scheduled_times).trim())
      ? rx.scheduled_times
      : defaultTimesForFrequency(rx.times_per_day).join(',');
    const slots = parseScheduleTimes(tList);
    if (!slots.length) return 0;

    const startDate = new Date();           // start now (rounded to today)
    startDate.setSeconds(0, 0);
    const days = Math.max(1, parseInt(rx.duration_days, 10) || 1);

    let inserted = 0;
    for (let day = 0; day < days; day++) {
      for (const t of slots) {
        const dt = new Date(startDate);
        dt.setDate(dt.getDate() + day);
        dt.setHours(t.h, t.mn, 0, 0);
        const sched = dt.toISOString().slice(0, 19).replace('T', ' ');
        await pool.query(
          `INSERT INTO tbl_ipd_dose_slot
             (prescription_id, treatment_id, admission_id, patient_id,
              scheduled_at, day_index)
           VALUES (?,?,?,?,?,?)`,
          [rx.id, rx.treatment_id, rx.admission_id, rx.patient_id, sched, day + 1]
        ).catch(() => {});
        inserted++;
      }
    }
    return inserted;
  }

  /** Append dose rows after the last scheduled slot (same daily time pattern as the Rx). */
  async function appendPrescriptionExtraDays(rx, extraDays) {
    const ex = Math.max(0, parseInt(extraDays, 10) || 0);
    if (ex < 1) return 0;
    const last = await one(
      `SELECT scheduled_at, day_index FROM tbl_ipd_dose_slot
        WHERE prescription_id = ? ORDER BY scheduled_at DESC LIMIT 1`,
      [rx.id]
    );
    if (!last) return 0;
    const lastDt = new Date(last.scheduled_at);
    const lastDayStart = new Date(lastDt);
    lastDayStart.setHours(0, 0, 0, 0);
    const tList = (rx.scheduled_times && String(rx.scheduled_times).trim())
      ? String(rx.scheduled_times)
      : defaultTimesForFrequency(rx.times_per_day).join(',');
    const timeSlots = parseScheduleTimes(tList);
    if (!timeSlots.length) return 0;
    let dayIndex = parseInt(last.day_index, 10) || 0;
    let inserted = 0;
    for (let d = 1; d <= ex; d++) {
      dayIndex += 1;
      const cal = new Date(lastDayStart);
      cal.setDate(cal.getDate() + d);
      for (const tm of timeSlots) {
        const dt = new Date(cal);
        dt.setHours(tm.h, tm.mn, 0, 0);
        const sched = dt.toISOString().slice(0, 19).replace('T', ' ');
        await pool.query(
          `INSERT INTO tbl_ipd_dose_slot
             (prescription_id, treatment_id, admission_id, patient_id, scheduled_at, day_index)
           VALUES (?,?,?,?,?,?)`,
          [rx.id, rx.treatment_id, rx.admission_id, rx.patient_id, sched, dayIndex]
        ).catch(() => {});
        inserted++;
      }
    }
    return inserted;
  }

  /** Post one line to `tbl_ipd_charge` (same shape as /ipd/add-charge) + bump running_bill. */
  async function postCharge(req, admission_id, patient_id, charge_type, description, amount, source_module, source_pk, clinical_detail) {
    if (!admission_id || !(amount > 0)) return null;
    const { admissionAcceptsNewCharges } = require('../lib/ipdSettlementGuard');
    const guard = await admissionAcceptsNewCharges(pool, admission_id);
    if (!guard.ok) return null;
    const uid = Number(req.session.userId || req.session.user?.id || 0) || 1;
    const fid = Number(req.session.facilityId || 1);
    const cd =
      clinical_detail != null && String(clinical_detail).trim() !== ''
        ? String(clinical_detail).slice(0, 65000)
        : null;
    try {
      const [r] = await pool.query(
        `INSERT INTO tbl_ipd_charge
           (facility_id, admission_id, patient_id, charge_type, description, amount, added_by, source_module, source_pk, clinical_detail)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [fid, admission_id, patient_id, charge_type || 'medication', description || 'Charge', amount, uid,
          source_module || 'ipd_med', source_pk != null ? parseInt(source_pk, 10) || null : null, cd]
      );
      await pool.query(
        'UPDATE tbl_admission SET running_bill = COALESCE(running_bill,0) + ? WHERE id = ?',
        [amount, admission_id]
      );
      return r.insertId;
    } catch (e) {
      console.warn('[ipdMed] postCharge failed:', e.message);
      return null;
    }
  }

  // Load an admission shell used by every screen.
  async function loadAdmission(id) {
    return one(`
      SELECT a.*,
             p.first_name, p.last_name, p.gender, p.dob, p.phone, p.is_newborn,
             b.ward_name, b.bed_label,
             CONCAT(doc.first_name,' ',doc.last_name) AS doctor_name
        FROM tbl_admission a
        JOIN tbl_patient p ON p.id = a.patient_id
        LEFT JOIN tbl_bed b ON b.id = a.bed_id
        LEFT JOIN tbl_employee doc ON doc.id = a.admitting_doctor_id
       WHERE a.id = ?
       LIMIT 1
    `, [id]);
  }

  // The "current active" treatment for an admission (only one allowed at a time).
  async function activeTreatment(admission_id) {
    return one(
      `SELECT * FROM tbl_ipd_treatment
        WHERE admission_id = ? AND status = 'active'
        ORDER BY id DESC LIMIT 1`,
      [admission_id]
    );
  }

  // ──────────────────────────────────────────────────────────
  // GET /ipd/medication  → hub (portal tile / sidebar landing)
  // ──────────────────────────────────────────────────────────
  app.get('/ipd/medication', requireAuth, requireIpdView, async (req, res) => {
    const notDischarged = "(a.discharged_at IS NULL OR a.discharged_at = '0000-00-00 00:00:00' OR a.discharged_at = '0000-00-00')";
    const admissions = await sq(`
      SELECT a.id, a.patient_id, a.admitted_at, a.running_bill, a.admitting_department,
             p.first_name, p.last_name,
             b.ward_name, b.bed_label,
             (SELECT t.status FROM tbl_ipd_treatment t
                WHERE t.admission_id = a.id AND t.status = 'active' LIMIT 1) AS tx_status
        FROM tbl_admission a
        JOIN tbl_patient p ON p.id = a.patient_id
        LEFT JOIN tbl_bed b ON b.id = a.bed_id
       WHERE ${notDischarged}
         AND (a.bed_id IS NOT NULL AND a.bed_id <> 0)
       ORDER BY a.admitted_at DESC
       LIMIT 100
    `);
    const { ipdPageData } = require('../lib/reactRouteHelpers');
    res.render('ipd-medication-hub', {
      title: 'IPD Medication',
      ...ipdPageData('medication-hub', {
        admissions: admissions.map((a) => ({
          ...a,
          patient_name: `${a.first_name || ''} ${a.last_name || ''}`.trim(),
        })),
      }),
    });
  });

  // ──────────────────────────────────────────────────────────
  // GET /ipd/admission/:id  → entry point, redirects by ACL (doctor vs nurse paths)
  // ──────────────────────────────────────────────────────────
  app.get('/ipd/admission/:id', requireAuth, requireIpdView, (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    if (!id) return res.redirect('/wards?err=Invalid admission');
    if (isDoctor(req, res)) return res.redirect(`/ipd/treatment/${id}`);
    if (isNurse(req, res)) return res.redirect(`/ipd/chart/${id}`);
    return res.redirect(`/ipd/treatment/${id}`);
  });

  // ==========================================================
  //   1. TREATMENT MANAGER  (Doctor)
  // ==========================================================
  app.get('/ipd/treatment/:admission_id', requireAuth, requireIpdView, async (req, res) => {
    const admission_id = parseInt(req.params.admission_id, 10) || 0;
    if (!admission_id) return res.redirect('/wards?err=Invalid admission');

    const admission = await loadAdmission(admission_id);
    if (!admission) return res.redirect('/wards?err=Admission not found');

    const roleNad = userRole(req);
    const uidNad = userId(req);
    const admDoc = parseInt(admission.admitting_doctor_id || 0, 10) || 0;
    if (roleNad === '2' && admDoc > 0 && uidNad !== admDoc && !clinicalNad.hasBypass(req, 'ipd', admission_id)) {
      const nextUrl = '/ipd/treatment/' + admission_id;
      const docLabel = (admission.doctor_name || 'the admitting physician').trim();
      return res.render('consultation-ack-not-assigned', {
        title: 'Patient not assigned to you',
        mode: 'ipd',
        patientName: [admission.first_name, admission.last_name].filter(Boolean).join(' '),
        assignedDoctorLabel: docLabel,
        nextUrl,
        visitId: 0,
        patientId: admission.patient_id,
        admissionId: admission_id,
        ticketNumber: null,
      });
    }

    const treatments = await sq(
      `SELECT t.*,
              CONCAT(d.first_name,' ',d.last_name) AS doctor_name,
              (SELECT COUNT(*) FROM tbl_ipd_prescription r WHERE r.treatment_id = t.id) AS rx_count,
              (SELECT COUNT(*) FROM tbl_ipd_dose_slot s WHERE s.treatment_id = t.id) AS slots_total,
              (SELECT COUNT(*) FROM tbl_ipd_dose_slot s WHERE s.treatment_id = t.id AND s.administered = 1) AS slots_given,
              (SELECT COUNT(*) FROM tbl_ipd_dose_slot s WHERE s.treatment_id = t.id AND s.administered = 0 AND s.hidden_on_terminate = 0) AS slots_pending
         FROM tbl_ipd_treatment t
         LEFT JOIN tbl_employee d ON d.id = t.doctor_id
        WHERE t.admission_id = ?
        ORDER BY t.id DESC`,
      [admission_id]
    );

    const active = treatments.find(t => t.status === 'active') || null;
    const prescriptions = active
      ? await sq(
          `SELECT r.*,
                  (SELECT COUNT(*) FROM tbl_ipd_dose_slot s WHERE s.prescription_id = r.id) AS slots_total,
                  (SELECT COUNT(*) FROM tbl_ipd_dose_slot s WHERE s.prescription_id = r.id AND s.administered = 1) AS slots_given
             FROM tbl_ipd_prescription r
            WHERE r.treatment_id = ?
            ORDER BY r.locked ASC, r.id ASC`,
          [active.id]
        )
      : [];

    const ipdMessages = await loadAdmissionIpdMessages(admission_id);
    const maternityContext = await require('../lib/maternityNewbornFlow')
      .loadAdmissionMaternityContext(pool, admission)
      .catch(() => null);

    const doseSlots = active
      ? await sq(
          `SELECT s.*, r.drug_name, ${DOSE_EFFECTIVE_DOSAGE_SQL}, r.frequency_label, r.route,
                  CONCAT(n.first_name,' ',n.last_name) AS nurse_name
             FROM tbl_ipd_dose_slot s
             JOIN tbl_ipd_prescription r ON r.id = s.prescription_id
             LEFT JOIN tbl_employee n ON n.id = s.administered_by
            WHERE s.treatment_id = ?
              AND (s.administered = 1 OR s.hidden_on_terminate = 0)
            ORDER BY s.scheduled_at ASC
            LIMIT 300`,
          [active.id]
        )
      : [];

    const { ipdPageData } = require('../lib/reactRouteHelpers');
    res.render('ipd-treatment', {
      title: 'Treatment Manager - IPD',
      admission,
      ...ipdPageData('treatment', {
        admission, treatments, active, prescriptions, doseSlots,
        canEdit: isDoctor(req,res),
        canAdminister: isNurse(req, res) && active && active.status === 'active',
        userRole: userRole(req),
        ipdMessages,
        maternityContext,
      }),
    });
  });

  // POST /ipd/treatment/create
  app.post('/ipd/treatment/create', requireAuth, requireIpdMutate, async (req, res) => {
    if (!isDoctor(req,res)) return res.redirect('back?err=Only a doctor can start a treatment.');
    const {
      admission_id, diagnosis, est_duration_days, start_date, notes
    } = req.body;
    const aid = parseInt(admission_id, 10) || 0;
    if (!aid || !diagnosis) return res.redirect('back?err=Diagnosis is required.');

    const adm = await one('SELECT patient_id FROM tbl_admission WHERE id=? LIMIT 1', [aid]);
    if (!adm) return res.redirect('/wards?err=Admission not found.');

    const existing = await one(
      `SELECT id FROM tbl_ipd_treatment WHERE admission_id=? AND status='active' LIMIT 1`,
      [aid]
    );
    if (existing) {
      return res.redirect(
        `/ipd/treatment/${aid}?err=` + encodeURIComponent('Terminate the current treatment before starting a new one.')
      );
    }

    const docId = userId(req);
    const [insTx] = await pool.query(
      `INSERT INTO tbl_ipd_treatment
         (admission_id, patient_id, doctor_id, diagnosis, est_duration_days, start_date, notes, status)
       VALUES (?,?,?,?,?,?,?, 'active')`,
      [aid, adm.patient_id, docId, diagnosis,
       parseInt(est_duration_days, 10) || null,
       start_date || null,
       notes || null]
    );
    await logIpdMedAudit(req, {
      admission_id: aid,
      patient_id: adm.patient_id,
      treatment_id: insTx.insertId,
      prescription_id: null,
      action: 'treatment_start',
      detail: { diagnosis, est_duration_days: parseInt(est_duration_days, 10) || null },
    });
    res.redirect(`/ipd/treatment/${aid}?msg=Treatment+created`);
  });

  // POST /ipd/treatment/:id/terminate
  app.post('/ipd/treatment/:id/terminate', requireAuth, requireIpdMutate, async (req, res) => {
    if (!isDoctor(req,res)) return res.redirect('back?err=Only a doctor can terminate a treatment.');
    const sid = parseInt(req.params.id, 10) || 0;
    const slot = await one('SELECT * FROM tbl_ipd_dose_slot WHERE id=? LIMIT 1', [sid]);
    const t = await one('SELECT * FROM tbl_ipd_treatment WHERE id=? LIMIT 1', [slot.treatment_id]);
    if (!t) return res.redirect('/wards?err=Treatment not found.');
    if (t.status !== 'active') {
      return res.redirect(`/ipd/treatment/${t.admission_id}?err=Treatment+is+already+${t.status}`);
    }
    const reason = (req.body.reason || '').toString().trim().slice(0, 300) || null;

    // 1. Lock the treatment.
    await pool.query(
      `UPDATE tbl_ipd_treatment
          SET status='terminated', terminated_at=NOW(), terminated_by=?, terminated_reason=?
        WHERE id=?`,
      [userId(req), reason, id]
    );
    // 2. Lock all Rx on this treatment.
    await pool.query(
      'UPDATE tbl_ipd_prescription SET locked = 1 WHERE treatment_id = ?', [id]
    );
    // 3. Mark all pending (un-administered) dose slots as hidden-on-terminate so
    //    they disappear from the nurse working view but remain in the audit.
    await pool.query(
      `UPDATE tbl_ipd_dose_slot
          SET hidden_on_terminate = 1
        WHERE treatment_id = ? AND administered = 0`,
      [id]
    );
    await logIpdMedAudit(req, {
      admission_id: t.admission_id,
      patient_id: t.patient_id,
      treatment_id: id,
      prescription_id: null,
      action: 'treatment_terminate',
      detail: { reason, diagnosis: t.diagnosis },
    });
    res.redirect(`/ipd/treatment/${t.admission_id}?msg=Treatment+terminated`);
  });

  // POST /ipd/prescription/add  (Doctor adds an Rx to the active treatment)
  app.post('/ipd/prescription/add', requireAuth, requireIpdMutate, async (req, res) => {
    if (!isDoctor(req,res)) return res.redirect('back?err=Only a doctor can prescribe.');
    const {
      treatment_id, drug_name, drug_type, dosage, route,
      frequency_label, times_per_day, duration_days,
      scheduled_times, unit_price, notes
    } = req.body;

    const tid = parseInt(treatment_id, 10) || 0;
    const t = await one('SELECT * FROM tbl_ipd_treatment WHERE id=? LIMIT 1', [tid]);
    if (!t) return res.redirect('back?err=Treatment not found.');
    if (t.status !== 'active') {
      return res.redirect(`/ipd/treatment/${t.admission_id}?err=Cannot+add+to+a+${t.status}+treatment`);
    }
    if (!drug_name || !dosage) {
      return res.redirect(`/ipd/treatment/${t.admission_id}?err=Drug+name+and+dosage+are+required`);
    }

    const customName = (req.body.custom_drug_name || '').toString().trim();
    const pricing = await resolveRxPricingFromBody(req.body);
    const finalDrugName = pricing.name || customName || (drug_name || '').toString().trim();
    if (!finalDrugName) {
      return res.redirect(`/ipd/treatment/${t.admission_id}?err=Drug+name+and+dosage+are+required`);
    }
    const finalUnitPrice = pricing.isCustom ? 0 : pricing.unitPrice;
    const treatmentStart = parseTreatmentStart(req.body, null);

    const [r] = await pool.query(
      `INSERT INTO tbl_ipd_prescription
         (treatment_id, admission_id, patient_id,
          drug_name, drug_type, dosage, route,
          frequency_label, times_per_day, duration_days,
          scheduled_times, unit_price, treatment_start, notes, created_by)
       VALUES (?,?,?, ?,?,?,?, ?,?,?, ?,?,?, ?)`,
      [
        tid, t.admission_id, t.patient_id,
        finalDrugName, drug_type || 'tablet', dosage, route || 'oral',
        frequency_label || 'TDS',
        parseInt(times_per_day, 10) || 3,
        parseInt(duration_days, 10) || 1,
        scheduled_times || null,
        finalUnitPrice,
        treatmentStart,
        notes || null,
        userId(req),
      ]
    );

    const rx = {
      id: r.insertId,
      treatment_id: tid,
      admission_id: t.admission_id,
      patient_id: t.patient_id,
      times_per_day: parseInt(times_per_day, 10) || 3,
      duration_days: parseInt(duration_days, 10) || 1,
      scheduled_times,
    };
    await generateDoseSlots(rx);

    const freshRx = await one('SELECT * FROM tbl_ipd_prescription WHERE id=? LIMIT 1', [r.insertId]);
    if (freshRx) await syncIpdPrescriptionCharge(pool, req, freshRx);

    await logIpdMedAudit(req, {
      admission_id: t.admission_id,
      patient_id: t.patient_id,
      treatment_id: tid,
      prescription_id: r.insertId,
      action: 'prescription_add',
      detail: { drug_name: finalDrugName, dosage, frequency_label: frequency_label || 'TDS' },
    });

    res.redirect(`/ipd/treatment/${t.admission_id}?msg=Prescription+added`);
  });

  // POST /ipd/prescription/:id/revise  (Doctor — labels, replace, extend, shorten)
  app.post('/ipd/prescription/:id/revise', requireAuth, requireIpdMutate, async (req, res) => {
    if (!isDoctor(req, res)) return res.redirect('back?err=Only+a+doctor+can+revise+prescriptions');
    const rid = parseInt(req.params.id, 10) || 0;
    const rx = await one('SELECT * FROM tbl_ipd_prescription WHERE id=? LIMIT 1', [rid]);
    if (!rx) return res.redirect('back?err=Prescription+not+found');
    if (rx.locked) return res.redirect(`/ipd/treatment/${rx.admission_id}?err=Prescription+is+locked`);
    const t = await one('SELECT * FROM tbl_ipd_treatment WHERE id=? LIMIT 1', [rx.treatment_id]);
    if (!t || t.status !== 'active') {
      return res.redirect(`/ipd/treatment/${rx.admission_id}?err=Treatment+is+not+active`);
    }

    const givenRow = await one(
      'SELECT COUNT(*) AS n FROM tbl_ipd_dose_slot WHERE prescription_id=? AND administered=1',
      [rid]
    );
    const slotsGiven = givenRow && Number(givenRow.n) > 0 ? Number(givenRow.n) : 0;

    const action = String(req.body.revise_action || 'labels').toLowerCase();
    const aid = rx.admission_id;

    const readRxForm = async () => {
      const pricing = await resolveRxPricingFromBody(req.body);
      const drugLabel = pricing.name || (req.body.drug_name || '').toString().trim();
      return {
        drug_name: drugLabel,
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
    };

    try {
      if (action === 'labels') {
        const f = await readRxForm();
        if (!f.dosage) {
          return res.redirect(`/ipd/treatment/${aid}?err=Dosage+is+required`);
        }
        await pool.query(
          `UPDATE tbl_ipd_prescription SET
             dosage=?, notes=?, frequency_label=?, route=?, drug_type=?, treatment_start=?
           WHERE id=?`,
          [f.dosage, f.notes, f.frequency_label, f.route, f.drug_type, f.treatment_start, rid]
        );
        await logIpdMedAudit(req, {
          admission_id: aid,
          patient_id: rx.patient_id,
          treatment_id: rx.treatment_id,
          prescription_id: rid,
          action: 'prescription_labels_update',
          detail: { before: { dosage: rx.dosage, frequency_label: rx.frequency_label }, after: f },
        });
        return res.redirect(`/ipd/treatment/${aid}?msg=Prescription+updated`);
      }

      if (action === 'extend') {
        const extra = Math.min(60, Math.max(1, parseInt(req.body.extra_duration_days, 10) || 0));
        if (!extra) {
          return res.redirect(`/ipd/treatment/${aid}?err=Enter+days+to+extend`);
        }
        let fresh = await one('SELECT * FROM tbl_ipd_prescription WHERE id=? LIMIT 1', [rid]);
        const n = await appendPrescriptionExtraDays(fresh, extra);
        await pool.query(
          'UPDATE tbl_ipd_prescription SET duration_days = duration_days + ? WHERE id=?',
          [extra, rid]
        );
        fresh = await one('SELECT * FROM tbl_ipd_prescription WHERE id=? LIMIT 1', [rid]);
        if (fresh) await syncIpdPrescriptionCharge(pool, req, fresh);
        await logIpdMedAudit(req, {
          admission_id: aid,
          patient_id: rx.patient_id,
          treatment_id: rx.treatment_id,
          prescription_id: rid,
          action: 'prescription_extend',
          detail: { extra_duration_days: extra, slots_appended: n, drug_name: rx.drug_name },
        });
        return res.redirect(`/ipd/treatment/${aid}?msg=Plan+extended`);
      }

      if (action === 'shorten') {
        const newDur = Math.min(90, Math.max(1, parseInt(req.body.new_duration_days, 10) || 0));
        if (!newDur) {
          return res.redirect(`/ipd/treatment/${aid}?err=Enter+new+duration`);
        }
        const tpd = Math.max(1, parseInt(rx.times_per_day, 10) || 1);
        const minDur = Math.ceil(slotsGiven / tpd);
        if (newDur < minDur) {
          return res.redirect(
            `/ipd/treatment/${aid}?err=` + encodeURIComponent(`Duration must be ≥ ${minDur} day(s) (${slotsGiven} dose(s) already given).`)
          );
        }
        const totRow = await one(
          'SELECT COUNT(*) AS n FROM tbl_ipd_dose_slot WHERE prescription_id=?',
          [rid]
        );
        const T = Number(totRow && totRow.n) || 0;
        const targetTotal = newDur * tpd;
        if (T > targetTotal) {
          const remove = T - targetTotal;
          await pool.query(
            `DELETE FROM tbl_ipd_dose_slot WHERE prescription_id=? AND administered=0
               ORDER BY scheduled_at DESC LIMIT ?`,
            [rid, remove]
          );
        }
        await pool.query('UPDATE tbl_ipd_prescription SET duration_days=? WHERE id=?', [newDur, rid]);
        const fresh = await one('SELECT * FROM tbl_ipd_prescription WHERE id=? LIMIT 1', [rid]);
        if (fresh) await syncIpdPrescriptionCharge(pool, req, fresh);
        await logIpdMedAudit(req, {
          admission_id: aid,
          patient_id: rx.patient_id,
          treatment_id: rx.treatment_id,
          prescription_id: rid,
          action: 'prescription_shorten',
          detail: { new_duration_days: newDur, drug_name: rx.drug_name, slots_given: slotsGiven },
        });
        return res.redirect(`/ipd/treatment/${aid}?msg=Plan+shortened`);
      }

      if (action === 'replace') {
        const f = await readRxForm();
        if (!f.drug_name || !f.dosage) {
          return res.redirect(`/ipd/treatment/${aid}?err=Drug+name+and+dosage+are+required`);
        }

        if (slotsGiven === 0) {
          await pool.query('DELETE FROM tbl_ipd_dose_slot WHERE prescription_id=? AND administered=0', [rid]);
          await pool.query(
            `UPDATE tbl_ipd_prescription SET
               drug_name=?, drug_type=?, dosage=?, route=?,
               frequency_label=?, times_per_day=?, duration_days=?,
               scheduled_times=?, unit_price=?, treatment_start=?, notes=?
             WHERE id=?`,
            [
              f.drug_name, f.drug_type, f.dosage, f.route,
              f.frequency_label, f.times_per_day, f.duration_days,
              f.scheduled_times, f.unit_price, f.treatment_start, f.notes, rid,
            ]
          );
          const updated = await one('SELECT * FROM tbl_ipd_prescription WHERE id=? LIMIT 1', [rid]);
          await generateDoseSlots({
            id: rid,
            treatment_id: updated.treatment_id,
            admission_id: updated.admission_id,
            patient_id: updated.patient_id,
            times_per_day: updated.times_per_day,
            duration_days: updated.duration_days,
            scheduled_times: updated.scheduled_times,
          });
          if (updated) await syncIpdPrescriptionCharge(pool, req, updated);
          await logIpdMedAudit(req, {
            admission_id: aid,
            patient_id: rx.patient_id,
            treatment_id: rx.treatment_id,
            prescription_id: rid,
            action: 'prescription_replace_regenerate',
            detail: { after: f, note: 'No doses had been administered; chart regenerated.' },
          });
          return res.redirect(`/ipd/treatment/${aid}?msg=Medication+replaced`);
        }

        // Doses already given: discontinue line + new prescription row.
        await pool.query('DELETE FROM tbl_ipd_dose_slot WHERE prescription_id=? AND administered=0', [rid]);
        await removeIpdPrescriptionCharge(pool, rx);
        const discNote = ((rx.notes || '') + `\n[Discontinued — replaced; ${new Date().toISOString().slice(0, 10)}]`).trim();
        await pool.query(
          'UPDATE tbl_ipd_prescription SET locked=1, notes=? WHERE id=?',
          [discNote.slice(0, 4000), rid]
        );
        const [ins] = await pool.query(
          `INSERT INTO tbl_ipd_prescription
             (treatment_id, admission_id, patient_id,
              drug_name, drug_type, dosage, route,
              frequency_label, times_per_day, duration_days,
              scheduled_times, unit_price, treatment_start, notes, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            t.id, t.admission_id, t.patient_id,
            f.drug_name, f.drug_type, f.dosage, f.route,
            f.frequency_label, f.times_per_day, f.duration_days,
            f.scheduled_times, f.unit_price, f.treatment_start, f.notes, userId(req),
          ]
        );
        const newId = ins.insertId;
        await generateDoseSlots({
          id: newId,
          treatment_id: t.id,
          admission_id: t.admission_id,
          patient_id: t.patient_id,
          times_per_day: f.times_per_day,
          duration_days: f.duration_days,
          scheduled_times: f.scheduled_times,
        });
        const newRx = await one('SELECT * FROM tbl_ipd_prescription WHERE id=? LIMIT 1', [newId]);
        if (newRx) await syncIpdPrescriptionCharge(pool, req, newRx);
        await logIpdMedAudit(req, {
          admission_id: aid,
          patient_id: rx.patient_id,
          treatment_id: rx.treatment_id,
          prescription_id: rid,
          action: 'prescription_discontinued_replace',
          detail: { old_drug: rx.drug_name, new_prescription_id: newId, new: f },
        });
        await logIpdMedAudit(req, {
          admission_id: aid,
          patient_id: t.patient_id,
          treatment_id: t.id,
          prescription_id: newId,
          action: 'prescription_add_replace',
          detail: { replaces_prescription_id: rid, drug_name: f.drug_name },
        });
        return res.redirect(`/ipd/treatment/${aid}?msg=Medication+replaced+after+doses+started`);
      }

      return res.redirect(`/ipd/treatment/${aid}?err=Unknown+revision+action`);
    } catch (err) {
      console.error('[ipdMed] prescription/revise failed:', err);
      return res.redirect(`/ipd/treatment/${aid}?err=` + encodeURIComponent(err.message || 'Revise failed'));
    }
  });

  // POST /ipd/prescription/:id/delete  (Doctor only, only before any dose given)
  app.post('/ipd/prescription/:id/delete', requireAuth, requireIpdMutate, async (req, res) => {
    if (!isDoctor(req,res)) return res.redirect('back?err=Only a doctor can remove a prescription.');
    const rid = parseInt(req.params.id, 10) || 0;
    const rx = await one('SELECT * FROM tbl_ipd_prescription WHERE id=? LIMIT 1', [rid]);
    if (!rx) return res.redirect('back?err=Prescription not found.');
    if (rx.locked) return res.redirect('back?err=Prescription is locked.');

    const given = await one(
      'SELECT COUNT(*) AS n FROM tbl_ipd_dose_slot WHERE prescription_id=? AND administered=1',
      [rid]
    );
    if (given && given.n > 0) {
      return res.redirect(
        `/ipd/treatment/${rx.admission_id}?err=Cannot+delete+-+some+doses+already+administered`
      );
    }
    await pool.query('DELETE FROM tbl_ipd_dose_slot WHERE prescription_id=? AND administered=0', [rid]);
    await removeIpdPrescriptionCharge(pool, rx);
    await pool.query('DELETE FROM tbl_ipd_prescription WHERE id=?', [rid]);
    await logIpdMedAudit(req, {
      admission_id: rx.admission_id,
      patient_id: rx.patient_id,
      treatment_id: rx.treatment_id,
      prescription_id: rid,
      action: 'prescription_delete',
      detail: { drug_name: rx.drug_name, dosage: rx.dosage },
    });
    res.redirect(`/ipd/treatment/${rx.admission_id}?msg=Prescription+removed`);
  });

  // POST /ipd/dose/:id/update  (Doctor adjusts scheduled time / comment / optional ack)
  app.post('/ipd/dose/:id/update', requireAuth, requireIpdMutate, async (req, res) => {
    if (!isDoctor(req, res)) return res.redirect('back?err=Only+a+doctor+can+update+dose+slots');
    const sid = parseInt(req.params.id, 10) || 0;
    const slot = await one(
      `SELECT s.*, t.status AS treatment_status, r.locked AS rx_locked
         FROM tbl_ipd_dose_slot s
         JOIN tbl_ipd_treatment t ON t.id = s.treatment_id
         JOIN tbl_ipd_prescription r ON r.id = s.prescription_id
        WHERE s.id = ? LIMIT 1`,
      [sid]
    );
    if (!slot) return res.redirect('back?err=Dose+slot+not+found');
    if (slot.treatment_status !== 'active') {
      return res.redirect(`/ipd/treatment/${slot.admission_id}?err=Treatment+is+not+active`);
    }
    if (Number(slot.rx_locked) === 1) {
      return res.redirect(`/ipd/treatment/${slot.admission_id}?err=Prescription+is+locked`);
    }
    if (Number(slot.administered) === 1) {
      return res.redirect(
        `/ipd/treatment/${slot.admission_id}?err=` + encodeURIComponent('Cannot edit — dose already administered.')
      );
    }

    const scheduledRaw = String(req.body.scheduled_at || '').trim();
    let scheduledAt = slot.scheduled_at;
    if (scheduledRaw) {
      const d = new Date(scheduledRaw);
      if (!Number.isNaN(d.getTime())) {
        scheduledAt = d.toISOString().slice(0, 19).replace('T', ' ');
      }
    }
    const doctorComment = String(req.body.doctor_comment || '').trim().slice(0, 500) || null;
    const doctorAck =
      req.body.doctor_ack === '1' || req.body.doctor_ack === 'on' || req.body.doctor_ack === true ? 1 : 0;
    const slotDosage = String(req.body.slot_dosage || '').trim().slice(0, 80) || null;

    await pool.query(
      `UPDATE tbl_ipd_dose_slot
          SET scheduled_at = ?, doctor_comment = ?, doctor_ack = ?, slot_dosage = ?
        WHERE id = ?`,
      [scheduledAt, doctorComment, doctorAck, slotDosage, sid]
    );

    await logIpdMedAudit(req, {
      admission_id: slot.admission_id,
      patient_id: slot.patient_id,
      treatment_id: slot.treatment_id,
      prescription_id: slot.prescription_id,
      action: 'dose_slot_update',
      detail: {
        scheduled_at: scheduledAt,
        slot_dosage: slotDosage,
        doctor_comment: doctorComment,
        doctor_ack: doctorAck,
      },
    });

    res.redirect(`/ipd/treatment/${slot.admission_id}?msg=Dose+slot+updated`);
  });

  // POST /ipd/dose/:id/ack  (Doctor optional line review checkbox — JSON friendly)
  app.post('/ipd/dose/:id/ack', requireAuth, requireIpdMutate, async (req, res) => {
    const asJson = wantsJson(req);
    if (!isDoctor(req, res)) {
      if (asJson) return res.status(403).json({ ok: false, error: 'Permission denied' });
      return res.redirect('back?err=Permission+denied');
    }
    const sid = parseInt(req.params.id, 10) || 0;
    const slot = await one(
      `SELECT s.*, t.status AS treatment_status FROM tbl_ipd_dose_slot s
       JOIN tbl_ipd_treatment t ON t.id = s.treatment_id WHERE s.id=? LIMIT 1`,
      [sid]
    );
    if (!slot) {
      if (asJson) return res.status(404).json({ ok: false, error: 'Not found' });
      return res.redirect('back?err=Not+found');
    }
    const ack = req.body.doctor_ack === '1' || req.body.doctor_ack === true || req.body.doctor_ack === 'on' ? 1 : 0;
    await pool.query('UPDATE tbl_ipd_dose_slot SET doctor_ack=? WHERE id=?', [ack, sid]);
    await logIpdMedAudit(req, {
      admission_id: slot.admission_id,
      patient_id: slot.patient_id,
      treatment_id: slot.treatment_id,
      prescription_id: slot.prescription_id,
      action: ack ? 'dose_slot_ack_on' : 'dose_slot_ack_off',
      detail: { doctor_ack: ack },
    });
    if (asJson) return res.json({ ok: true, doctor_ack: ack });
    res.redirect(`/ipd/treatment/${slot.admission_id}`);
  });

  // POST /ipd/dose/:id/delete  (Doctor removes a pending dose line)
  app.post('/ipd/dose/:id/delete', requireAuth, requireIpdMutate, async (req, res) => {
    if (!isDoctor(req, res)) return res.redirect('back?err=Only+a+doctor+can+delete+dose+slots');
    const sid = parseInt(req.params.id, 10) || 0;
    const slot = await one(
      `SELECT s.*, t.status AS treatment_status, r.drug_name, r.dosage
         FROM tbl_ipd_dose_slot s
         JOIN tbl_ipd_treatment t ON t.id = s.treatment_id
         JOIN tbl_ipd_prescription r ON r.id = s.prescription_id
        WHERE s.id = ? LIMIT 1`,
      [sid]
    );
    if (!slot) return res.redirect('back?err=Dose+slot+not+found');
    if (slot.treatment_status !== 'active') {
      return res.redirect(`/ipd/treatment/${slot.admission_id}?err=Treatment+is+not+active`);
    }
    if (Number(slot.administered) === 1) {
      return res.redirect(
        `/ipd/treatment/${slot.admission_id}?err=` + encodeURIComponent('Cannot delete — dose already administered.')
      );
    }
    await pool.query('DELETE FROM tbl_ipd_dose_slot WHERE id=?', [sid]);
    await logIpdMedAudit(req, {
      admission_id: slot.admission_id,
      patient_id: slot.patient_id,
      treatment_id: slot.treatment_id,
      prescription_id: slot.prescription_id,
      action: 'dose_slot_delete',
      detail: {
        scheduled_at: slot.scheduled_at,
        drug_name: slot.drug_name,
        dosage: slot.dosage,
      },
    });
    res.redirect(`/ipd/treatment/${slot.admission_id}?msg=Dose+line+removed`);
  });

  // ==========================================================
  //   2. BEDHEAD DRUG CHART  (Nurse)
  // ==========================================================
  app.get('/ipd/chart/:admission_id', requireAuth, requireIpdView, async (req, res) => {
    const admission_id = parseInt(req.params.admission_id, 10) || 0;
    if (!admission_id) return res.redirect('/wards?err=Invalid admission');

    const admission = await loadAdmission(admission_id);
    if (!admission) return res.redirect('/wards?err=Admission not found');

    const active = await activeTreatment(admission_id);

    // Working view = all rows from active treatment that are EITHER
    //  – administered (visible green), OR
    //  – pending and not yet hidden by termination.
    // Plus a 24h window centred on now so the nurse sees what's due.
    const slots = active ? await sq(`
      SELECT s.*,
             r.drug_name, r.drug_type, ${DOSE_EFFECTIVE_DOSAGE_SQL}, r.route, r.frequency_label,
             CONCAT(n.first_name,' ',n.last_name) AS nurse_name
        FROM tbl_ipd_dose_slot s
        JOIN tbl_ipd_prescription r ON r.id = s.prescription_id
        LEFT JOIN tbl_employee n ON n.id = s.administered_by
       WHERE s.treatment_id = ?
         AND (s.administered = 1 OR s.hidden_on_terminate = 0)
         AND s.scheduled_at BETWEEN DATE_SUB(NOW(), INTERVAL 12 HOUR)
                                AND DATE_ADD(NOW(), INTERVAL 24 HOUR)
       ORDER BY s.scheduled_at ASC, r.drug_name ASC
    `, [active.id]) : [];

    // Pre-loaded consumable catalogue for the "Extra Materials" widget.
    const catalog = await sq(
      `SELECT * FROM tbl_ipd_consumable_catalog WHERE is_active=1 ORDER BY category, name`
    );

    // Current open shift report (if any).
    const shift = await one(
      `SELECT * FROM tbl_ipd_shift_report
        WHERE admission_id=? AND locked=0 AND shift_ended_at IS NULL
          AND (report_status IS NULL OR report_status = '' OR report_status = 'open')
        ORDER BY id DESC LIMIT 1`,
      [admission_id]
    );

    const { ipdPageData } = require('../lib/reactRouteHelpers');
    res.render('ipd-drug-chart', {
      title: 'Bedhead Drug Chart - IPD',
      admission,
      includeIpdChargeModal: false,
      ...ipdPageData('drug-chart', {
        admission,
        active,
        slots,
        shift,
        canAdminister: isNurse(req,res) && active && active.status === 'active',
        userRole: userRole(req),
        ipdMessages: await loadAdmissionIpdMessages(admission_id),
        columns: [
          { key: 'scheduled_at', label: 'When' },
          { key: 'drug_name', label: 'Drug' },
          { key: 'dosage', label: 'Dose' },
          { key: 'administered_label', label: 'Given' },
        ],
        rows: (slots || []).map((s) => ({
          ...s,
          administered_label: s.administered ? 'Yes' : 'No',
        })),
      }),
    });
  });

  // POST /ipd/dose/:id/administer   (Nurse ticks a dose)
  app.post('/ipd/dose/:id/administer', requireAuth, requireIpdMutate, async (req, res) => {
    const asJson = wantsJson(req);
    const back = (admId, msg) => admId
      ? res.redirect(`${doseReturnPath(req, admId)}?err=${encodeURIComponent(msg)}`)
      : res.redirect('/wards?err=' + encodeURIComponent(msg));
    try {
      if (!isNurse(req, res)) {
        if (asJson) return res.status(403).json({ ok: false, error: 'Only nurses can administer doses.' });
        return back(0, 'Only nurses can administer doses.');
      }
      const sid = parseInt(req.params.id, 10) || 0;
      const slot = await one(`
        SELECT s.*, r.drug_name, ${DOSE_EFFECTIVE_DOSAGE_SQL}, r.unit_price, t.status AS treatment_status
          FROM tbl_ipd_dose_slot s
          JOIN tbl_ipd_prescription r ON r.id = s.prescription_id
          JOIN tbl_ipd_treatment    t ON t.id = s.treatment_id
         WHERE s.id = ? LIMIT 1
      `, [sid]);
      if (!slot) {
        if (asJson) return res.status(404).json({ ok: false, error: 'Dose not found' });
        return back(0, 'Dose not found.');
      }
      if (slot.treatment_status !== 'active') {
        if (asJson) return res.status(400).json({ ok: false, error: 'Treatment is terminated.' });
        return back(slot.admission_id, 'Cannot administer on a terminated treatment.');
      }
      if (slot.administered) {
        if (asJson) return res.json({ ok: true, alreadyDone: true });
        return res.redirect(doseReturnPath(req, slot.admission_id));
      }

      const nurseComment = String(req.body.nurse_comment || '').trim().slice(0, 500) || null;
      const doseLabel = effectiveDosage(slot);

      await pool.query(
        `UPDATE tbl_ipd_dose_slot
            SET administered = 1, administered_at = NOW(), administered_by = ?,
                nurse_comment = ?, admin_locked = 1
          WHERE id = ? AND administered = 0`,
        [userId(req), nurseComment, sid]
      );

      // Auto-bill per dose only when prescription was not billed upfront
      let chargeId = null;
      const hasUpfront = await ipdPrescriptionHasUpfrontCharge(pool, slot.prescription_id);
      if (!hasUpfront && Number(slot.unit_price) > 0) {
        chargeId = await postCharge(
          req,
          slot.admission_id, slot.patient_id,
          'medication',
          `${slot.drug_name} ${doseLabel}`,
          Number(slot.unit_price),
          'ipd_drug_chart',
          sid,
          null
        );
        if (chargeId) {
          await pool.query(
            'UPDATE tbl_ipd_dose_slot SET billed=1, charge_id=? WHERE id=?',
            [chargeId, sid]
          );
        }
      }

      await logIpdMedAudit(req, {
        admission_id: slot.admission_id,
        patient_id: slot.patient_id,
        treatment_id: slot.treatment_id,
        prescription_id: slot.prescription_id,
        action: 'dose_administered',
        detail: {
          drug_name: slot.drug_name,
          dosage: doseLabel,
          nurse_comment: nurseComment,
          scheduled_at: slot.scheduled_at,
        },
      });

      if (asJson) {
        return res.json({
          ok: true,
          administered_at: new Date().toISOString(),
          charge_id: chargeId,
        });
      }
      res.redirect(`${doseReturnPath(req, slot.admission_id)}?msg=Dose+recorded`);
    } catch (err) {
      console.error('[ipdMed] administer failed:', err);
      if (asJson) return res.status(500).json({ ok: false, error: err.message || 'Server error' });
      res.redirect('/wards?err=' + encodeURIComponent('Dose record failed: ' + err.message));
    }
  });

  // POST /ipd/dose/:id/miss     (Nurse marks a dose as missed with reason)
  app.post('/ipd/dose/:id/miss', requireAuth, requireIpdMutate, async (req, res) => {
    const asJson = wantsJson(req);
    try {
      if (!isNurse(req, res)) {
        if (asJson) return res.status(403).json({ ok: false, error: 'Permission denied' });
        return res.redirect('/wards?err=Permission+denied');
      }
      const sid = parseInt(req.params.id, 10) || 0;
      const reason = (req.body.reason || '').toString().trim().slice(0, 200) || 'Missed';
      const slot = await one('SELECT * FROM tbl_ipd_dose_slot WHERE id=? LIMIT 1', [sid]);
      if (!slot) {
        if (asJson) return res.status(404).json({ ok: false, error: 'Dose not found' });
        return res.redirect('/wards?err=Dose+not+found');
      }
      if (slot.administered) {
        if (asJson) return res.status(400).json({ ok: false, error: 'Dose already given' });
        return res.redirect(`${doseReturnPath(req, slot.admission_id)}?err=Dose+already+given`);
      }
      await pool.query(
        `UPDATE tbl_ipd_dose_slot
            SET missed_reason = ?, hidden_on_terminate = 1
          WHERE id = ?`,
        [reason, sid]
      );
      await logIpdMedAudit(req, {
        admission_id: slot.admission_id,
        patient_id: slot.patient_id,
        treatment_id: slot.treatment_id,
        prescription_id: slot.prescription_id,
        action: 'dose_missed',
        detail: { reason, scheduled_at: slot.scheduled_at },
      });
      if (asJson) return res.json({ ok: true, missed_reason: reason });
      res.redirect(`${doseReturnPath(req, slot.admission_id)}?msg=Dose+marked+missed`);
    } catch (err) {
      console.error('[ipdMed] miss-dose failed:', err);
      if (asJson) return res.status(500).json({ ok: false, error: err.message || 'Server error' });
      res.redirect('/wards?err=' + encodeURIComponent('Miss dose failed: ' + err.message));
    }
  });

  // POST /ipd/dose/:id/correct  (Nurse corrects a locked administered dose — audited)
  app.post('/ipd/dose/:id/correct', requireAuth, requireIpdMutate, async (req, res) => {
    const asJson = wantsJson(req);
    try {
      if (!isNurse(req, res)) {
        if (asJson) return res.status(403).json({ ok: false, error: 'Permission denied' });
        return res.redirect('back?err=Permission+denied');
      }
      const sid = parseInt(req.params.id, 10) || 0;
      const slot = await one(`
        SELECT s.*, r.drug_name, ${DOSE_EFFECTIVE_DOSAGE_SQL}
          FROM tbl_ipd_dose_slot s
          JOIN tbl_ipd_prescription r ON r.id = s.prescription_id
         WHERE s.id = ? LIMIT 1
      `, [sid]);
      if (!slot) {
        if (asJson) return res.status(404).json({ ok: false, error: 'Dose not found' });
        return res.redirect('/wards?err=Dose+not+found');
      }
      if (!slot.administered) {
        if (asJson) return res.status(400).json({ ok: false, error: 'Only administered doses can be corrected' });
        return res.redirect(
          `${doseReturnPath(req, slot.admission_id)}?err=` + encodeURIComponent('Only administered doses can be corrected.')
        );
      }
      const correctionReason = String(req.body.correction_reason || '').trim().slice(0, 500);
      if (!correctionReason) {
        if (asJson) return res.status(400).json({ ok: false, error: 'Correction reason is required' });
        return res.redirect(
          `${doseReturnPath(req, slot.admission_id)}?err=` + encodeURIComponent('Correction reason is required.')
        );
      }
      const nurseComment = String(req.body.nurse_comment || '').trim().slice(0, 500) || null;
      const slotDosage = String(req.body.slot_dosage || '').trim().slice(0, 80) || null;
      const prev = {
        nurse_comment: slot.nurse_comment,
        slot_dosage: slot.slot_dosage,
        dosage: effectiveDosage(slot),
      };

      await pool.query(
        `UPDATE tbl_ipd_dose_slot
            SET nurse_comment = ?, slot_dosage = ?
          WHERE id = ?`,
        [nurseComment, slotDosage, sid]
      );

      await logIpdMedAudit(req, {
        admission_id: slot.admission_id,
        patient_id: slot.patient_id,
        treatment_id: slot.treatment_id,
        prescription_id: slot.prescription_id,
        action: 'dose_administration_corrected',
        detail: {
          correction_reason: correctionReason,
          nurse_comment: nurseComment,
          slot_dosage: slotDosage,
          previous: prev,
        },
      });

      if (asJson) return res.json({ ok: true });
      res.redirect(`${doseReturnPath(req, slot.admission_id)}?msg=Correction+recorded`);
    } catch (err) {
      console.error('[ipdMed] dose correct failed:', err);
      if (asJson) return res.status(500).json({ ok: false, error: err.message || 'Server error' });
      res.redirect('/wards?err=' + encodeURIComponent('Correction failed: ' + err.message));
    }
  });

  // ==========================================================
  //   3. EXTRA MATERIALS LOGGER  (Nurse)
  // ==========================================================
  app.post('/ipd/consumable/log', requireAuth, requireIpdMutate, async (req, res) => {
    if (!isNurse(req,res)) return res.redirect('back?err=Permission denied.');
    const {
      admission_id, catalog_id, quantity, notes, shift_report_id
    } = req.body;
    const aid = parseInt(admission_id, 10) || 0;
    const qty = Math.max(0.01, parseFloat(quantity) || 1);
    if (!aid || !catalog_id) return res.redirect('back?err=Pick an item.');

    const cat = await one(
      'SELECT * FROM tbl_ipd_consumable_catalog WHERE id=? LIMIT 1',
      [parseInt(catalog_id, 10) || 0]
    );
    if (!cat) return res.redirect('back?err=Catalog item not found.');

    const adm = await one(
      'SELECT patient_id FROM tbl_admission WHERE id=? LIMIT 1', [aid]
    );
    if (!adm) return res.redirect('back?err=Admission not found.');

    const total = Number(cat.unit_price) * qty;
    const [r] = await pool.query(
      `INSERT INTO tbl_ipd_consumable_log
         (admission_id, patient_id, catalog_id, item_name, unit_price,
          quantity, total, notes, shift_report_id, logged_by)
       VALUES (?,?,?,?,?, ?,?,?, ?,?)`,
      [aid, adm.patient_id, cat.id, cat.name, cat.unit_price,
       qty, total, notes || null,
       parseInt(shift_report_id, 10) || null, userId(req)]
    );

    // Auto-bill instantly.
    const chargeId = await postCharge(
      req,
      aid, adm.patient_id, 'consumable', `${cat.name} ×${qty}`,
      total, 'ipd_consumables',
      r.insertId,
      null
    );
    if (chargeId) {
      await pool.query(
        'UPDATE tbl_ipd_consumable_log SET billed=1, charge_id=? WHERE id=?',
        [chargeId, r.insertId]
      );
    }
    res.redirect(`/ipd/shift/${aid}?msg=${encodeURIComponent(cat.name + ' logged')}`);
  });

  app.post('/ipd/consumable/:id/delete', requireAuth, requireIpdMutate, async (req, res) => {
    if (!isNurse(req,res)) return res.redirect('back?err=Permission denied.');
    const id = parseInt(req.params.id, 10) || 0;
    const row = await one('SELECT * FROM tbl_ipd_consumable_log WHERE id=? LIMIT 1', [id]);
    if (!row) return res.redirect('back?err=Item not found.');
    // Reverse the charge if it was billed.
    if (row.billed && row.charge_id) {
      await pool.query('DELETE FROM tbl_ipd_charge WHERE id=?', [row.charge_id]).catch(() => {});
      await pool.query(
        'UPDATE tbl_admission SET running_bill = GREATEST(0, COALESCE(running_bill,0) - ?) WHERE id=?',
        [row.total, row.admission_id]
      );
    }
    await pool.query('DELETE FROM tbl_ipd_consumable_log WHERE id=?', [id]);
    res.redirect(`/ipd/shift/${row.admission_id}?msg=Item+reversed`);
  });

  // ==========================================================
  //   4. SHIFT REPORT  (Nurse)
  // ==========================================================
  app.get('/ipd/shift/:admission_id', requireAuth, requireIpdView, async (req, res) => {
    const admission_id = parseInt(req.params.admission_id, 10) || 0;
    const reportParam = parseInt(req.query.report, 10) || 0;
    if (!admission_id) return res.redirect('/wards?err=Invalid admission');

    const admission = await loadAdmission(admission_id);
    if (!admission) return res.redirect('/wards?err=Admission not found');

    const uid = userId(req);
    let shift = null;

    if (reportParam) {
      shift = await one(
        `SELECT * FROM tbl_ipd_shift_report WHERE id=? AND admission_id=? LIMIT 1`,
        [reportParam, admission_id]
      );
      if (!shift) return res.redirect(`/ipd/shift/${admission_id}?err=` + encodeURIComponent('Shift report not found.'));
    } else {
      shift = await one(
        `SELECT * FROM tbl_ipd_shift_report
          WHERE admission_id=? AND nurse_id=? AND locked=0 AND shift_ended_at IS NULL
            AND (report_status IS NULL OR report_status = '' OR report_status = 'open')
          ORDER BY id DESC LIMIT 1`,
        [admission_id, uid]
      );
      if (!shift && isNurse(req, res)) {
        const hour = new Date().getHours();
        const label = hour < 14 ? 'Morning' : hour < 21 ? 'Evening' : 'Night';
        const [r] = await pool.query(
          `INSERT INTO tbl_ipd_shift_report
             (admission_id, patient_id, nurse_id, shift_label, report_status)
           VALUES (?,?,?,?, 'open')`,
          [admission_id, admission.patient_id, uid, label]
        );
        shift = await one('SELECT * FROM tbl_ipd_shift_report WHERE id=? LIMIT 1', [r.insertId]);
      }
    }

    const previous = await sq(`
      SELECT s.*,
             CONCAT(n.first_name,' ',n.last_name) AS nurse_name,
             CONCAT(nn.first_name,' ',nn.last_name) AS next_nurse_name
        FROM tbl_ipd_shift_report s
        LEFT JOIN tbl_employee n ON n.id = s.nurse_id
        LEFT JOIN tbl_employee nn ON nn.id = s.next_nurse_id
       WHERE s.admission_id = ?
       ORDER BY s.id DESC LIMIT 20
    `, [admission_id]);

    let nurseName = '';
    let nextNurseName = '';
    if (shift) {
      const nRow = await one(
        `SELECT CONCAT(first_name,' ',last_name) AS name FROM tbl_employee WHERE id=? LIMIT 1`,
        [shift.nurse_id]
      );
      nurseName = nRow?.name || '';
      if (shift.next_nurse_id) {
        const nnRow = await one(
          `SELECT CONCAT(first_name,' ',last_name) AS name FROM tbl_employee WHERE id=? LIMIT 1`,
          [shift.next_nurse_id]
        );
        nextNurseName = nnRow?.name || '';
      }
    }

    const shiftStart = shift?.shift_started_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const shiftEnd = shift?.shift_ended_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const doseActivity = await loadShiftDoseActivity(admission_id, shiftStart, shiftEnd);
    const activeTx = await activeTreatment(admission_id);
    const revisions = shift ? await loadShiftReportRevisions(shift.id) : [];

    let treatmentSummary = null;
    if (shift?.treatment_summary) {
      try {
        treatmentSummary = JSON.parse(shift.treatment_summary);
      } catch {
        treatmentSummary = null;
      }
    }

    const consumables = await sq(
      `SELECT c.*, CONCAT(n.first_name,' ',n.last_name) AS nurse_name
         FROM tbl_ipd_consumable_log c
         LEFT JOIN tbl_employee n ON n.id = c.logged_by
        WHERE c.admission_id = ?
          ${shift ? 'AND (c.shift_report_id = ? OR c.shift_report_id IS NULL)' : ''}
        ORDER BY c.logged_at DESC LIMIT 80`,
      shift ? [admission_id, shift.id] : [admission_id]
    );

    const catalog = await sq(
      `SELECT * FROM tbl_ipd_consumable_catalog WHERE is_active=1 ORDER BY category, name`
    );

    const nurses = await sq(
      `SELECT id, first_name, last_name FROM tbl_employee
        WHERE (role = '7' OR role = '8' OR role = 7 OR role = 8)
          AND (status IS NULL OR status = 1 OR status = 'active')
        ORDER BY first_name, last_name`
    );

    const revisionStrikes = shift ? await loadShiftReportRevisionStrikes(shift.id) : {};
    let canEdit = false;
    if (isNurse(req, res) && shift && shift.nurse_id === uid) {
      canEdit = true;
    }

    const viewingHistorical = !!(reportParam && shift && shiftReportIsSubmitted(shift));
    const shiftSubmitted = shiftReportIsSubmitted(shift);
    const showHandoverAndMessage = !!(shift && !shiftSubmitted && canEdit);
    const canRecall = !!(shift && shiftSubmitted && isNurse(req, res) && shift.nurse_id === uid);

    const { ipdPageData } = require('../lib/reactRouteHelpers');
    res.render('ipd-shift-report', {
      title: 'Nurse Shift Report - IPD',
      admission,
      ...ipdPageData('shift-report', {
        admission,
        shift,
        previous,
        consumables,
        catalog,
        nurses,
        canEdit,
        canRecall,
        userRole: userRole(req),
        viewerId: uid,
        ipdMessages: await loadAdmissionIpdMessages(admission_id),
        revisionStrikes,
        revisions,
        viewingHistorical,
        shiftSubmitted,
        showHandoverAndMessage,
        nurseName,
        nextNurseName,
        doseActivity,
        treatmentSummary,
        activeTreatment: activeTx,
        patientStatus: admission.ipd_status || 'admitted',
        title: 'Nurse shift handover',
      }),
    });
  });

  // GET /ipd/handover — ward-wide nurse handover board (all occupied beds)
  app.get('/ipd/handover', requireAuth, requireIpdView, async (req, res) => {
    const notDischarged = "(a.discharged_at IS NULL OR a.discharged_at = '0000-00-00 00:00:00' OR a.discharged_at = '0000-00-00')";
    const uid = userId(req);
    const rows = await sq(`
      SELECT a.id AS admission_id, a.patient_id, a.ipd_status, a.admitted_at,
             p.first_name, p.last_name,
             b.ward_name, b.bed_label,
             sr.id AS shift_report_id, sr.report_status, sr.shift_label,
             sr.shift_started_at, sr.shift_ended_at, sr.nurse_id,
             CONCAT(n.first_name,' ',n.last_name) AS nurse_name,
             (SELECT COUNT(*) FROM tbl_ipd_dose_slot d
                WHERE d.admission_id = a.id AND d.administered = 1
                  AND d.administered_at >= COALESCE(sr.shift_started_at, a.admitted_at)) AS doses_given
        FROM tbl_admission a
        JOIN tbl_patient p ON p.id = a.patient_id
        LEFT JOIN tbl_bed b ON b.id = a.bed_id
        LEFT JOIN tbl_ipd_shift_report sr ON sr.id = (
          SELECT s2.id FROM tbl_ipd_shift_report s2
           WHERE s2.admission_id = a.id
           ORDER BY s2.id DESC LIMIT 1
        )
        LEFT JOIN tbl_employee n ON n.id = sr.nurse_id
       WHERE ${notDischarged}
         AND a.bed_id IS NOT NULL AND a.bed_id <> 0
       ORDER BY b.ward_name, b.bed_label, a.id
       LIMIT 200
    `);

    const lastSubmitted = await sq(`
      SELECT s.*, CONCAT(n.first_name,' ',n.last_name) AS nurse_name,
             CONCAT(p.first_name,' ',p.last_name) AS patient_name,
             b.ward_name, b.bed_label
        FROM tbl_ipd_shift_report s
        JOIN tbl_admission a ON a.id = s.admission_id
        JOIN tbl_patient p ON p.id = a.patient_id
        LEFT JOIN tbl_bed b ON b.id = a.bed_id
        LEFT JOIN tbl_employee n ON n.id = s.nurse_id
       WHERE s.report_status = 'submitted' OR s.locked = 1
       ORDER BY s.shift_ended_at DESC, s.id DESC
       LIMIT 30
    `);

    const { ipdPageData } = require('../lib/reactRouteHelpers');
    res.render('ipd-handover', {
      title: 'Nurse Handover Board — IPD',
      ...ipdPageData('handover-board', {
        patients: rows.map((r) => ({
          ...r,
          patient_name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          is_mine: Number(r.nurse_id) === uid,
          submitted: shiftReportIsSubmitted(r),
        })),
        recentHandovers: lastSubmitted,
        viewerId: uid,
        isNurse: isNurse(req, res),
      }),
    });
  });

  // POST /ipd/shift-report/save  — autosave the 5 sections
  app.post('/ipd/shift-report/save', requireAuth, requireIpdMutate, async (req, res) => {
    const asJson = wantsJson(req);
    try {
      if (!isNurse(req, res)) {
        if (asJson) return res.status(403).json({ ok: false, error: 'Permission denied' });
        return res.redirect('/wards?err=Permission+denied');
      }
      const {
        shift_report_id, ward_rounds, done_notes,
        not_done_notes, pending_notes, free_notes,
      } = req.body;
      const id = parseInt(shift_report_id, 10) || 0;
      const row = await one('SELECT * FROM tbl_ipd_shift_report WHERE id=? LIMIT 1', [id]);
      if (!row) {
        if (asJson) return res.status(404).json({ ok: false, error: 'Report not found' });
        return res.redirect('/wards?err=Report+not+found');
      }
      const uid = userId(req);
      const authorAmend = shiftReportIsSubmitted(row) && isNurse(req, res) && row.nurse_id === uid;
      if (shiftReportIsSubmitted(row) && !authorAmend) {
        if (asJson) return res.status(409).json({ ok: false, error: 'Report is submitted' });
        return res.redirect(`/ipd/shift/${row.admission_id}?err=Report+is+submitted`);
      }
      if (!shiftReportIsSubmitted(row) && (!isNurse(req, res) || row.nurse_id !== uid)) {
        if (asJson) return res.status(403).json({ ok: false, error: 'Permission denied' });
        return res.redirect(`/ipd/shift/${row.admission_id}?err=Permission+denied`);
      }

      const nextFields = {
        ward_rounds: ward_rounds != null ? String(ward_rounds) : '',
        done_notes: done_notes != null ? String(done_notes) : '',
        not_done_notes: not_done_notes != null ? String(not_done_notes) : '',
        pending_notes: pending_notes != null ? String(pending_notes) : '',
        free_notes: free_notes != null ? String(free_notes) : '',
      };
      await recordShiftReportFieldChanges(req, id, row.admission_id, row.patient_id, row, nextFields);

      await pool.query(
        `UPDATE tbl_ipd_shift_report
            SET ward_rounds=?, done_notes=?, not_done_notes=?, pending_notes=?, free_notes=?
          WHERE id=?`,
        [
          nextFields.ward_rounds ? nextFields.ward_rounds : null,
          nextFields.done_notes ? nextFields.done_notes : null,
          nextFields.not_done_notes ? nextFields.not_done_notes : null,
          nextFields.pending_notes ? nextFields.pending_notes : null,
          nextFields.free_notes ? nextFields.free_notes : null,
          id,
        ]
      );
      const redir = authorAmend
        ? `/ipd/shift/${row.admission_id}?report=${id}&msg=` + encodeURIComponent('Corrections saved (audited).')
        : `/ipd/shift/${row.admission_id}?msg=Report+saved`;
      if (asJson) return res.json({ ok: true, saved_at: new Date().toISOString() });
      res.redirect(redir);
    } catch (err) {
      console.error('[ipdMed] shift-report/save failed:', err);
      if (asJson) return res.status(500).json({ ok: false, error: err.message || 'Server error' });
      res.redirect('/wards?err=' + encodeURIComponent('Save failed: ' + err.message));
    }
  });

  // POST /ipd/shift-report/handover  — close shift, lock, open next, notify doctor.
  app.post('/ipd/shift-report/handover', requireAuth, requireIpdMutate, async (req, res) => {
    if (!isNurse(req, res)) return res.redirect('back?err=Permission denied.');
    const {
      shift_report_id, next_nurse_id, handover_notes, patient_status, notify_doctor,
    } = req.body;
    const id = parseInt(shift_report_id, 10) || 0;
    const row = await one('SELECT * FROM tbl_ipd_shift_report WHERE id=? LIMIT 1', [id]);
    if (!row) return res.redirect('back?err=Report not found.');
    if (shiftReportIsSubmitted(row)) return res.redirect('back?err=Report already submitted.');
    if (row.nurse_id !== userId(req)) return res.redirect('back?err=Permission denied.');

    const shiftStart = row.shift_started_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const doseActivity = await loadShiftDoseActivity(row.admission_id, shiftStart, new Date().toISOString().slice(0, 19).replace('T', ' '));
    const treatmentSummary = JSON.stringify(buildTreatmentSummaryPayload(doseActivity));
    const pStatus = String(patient_status || '').trim().slice(0, 80) || null;

    await pool.query(
      `UPDATE tbl_ipd_shift_report
          SET shift_ended_at=NOW(), next_nurse_id=?, handover_notes=?, locked=1,
              report_status='submitted', patient_status=?, treatment_summary=?,
              recalled_at=NULL, recalled_by=NULL
        WHERE id=?`,
      [parseInt(next_nurse_id, 10) || null, handover_notes || null, pStatus, treatmentSummary, id]
    );
    await logIpdMedAudit(req, {
      admission_id: row.admission_id,
      patient_id: row.patient_id,
      treatment_id: null,
      prescription_id: null,
      action: 'shift_report_submitted',
      detail: {
        shift_report_id: id,
        next_nurse_id: parseInt(next_nurse_id, 10) || null,
        patient_status: pStatus,
        doses_administered: (doseActivity.administered || []).length,
      },
    });

    const shouldNotify = notify_doctor !== '0' && notify_doctor !== 'off' && notify_doctor !== 'false';
    if (shouldNotify) {
      const adm = await one(
        'SELECT patient_id, admitting_doctor_id FROM tbl_admission WHERE id=? LIMIT 1',
        [row.admission_id]
      );
      if (adm?.admitting_doctor_id) {
        const t = await activeTreatment(row.admission_id);
        const admLines = (doseActivity.administered || []).slice(0, 12).map(formatDoseLine).join('\n');
        const body = [
          `Nurse handover report submitted (Report #${id}).`,
          pStatus ? `Patient status: ${pStatus}` : null,
          handover_notes ? `Handover notes: ${String(handover_notes).slice(0, 500)}` : null,
          admLines ? `Treatments given:\n${admLines}` : 'No doses recorded this shift.',
          `View: /ipd/shift/${row.admission_id}?report=${id}`,
        ].filter(Boolean).join('\n\n');
        await pool.query(
          `INSERT INTO tbl_ipd_message
             (admission_id, treatment_id, patient_id, from_user_id, to_user_id, subject, body, source, source_id)
           VALUES (?,?,?,?,?, ?,?, 'shift_report', ?)`,
          [
            row.admission_id, t ? t.id : null, adm.patient_id, userId(req), adm.admitting_doctor_id,
            'Nurse shift handover report', body.slice(0, 8000), id,
          ]
        ).catch(() => {});
        await pool.query(
          `UPDATE tbl_ipd_shift_report SET submitted_to_doctor_at=NOW() WHERE id=?`,
          [id]
        ).catch(() => {});
        await logIpdMedAudit(req, {
          admission_id: row.admission_id,
          patient_id: row.patient_id,
          treatment_id: t ? t.id : null,
          prescription_id: null,
          action: 'shift_report_sent_to_doctor',
          detail: { shift_report_id: id, doctor_id: adm.admitting_doctor_id },
        });
      }
    }

    if (parseInt(next_nurse_id, 10) > 0) {
      const hour = new Date().getHours();
      const label = hour < 14 ? 'Morning' : hour < 21 ? 'Evening' : 'Night';
      await pool.query(
        `INSERT INTO tbl_ipd_shift_report
           (admission_id, patient_id, nurse_id, shift_label, report_status)
         VALUES (?,?,?,?,'open')`,
        [row.admission_id, row.patient_id, parseInt(next_nurse_id, 10), label]
      ).catch(() => {});
    }
    res.redirect(`/ipd/shift/${row.admission_id}?report=${id}&msg=` + encodeURIComponent('Handover submitted to incoming nurse and doctor.'));
  });

  // POST /ipd/shift-report/recall — original nurse reopens a submitted report for audited corrections.
  app.post('/ipd/shift-report/recall', requireAuth, requireIpdMutate, async (req, res) => {
    if (!isNurse(req, res)) return res.redirect('back?err=Permission denied.');
    const id = parseInt(req.body.shift_report_id, 10) || 0;
    const row = await one('SELECT * FROM tbl_ipd_shift_report WHERE id=? LIMIT 1', [id]);
    if (!row) return res.redirect('back?err=Report not found.');
    if (!shiftReportIsSubmitted(row)) return res.redirect('back?err=Report is not submitted.');
    if (row.nurse_id !== userId(req)) return res.redirect('back?err=Only the authoring nurse may recall this report.');

    await pool.query(
      `UPDATE tbl_ipd_shift_report
          SET locked=0, report_status='open', shift_ended_at=NULL,
              recalled_at=NOW(), recalled_by=?
        WHERE id=?`,
      [userId(req), id]
    );
    await logIpdMedAudit(req, {
      admission_id: row.admission_id,
      patient_id: row.patient_id,
      treatment_id: null,
      prescription_id: null,
      action: 'shift_report_recalled',
      detail: { shift_report_id: id, reason: String(req.body.reason || '').slice(0, 300) },
    });
    res.redirect(`/ipd/shift/${row.admission_id}?report=${id}&msg=` + encodeURIComponent('Report recalled for corrections. All edits are audited.'));
  });

  // POST /ipd/shift-report/message-doctor
  app.post('/ipd/shift-report/message-doctor', requireAuth, requireIpdMutate, async (req, res) => {
    const asJson = wantsJson(req);
    try {
      if (!isNurse(req, res)) {
        if (asJson) return res.status(403).json({ ok: false, error: 'Permission denied' });
        return res.redirect('/wards?err=Permission+denied');
      }
      const { shift_report_id, admission_id, subject, body } = req.body;
      const bodyText = (body || '').toString().trim();
      const aid = parseInt(admission_id, 10) || 0;
      const sid = parseInt(shift_report_id, 10) || null;
      if (!bodyText) {
        if (asJson) return res.status(400).json({ ok: false, error: 'Message body is required' });
        return res.redirect(`/ipd/shift/${aid}?err=` + encodeURIComponent('Message body is required.'));
      }
      const adm = await one(
        'SELECT patient_id, admitting_doctor_id FROM tbl_admission WHERE id=? LIMIT 1',
        [aid]
      );
      if (!adm) {
        if (asJson) return res.status(404).json({ ok: false, error: 'Admission not found' });
        return res.redirect('/wards?err=Admission+not+found');
      }
      if (!adm.admitting_doctor_id) {
        if (asJson) return res.status(400).json({ ok: false, error: 'No doctor assigned to this admission.' });
        return res.redirect(`/ipd/shift/${aid}?err=No+doctor+assigned`);
      }
      const t = await activeTreatment(aid);
      const [insMsg] = await pool.query(
        `INSERT INTO tbl_ipd_message
           (admission_id, treatment_id, patient_id, from_user_id, to_user_id,
            subject, body, source, source_id)
         VALUES (?,?,?,?,?, ?,?, 'shift_report', ?)`,
        [aid, t ? t.id : null, adm.patient_id, userId(req), adm.admitting_doctor_id,
          (subject || 'Shift update').slice(0, 200), bodyText, sid]
      );
      await logIpdMedAudit(req, {
        admission_id: aid,
        patient_id: adm.patient_id,
        treatment_id: t ? t.id : null,
        prescription_id: null,
        action: 'nurse_message_doctor',
        detail: { message_id: insMsg.insertId, subject: (subject || 'Shift update').slice(0, 200) },
      });
      if (asJson) return res.json({ ok: true });
      res.redirect(`/ipd/shift/${aid}?msg=Message+sent+to+doctor`);
    } catch (err) {
      console.error('[ipdMed] message-doctor failed:', err);
      if (asJson) return res.status(500).json({ ok: false, error: err.message || 'Server error' });
      res.redirect('/wards?err=' + encodeURIComponent('Message failed: ' + err.message));
    }
  });

  // ==========================================================
  //   5. AUDIT TRAIL
  // ==========================================================
  app.get('/ipd/audit/:admission_id', requireAuth, requireIpdView, async (req, res) => {
    const admission_id = parseInt(req.params.admission_id, 10) || 0;
    if (!admission_id) return res.redirect('/wards?err=Invalid admission');
    const admission = await loadAdmission(admission_id);
    if (!admission) return res.redirect('/wards?err=Admission not found');

    const treatments = await sq(`
      SELECT t.*, CONCAT(d.first_name,' ',d.last_name) AS doctor_name
        FROM tbl_ipd_treatment t
        LEFT JOIN tbl_employee d ON d.id = t.doctor_id
       WHERE t.admission_id = ?
       ORDER BY t.id DESC
    `, [admission_id]);

    const auditByTx = {};
    for (const t of treatments) {
      const prescriptions = await sq(`
        SELECT r.*,
               (SELECT COUNT(*) FROM tbl_ipd_dose_slot s
                 WHERE s.prescription_id = r.id) AS slots_total,
               (SELECT COUNT(*) FROM tbl_ipd_dose_slot s
                 WHERE s.prescription_id = r.id AND s.administered = 1) AS slots_given,
               (SELECT COUNT(*) FROM tbl_ipd_dose_slot s
                 WHERE s.prescription_id = r.id AND s.administered = 0) AS slots_missed
          FROM tbl_ipd_prescription r
         WHERE r.treatment_id = ?
         ORDER BY r.id ASC
      `, [t.id]);
      const slots = await sq(`
        SELECT s.*, r.drug_name, ${DOSE_EFFECTIVE_DOSAGE_SQL},
               CONCAT(n.first_name,' ',n.last_name) AS nurse_name
          FROM tbl_ipd_dose_slot s
          JOIN tbl_ipd_prescription r ON r.id = s.prescription_id
          LEFT JOIN tbl_employee n ON n.id = s.administered_by
         WHERE s.treatment_id = ?
         ORDER BY s.scheduled_at ASC
      `, [t.id]);
      auditByTx[t.id] = { prescriptions, slots };
    }

    const medAudit = await sq(`
      SELECT * FROM tbl_ipd_med_audit
       WHERE admission_id = ?
       ORDER BY id DESC
       LIMIT 200
    `, [admission_id]);

    const { ipdPageData } = require('../lib/reactRouteHelpers');
    res.render('ipd-audit', {
      title: 'Treatment Audit Trail - IPD',
      admission,
      ...ipdPageData('audit', {
        admission,
        treatments,
        auditByTx,
        medAudit: medAudit || [],
        title: 'Treatment audit trail',
        rows: (medAudit || []).map((m) => ({
          id: m.id,
          label: m.action || m.event_type || 'Event',
          value: m.detail || m.note || m.created_at,
        })),
        columns: [
          { key: 'label', label: 'Event' },
          { key: 'value', label: 'Detail' },
        ],
      }),
    });
  });

  // ==========================================================
  //   6. DISCHARGE  (Doctor)
  // ==========================================================
  app.get('/ipd/discharge/:admission_id', requireAuth, requireIpdView, async (req, res) => {
    const admission_id = parseInt(req.params.admission_id, 10) || 0;
    if (!admission_id) return res.redirect('/wards?err=Invalid admission');
    const admission = await loadAdmission(admission_id);
    if (!admission) return res.redirect('/wards?err=Admission not found');

    const treatments = await sq(
      `SELECT * FROM tbl_ipd_treatment WHERE admission_id=? ORDER BY id ASC`,
      [admission_id]
    );

    const charges = await sq(
      `SELECT * FROM tbl_ipd_charge WHERE admission_id=? ORDER BY id ASC`,
      [admission_id]
    );

    const totals = {
      charges: charges.reduce((s, c) => s + Number(c.amount || 0), 0),
      deposit: Number(admission.deposit_amount || 0),
    };
    totals.balance = totals.charges - totals.deposit;

    const { ipdPageData } = require('../lib/reactRouteHelpers');
    res.render('ipd-discharge', {
      title: 'Clinical Discharge - IPD',
      admission,
      ...ipdPageData('discharge', {
        admission,
        treatments,
        charges,
        totals,
        canDischarge: isDoctor(req,res),
        flash: req.query.msg || null,
        error: req.query.err || null,
      }),
    });
  });

  // POST /ipd/discharge/:admission_id  (Doctor signs clinical discharge)
  app.post('/ipd/discharge/:admission_id', requireAuth, requireIpdMutate, async (req, res) => {
    if (!isDoctor(req,res)) return res.redirect('back?err=Only a doctor can discharge.');
    const aid = parseInt(req.params.admission_id, 10) || 0;
    const adm = await one('SELECT * FROM tbl_admission WHERE id=? LIMIT 1', [aid]);
    if (!adm) return res.redirect('/wards?err=Admission not found.');

    const summary = (req.body.summary || '').toString().trim();
    if (!summary) {
      return res.redirect(`/ipd/discharge/${aid}?err=Discharge+summary+is+required`);
    }

    // Terminate any still-active treatment so no further Rx can be added.
    await pool.query(
      `UPDATE tbl_ipd_treatment
          SET status='discharged', terminated_at=NOW(), terminated_by=?,
              terminated_reason='Patient discharged'
        WHERE admission_id=? AND status='active'`,
      [userId(req), aid]
    );
    await pool.query(
      'UPDATE tbl_ipd_prescription SET locked=1 WHERE admission_id=?', [aid]
    );

    await pool.query(
      `UPDATE tbl_ipd_dose_slot s
         INNER JOIN tbl_ipd_treatment t ON t.id = s.treatment_id
         SET s.hidden_on_terminate = 1
       WHERE t.admission_id = ? AND t.status = 'discharged'
         AND s.administered = 0 AND s.hidden_on_terminate = 0`,
      [aid]
    ).catch(() => {});

    // Mark the admission as clinically discharged. The cashier finalises the
    // bill from /cashier/ipd-settle.
    await pool.query(
      `UPDATE tbl_admission
          SET clinical_discharged_at = NOW(),
              clinical_discharged_by = ?,
              clinical_discharge_summary = ?
        WHERE id = ?`,
      [userId(req), summary.slice(0, 8000), aid]
    ).catch(async () => {
      // Legacy schema — add the missing columns then retry.
      await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS clinical_discharged_at DATETIME NULL").catch(() => {});
      await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS clinical_discharged_by INT NULL").catch(() => {});
      await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS clinical_discharge_summary TEXT").catch(() => {});
      await pool.query(
        `UPDATE tbl_admission
            SET clinical_discharged_at = NOW(),
                clinical_discharged_by = ?,
                clinical_discharge_summary = ?
          WHERE id = ?`,
        [userId(req), summary.slice(0, 8000), aid]
      );
    });
    res.redirect(`/ipd/discharge/${aid}?msg=Clinical+discharge+complete`);
  });

  // ==========================================================
  //   IPD Inbox — doctors: messages from nurses; nurses: thread + doctor replies
  // ==========================================================
  app.get('/ipd/inbox', requireAuth, requireIpdView, async (req, res) => {
    const uid = userId(req);
    if (isDoctor(req, res)) {
      const messages = await sq(`
        SELECT m.*,
               CONCAT(p.first_name,' ',p.last_name) AS patient_name,
               CONCAT(s.first_name,' ',s.last_name) AS from_name,
               CONCAT(t.first_name,' ',t.last_name) AS to_name
          FROM tbl_ipd_message m
          LEFT JOIN tbl_patient  p ON p.id = m.patient_id
          LEFT JOIN tbl_employee s ON s.id = m.from_user_id
          LEFT JOIN tbl_employee t ON t.id = m.to_user_id
         WHERE m.to_user_id = ?
           AND (m.source IS NULL OR m.source <> 'doctor_reply')
         ORDER BY m.id DESC
         LIMIT 100
      `, [uid]);
      const { ipdPageData } = require('../lib/reactRouteHelpers');
      return res.render('ipd-inbox', {
        title: 'IPD Inbox - Messages from Nurses',
        ...ipdPageData('inbox', {
          messages,
          inboxMode: 'doctor',
          viewerId: uid,
          title: 'IPD inbox',
          rows: messages,
          columns: [
            { key: 'patient_name', label: 'Patient' },
            { key: 'from_name', label: 'From' },
            { key: 'body', label: 'Message' },
          ],
        }),
      });
    }
    if (isNurse(req, res)) {
      const messages = await sq(`
        SELECT m.*,
               CONCAT(p.first_name,' ',p.last_name) AS patient_name,
               CONCAT(s.first_name,' ',s.last_name) AS from_name,
               CONCAT(t.first_name,' ',t.last_name) AS to_name
          FROM tbl_ipd_message m
          LEFT JOIN tbl_patient  p ON p.id = m.patient_id
          LEFT JOIN tbl_employee s ON s.id = m.from_user_id
          LEFT JOIN tbl_employee t ON t.id = m.to_user_id
         WHERE (m.from_user_id = ? OR m.to_user_id = ?)
         ORDER BY m.sent_at DESC, m.id DESC
         LIMIT 150
      `, [uid, uid]);
      const { ipdPageData } = require('../lib/reactRouteHelpers');
      return res.render('ipd-inbox', {
        title: 'IPD messages & doctor replies',
        ...ipdPageData('inbox', {
          messages,
          inboxMode: 'nurse',
          viewerId: uid,
          title: 'IPD messages',
          rows: messages,
          columns: [
            { key: 'patient_name', label: 'Patient' },
            { key: 'from_name', label: 'From' },
            { key: 'body', label: 'Message' },
          ],
        }),
      });
    }
    return res.redirect('/dashboard?err=' + encodeURIComponent('IPD inbox requires nursing or doctor access.'));
  });

  app.post('/ipd/inbox/:id/read', requireAuth, requireIpdMutate, async (req, res) => {
    const asJson = wantsJson(req);
    try {
      const id = parseInt(req.params.id, 10) || 0;
      await pool.query(
        'UPDATE tbl_ipd_message SET read_at=NOW() WHERE id=? AND to_user_id=?',
        [id, userId(req)]
      );
      if (asJson) return res.json({ ok: true });
      res.redirect('/ipd/inbox');
    } catch (err) {
      console.error('[ipdMed] inbox-read failed:', err);
      if (asJson) return res.status(500).json({ ok: false, error: err.message || 'Server error' });
      res.redirect('/ipd/inbox');
    }
  });

  // POST /ipd/inbox/:id/reply  (Doctor → nurse; nurse sees on shift/chart thread)
  app.post('/ipd/inbox/:id/reply', requireAuth, requireIpdMutate, async (req, res) => {
    const asJson = wantsJson(req);
    try {
      if (!isDoctor(req, res)) {
        if (asJson) return res.status(403).json({ ok: false, error: 'Doctors only' });
        return res.redirect('/dashboard?err=Doctors+only');
      }
      const id = parseInt(req.params.id, 10) || 0;
      const bodyText = (req.body.body || '').toString().trim();
      if (!bodyText) {
        if (asJson) return res.status(400).json({ ok: false, error: 'Reply text is required' });
        return res.redirect('/ipd/inbox?err=' + encodeURIComponent('Reply text is required.'));
      }
      const m = await one(
        'SELECT * FROM tbl_ipd_message WHERE id=? AND to_user_id=? LIMIT 1',
        [id, userId(req)]
      );
      if (!m) {
        if (asJson) return res.status(404).json({ ok: false, error: 'Message not found' });
        return res.redirect('/ipd/inbox?err=Message+not+found');
      }
      const subj = ('Re: ' + (m.subject || 'IPD update')).slice(0, 200);
      const [ins] = await pool.query(
        `INSERT INTO tbl_ipd_message
           (admission_id, treatment_id, patient_id, from_user_id, to_user_id,
            subject, body, source, source_id)
         VALUES (?,?,?,?,?, ?,?, 'doctor_reply', ?)`,
        [
          m.admission_id, m.treatment_id, m.patient_id,
          userId(req), m.from_user_id,
          subj, bodyText, m.id,
        ]
      );
      await logIpdMedAudit(req, {
        admission_id: m.admission_id,
        patient_id: m.patient_id,
        treatment_id: m.treatment_id,
        prescription_id: null,
        action: 'doctor_reply_nurse',
        detail: { in_reply_to: m.id, message_id: ins.insertId, preview: bodyText.slice(0, 200) },
      });
      await pool.query(
        'UPDATE tbl_ipd_message SET read_at=COALESCE(read_at, NOW()) WHERE id=? AND to_user_id=?',
        [id, userId(req)]
      ).catch(() => {});
      if (asJson) return res.json({ ok: true, id: ins.insertId });
      res.redirect('/ipd/inbox?msg=' + encodeURIComponent('Reply sent to nurse'));
    } catch (err) {
      console.error('[ipdMed] inbox-reply failed:', err);
      if (asJson) return res.status(500).json({ ok: false, error: err.message || 'Server error' });
      res.redirect('/ipd/inbox?err=' + encodeURIComponent(err.message || 'Reply failed'));
    }
  });

  // ==========================================================
  //   JSON API for sidebar widget / dashboards
  // ==========================================================
  app.get('/api/ipd/admission/:id/summary', requireAuth, requireIpdView, async (req, res) => {
    const aid = parseInt(req.params.id, 10) || 0;
    const adm = await one('SELECT id, patient_id, running_bill, deposit_amount FROM tbl_admission WHERE id=? LIMIT 1', [aid]);
    if (!adm) return res.status(404).json({ ok: false });
    const due24 = await one(`
      SELECT COUNT(*) AS n FROM tbl_ipd_dose_slot s
       JOIN tbl_ipd_treatment t ON t.id = s.treatment_id
      WHERE s.admission_id = ?
        AND t.status='active'
        AND s.administered = 0
        AND s.scheduled_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 24 HOUR)`,
      [aid]
    );
    const overdue = await one(`
      SELECT COUNT(*) AS n FROM tbl_ipd_dose_slot s
       JOIN tbl_ipd_treatment t ON t.id = s.treatment_id
      WHERE s.admission_id = ?
        AND t.status='active'
        AND s.administered = 0
        AND s.scheduled_at < NOW()`,
      [aid]
    );
    res.json({
      ok: true,
      admission_id: aid,
      running_bill: Number(adm.running_bill || 0),
      deposit: Number(adm.deposit_amount || 0),
      due_24h: Number(due24 ? due24.n : 0),
      overdue: Number(overdue ? overdue.n : 0),
    });
  });

  // GET /api/ipd/admission/:id/messages
  app.get('/api/ipd/admission/:id/messages', requireAuth, requireIpdView, async (req, res) => {
    try {
      const aid = parseInt(req.params.id, 10) || 0;
      const msgs = await loadAdmissionIpdMessages(aid);
      res.json({ ok: true, messages: msgs });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/ipd/message/send
  app.post('/api/ipd/message/send', requireAuth, requireIpdMutate, async (req, res) => {
    try {
      const { admission_id, body, subject } = req.body;
      const aid = parseInt(admission_id, 10) || 0;
      const bodyText = (body || '').toString().trim();
      if (!aid || !bodyText) {
        return res.status(400).json({ ok: false, error: 'Admission ID and body are required' });
      }
      const adm = await one(
        'SELECT patient_id, admitting_doctor_id FROM tbl_admission WHERE id=? LIMIT 1',
        [aid]
      );
      if (!adm) {
        return res.status(404).json({ ok: false, error: 'Admission not found' });
      }
      if (!adm.admitting_doctor_id) {
        return res.status(400).json({ ok: false, error: 'No doctor assigned to this admission.' });
      }
      const t = await activeTreatment(aid);
      const [insMsg] = await pool.query(
        `INSERT INTO tbl_ipd_message
           (admission_id, treatment_id, patient_id, from_user_id, to_user_id,
            subject, body, source)
         VALUES (?,?,?,?,?, ?,?, 'board_message')`,
        [aid, t ? t.id : null, adm.patient_id, userId(req), adm.admitting_doctor_id,
          (subject || 'Patient Update').slice(0, 200), bodyText]
      );
      await logIpdMedAudit(req, {
        admission_id: aid,
        patient_id: adm.patient_id,
        treatment_id: t ? t.id : null,
        prescription_id: null,
        action: 'nurse_message_doctor',
        detail: { message_id: insMsg.insertId, subject: subject || 'Patient Update' },
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

};

