'use strict';

const { patientDisplayAgeYears } = require('./patientAge');

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(v, locale = 'en-GB') {
  const d = toDate(v);
  if (!d) return '—';
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(v, locale = 'en-GB') {
  const d = toDate(v);
  if (!d) return '—';
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pushEvent(events, row) {
  if (!row || !row.date) return;
  events.push(row);
}

function sortChrono(rows) {
  return (rows || []).sort((a, b) => {
    const da = toDate(a.date)?.getTime() || 0;
    const db = toDate(b.date)?.getTime() || 0;
    return da - db;
  });
}

function formatOpdRxLine(pl) {
  if (!pl || pl.line_type !== 'medication') return '';
  const name = String(pl.medication_name || '').trim();
  if (!name) return '';
  const bits = [pl.medication_dose, pl.medication_route, pl.medication_frequency, pl.duration_days ? `${pl.duration_days}d` : null, pl.instructions]
    .filter((x) => x != null && String(x).trim())
    .map(String);
  return bits.length ? `${name} — ${bits.join(', ')}` : name;
}

function formatIpdRxLine(rx) {
  const name = String(rx.drug_name || '').trim();
  if (!name) return '';
  const bits = [rx.dosage, rx.route, rx.frequency_label, rx.duration_days ? `${rx.duration_days}d` : null, rx.notes]
    .filter((x) => x != null && String(x).trim())
    .map(String);
  return bits.length ? `${name} — ${bits.join(', ')}` : name;
}

function parseConsultMeds(json) {
  try {
    const arr = JSON.parse(json || '[]');
    if (!Array.isArray(arr)) return '';
    return arr
      .map((m) => {
        if (!m || typeof m !== 'object') return '';
        const name = String(m.name || '').trim();
        const bits = [m.dosage, m.frequency, m.duration].filter(Boolean).map(String);
        return name ? `${name}${bits.length ? ` (${bits.join(', ')})` : ''}` : '';
      })
      .filter(Boolean)
      .join('; ');
  } catch {
    return '';
  }
}

function labPreview(row) {
  if (row.conclusion) return String(row.conclusion).slice(0, 400);
  if (row.result_text) return String(row.result_text).slice(0, 400);
  if (row.notes) return String(row.notes).slice(0, 400);
  try {
    const s = typeof row.structured_result === 'string' ? JSON.parse(row.structured_result) : row.structured_result;
    if (s?.conclusion) return String(s.conclusion).slice(0, 400);
  } catch {
    /* ignore */
  }
  return row.status ? `Status: ${row.status}` : '';
}

function radPreview(row) {
  const bits = [row.conclusion, row.findings, row.notes].filter((x) => x && String(x).trim());
  return bits.join(' · ').slice(0, 400);
}

/**
 * Build chronological medical passport payload for a patient.
 */
async function buildPatientMedicalPassport(pool, patientId, opts = {}) {
  const pid = parseInt(patientId, 10) || 0;
  if (pid < 1) throw new Error('Invalid patient');

  const [[patient]] = await pool.query('SELECT * FROM tbl_patient WHERE id = ? LIMIT 1', [pid]);
  if (!patient) throw new Error('Patient not found');

  patient.calculated_age_years = patientDisplayAgeYears(patient);

  const [allergies] = await pool.query(
    'SELECT * FROM tbl_patient_allergy WHERE patient_id = ? ORDER BY id DESC LIMIT 30',
    [pid]
  ).catch(() => [[]]);

  const [medications] = await pool.query(
    'SELECT * FROM tbl_patient_medication WHERE patient_id = ? ORDER BY id DESC LIMIT 30',
    [pid]
  ).catch(() => [[]]);

  const [[insurance]] = await pool.query(
    `SELECT pi.*, ic.name AS carrier_name
       FROM tbl_patient_insurance pi
       JOIN tbl_insurance_carrier ic ON ic.id = pi.carrier_id
      WHERE pi.patient_id = ? AND pi.is_primary = 1
      LIMIT 1`,
    [pid]
  ).catch(() => [[null]]);

  const events = [];
  const diagnosisSummary = [];
  const prescriptionSummary = [];
  const treatmentSummary = [];

  const [consultations] = await pool.query(
    `SELECT c.id, c.opd_visit_id, c.created_at, c.chief_complaint, c.diagnosis, c.assessment, c.plan,
            c.medications_json, COALESCE(NULLIF(TRIM(v.department), ''), 'OPD') AS department,
            CONCAT(doc.first_name,' ',doc.last_name) AS doctor_name
       FROM tbl_consultation c
       LEFT JOIN tbl_opd_visit v ON v.id = c.opd_visit_id
       LEFT JOIN tbl_employee doc ON doc.id = COALESCE(v.assigned_doctor_id, c.created_by)
      WHERE c.patient_id = ?
      ORDER BY c.created_at ASC`,
    [pid]
  ).catch(() => [[]]);

  for (const c of consultations || []) {
    const meds = parseConsultMeds(c.medications_json);
    const parts = [c.chief_complaint, c.diagnosis, c.assessment, c.plan].filter((x) => x && String(x).trim());

    if (c.diagnosis && String(c.diagnosis).trim()) {
      pushEvent(diagnosisSummary, {
        id: `dx-consult-${c.id}`,
        date: c.created_at,
        title: String(c.diagnosis).trim(),
        detail: [c.assessment, c.plan].filter((x) => x && String(x).trim()).join(' · '),
        source: 'OPD',
        context: c.chief_complaint || c.department || 'Consultation',
        provider: c.doctor_name || '',
      });
    } else if (c.assessment && String(c.assessment).trim()) {
      pushEvent(diagnosisSummary, {
        id: `dx-assess-${c.id}`,
        date: c.created_at,
        title: String(c.assessment).trim(),
        detail: c.plan || '',
        source: 'OPD',
        context: c.chief_complaint || c.department || 'Consultation',
        provider: c.doctor_name || '',
      });
    }

    if (meds) {
      pushEvent(prescriptionSummary, {
        id: `rx-consult-${c.id}`,
        date: c.created_at,
        title: c.diagnosis || c.chief_complaint || 'Consultation prescription',
        detail: meds,
        source: 'OPD',
        context: c.department || 'Consultation',
        provider: c.doctor_name || '',
      });
    }

    if (c.plan && String(c.plan).trim()) {
      pushEvent(treatmentSummary, {
        id: `tx-plan-${c.id}`,
        date: c.created_at,
        title: c.diagnosis || c.chief_complaint || 'Treatment plan',
        detail: String(c.plan).trim() + (meds ? `\n${meds}` : ''),
        source: 'OPD',
        context: c.department || 'Outpatient',
        provider: c.doctor_name || '',
        status: 'completed',
      });
    }

    pushEvent(events, {
      id: `consult-${c.id}`,
      type: 'consultation',
      date: c.created_at,
      title: c.diagnosis || c.chief_complaint || 'Consultation',
      subtitle: c.department || 'OPD',
      detail: parts.join(' · ') + (meds ? `\nMedications: ${meds}` : ''),
      provider: c.doctor_name || '',
      department: c.department || 'OPD',
      status: 'completed',
    });
  }

  const [admissions] = await pool.query(
    `SELECT a.id, a.admitted_at, a.discharged_at, a.admitting_diagnosis, a.discharge_summary,
            a.ipd_status, a.admitting_department,
            b.ward_name, b.bed_label,
            CONCAT(doc.first_name,' ',doc.last_name) AS doctor_name
       FROM tbl_admission a
       LEFT JOIN tbl_bed b ON b.id = a.bed_id
       LEFT JOIN tbl_employee doc ON doc.id = a.admitting_doctor_id
      WHERE a.patient_id = ?
      ORDER BY a.admitted_at ASC`,
    [pid]
  ).catch(() => [[]]);

  for (const a of admissions || []) {
    if (a.admitting_diagnosis && String(a.admitting_diagnosis).trim()) {
      pushEvent(diagnosisSummary, {
        id: `dx-adm-${a.id}`,
        date: a.admitted_at,
        title: String(a.admitting_diagnosis).trim(),
        detail: '',
        source: 'IPD',
        context: [a.ward_name, a.bed_label, a.admitting_department].filter(Boolean).join(' · ') || 'Admission',
        provider: a.doctor_name || '',
      });
    }
    pushEvent(events, {
      id: `adm-${a.id}`,
      type: 'admission',
      date: a.admitted_at,
      title: `Hospital admission — ${a.admitting_diagnosis || a.admitting_department || 'IPD'}`,
      subtitle: [a.ward_name, a.bed_label].filter(Boolean).join(' · ') || 'IPD',
      detail: a.admitting_diagnosis || '',
      provider: a.doctor_name || '',
      department: a.admitting_department || 'IPD',
      status: a.ipd_status || 'admitted',
    });
    if (a.discharged_at) {
      if (a.discharge_summary && String(a.discharge_summary).trim()) {
        pushEvent(diagnosisSummary, {
          id: `dx-dc-${a.id}`,
          date: a.discharged_at,
          title: 'Discharge summary',
          detail: String(a.discharge_summary).trim(),
          source: 'IPD',
          context: [a.ward_name, a.bed_label].filter(Boolean).join(' · ') || 'Discharge',
          provider: a.doctor_name || '',
        });
      }
      pushEvent(events, {
        id: `dc-${a.id}`,
        type: 'discharge',
        date: a.discharged_at,
        title: 'Hospital discharge',
        subtitle: [a.ward_name, a.bed_label].filter(Boolean).join(' · '),
        detail: a.discharge_summary || '',
        provider: a.doctor_name || '',
        department: a.admitting_department || 'IPD',
        status: 'discharged',
      });
    }
  }

  const [problems] = await pool.query(
    'SELECT * FROM tbl_problem WHERE patient_id = ? ORDER BY recorded_at ASC',
    [pid]
  ).catch(() => [[]]);

  for (const p of problems || []) {
    if (!p.description || !String(p.description).trim()) continue;
    pushEvent(diagnosisSummary, {
      id: `dx-prob-${p.id}`,
      date: p.recorded_at,
      title: String(p.description).trim(),
      detail: p.icd_code ? `ICD: ${p.icd_code}` : '',
      source: 'Problem list',
      context: p.status || 'active',
      provider: '',
    });
  }

  const [ipdTreatments] = await pool.query(
    `SELECT t.*, b.ward_name, b.bed_label, a.admitting_department,
            CONCAT(doc.first_name,' ',doc.last_name) AS doctor_name
       FROM tbl_ipd_treatment t
       LEFT JOIN tbl_admission a ON a.id = t.admission_id
       LEFT JOIN tbl_bed b ON b.id = a.bed_id
       LEFT JOIN tbl_employee doc ON doc.id = t.doctor_id
      WHERE t.patient_id = ?
      ORDER BY COALESCE(t.start_date, t.created_at) ASC, t.id ASC`,
    [pid]
  ).catch(() => [[]]);

  const treatmentIds = (ipdTreatments || []).map((t) => t.id);
  let ipdRxByTreatment = {};
  if (treatmentIds.length) {
    const [ipdRxRows] = await pool.query(
      `SELECT * FROM tbl_ipd_prescription WHERE treatment_id IN (${treatmentIds.map(() => '?').join(',')}) ORDER BY id ASC`,
      treatmentIds
    ).catch(() => [[]]);
    for (const rx of ipdRxRows || []) {
      if (!ipdRxByTreatment[rx.treatment_id]) ipdRxByTreatment[rx.treatment_id] = [];
      ipdRxByTreatment[rx.treatment_id].push(rx);
    }
  }

  for (const t of ipdTreatments || []) {
    const wardCtx = [t.ward_name, t.bed_label, t.admitting_department].filter(Boolean).join(' · ') || 'IPD';
    const rxLines = (ipdRxByTreatment[t.id] || []).map(formatIpdRxLine).filter(Boolean);

    pushEvent(diagnosisSummary, {
      id: `dx-ipd-${t.id}`,
      date: t.start_date || t.created_at,
      title: String(t.diagnosis || '').trim() || 'IPD diagnosis',
      detail: t.notes || '',
      source: 'IPD',
      context: wardCtx,
      provider: t.doctor_name || '',
    });

    if (rxLines.length) {
      pushEvent(prescriptionSummary, {
        id: `rx-ipd-${t.id}`,
        date: t.start_date || t.created_at,
        title: t.diagnosis || 'IPD prescription',
        detail: rxLines.join('\n'),
        source: 'IPD',
        context: wardCtx,
        provider: t.doctor_name || '',
      });
    }

    pushEvent(treatmentSummary, {
      id: `tx-ipd-${t.id}`,
      date: t.start_date || t.created_at,
      title: t.diagnosis || 'In-patient treatment',
      detail: [
        rxLines.length ? rxLines.join('; ') : '',
        t.notes || '',
        t.est_duration_days ? `Estimated duration: ${t.est_duration_days} days` : '',
        t.terminated_reason ? `Stopped: ${t.terminated_reason}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      source: 'IPD',
      context: wardCtx,
      provider: t.doctor_name || '',
      status: t.status || 'active',
      endDate: t.terminated_at || null,
    });
  }

  const [labRows] = await pool.query(
    `SELECT lr.*, CONCAT(ref.first_name,' ',ref.last_name) AS referrer_name
       FROM tbl_lab_result lr
       LEFT JOIN tbl_employee ref ON ref.id = lr.referred_by_id
      WHERE lr.patient_id = ?
      ORDER BY COALESCE(lr.result_date, lr.created_at) ASC, lr.id ASC`,
    [pid]
  ).catch(() => [[]]);

  for (const l of labRows || []) {
    pushEvent(events, {
      id: `lab-${l.id}`,
      type: 'laboratory',
      date: l.result_date || l.created_at,
      title: l.test_name || 'Laboratory test',
      subtitle: l.status || 'result',
      detail: labPreview(l),
      provider: l.referrer_name || '',
      department: 'Laboratory',
      status: l.status || '',
    });
  }

  const [radRows] = await pool.query(
    `SELECT rr.*, CONCAT(ref.first_name,' ',ref.last_name) AS referrer_name
       FROM tbl_radiology_result rr
       LEFT JOIN tbl_employee ref ON ref.id = rr.referred_by_id
      WHERE rr.patient_id = ?
      ORDER BY COALESCE(rr.exam_date, rr.created_at) ASC, rr.id ASC`,
    [pid]
  ).catch(() => [[]]);

  for (const r of radRows || []) {
    pushEvent(events, {
      id: `rad-${r.id}`,
      type: 'radiology',
      date: r.exam_date || r.created_at,
      title: r.exam_name || r.test_name || r.scan_type || 'Imaging',
      subtitle: r.status || 'report',
      detail: radPreview(r),
      provider: r.referrer_name || '',
      department: 'Radiology',
      status: r.status || '',
    });
  }

  const [rxRows] = await pool.query(
    `SELECT p.*, CONCAT(doc.first_name,' ',doc.last_name) AS doctor_name
       FROM tbl_prescription p
       LEFT JOIN tbl_employee doc ON doc.id = p.prescriber_employee_id
      WHERE p.patient_id = ?
      ORDER BY p.created_at ASC`,
    [pid]
  ).catch(() => [[]]);

  const rxIds = (rxRows || []).map((r) => r.id);
  let linesByRx = {};
  if (rxIds.length) {
    const [rxLines] = await pool.query(
      `SELECT pl.*, lc.name AS lab_name
         FROM tbl_prescription_line pl
         LEFT JOIN tbl_lab_catalog lc ON lc.id = pl.lab_catalog_id
        WHERE pl.prescription_id IN (${rxIds.map(() => '?').join(',')})
        ORDER BY pl.sort_order ASC, pl.id ASC`,
      rxIds
    ).catch(() => [[]]);
    for (const pl of rxLines || []) {
      if (!linesByRx[pl.prescription_id]) linesByRx[pl.prescription_id] = [];
      linesByRx[pl.prescription_id].push(pl);
    }
  }

  for (const rx of rxRows || []) {
    const lines = linesByRx[rx.id] || [];
    const medLines = lines.map(formatOpdRxLine).filter(Boolean);
    const labLines = lines
      .filter((pl) => pl.line_type === 'lab')
      .map((pl) => pl.lab_name || 'Lab test')
      .filter(Boolean);
    const detailParts = [...medLines, ...labLines];
    const detail = detailParts.length ? detailParts.join('\n') : rx.notes || '';

    if (detail) {
      pushEvent(prescriptionSummary, {
        id: `rx-opd-${rx.id}`,
        date: rx.created_at,
        title: rx.title || 'Prescription',
        detail,
        source: 'OPD',
        context: rx.status || 'pharmacy',
        provider: rx.doctor_name || '',
      });
    }

    pushEvent(events, {
      id: `rx-${rx.id}`,
      type: 'prescription',
      date: rx.created_at,
      title: rx.title || 'Prescription',
      subtitle: rx.status || 'pharmacy',
      detail,
      provider: rx.doctor_name || '',
      department: 'Pharmacy',
      status: rx.status || '',
    });
  }

  await require('./ensureVitalSignSchema').ensureVitalSignColumns(pool).catch(() => {});
  const [vitals] = await pool.query(
    `SELECT vs.*, CONCAT(rec.first_name,' ',rec.last_name) AS recorded_by_name
       FROM tbl_vital_sign vs
       LEFT JOIN tbl_employee rec ON rec.id = COALESCE(vs.recorded_by, vs.created_by)
      WHERE vs.patient_id = ?
      ORDER BY COALESCE(vs.recorded_at, vs.created_at) ASC
      LIMIT 40`,
    [pid]
  ).catch(() => [[]]);

  for (const v of vitals || []) {
    const bits = [];
    if (v.bp_systolic || v.bp_diastolic) bits.push(`BP ${v.bp_systolic || '—'}/${v.bp_diastolic || '—'}`);
    if (v.pulse) bits.push(`Pulse ${v.pulse}`);
    if (v.temperature) bits.push(`Temp ${v.temperature}°C`);
    if (v.spo2) bits.push(`SpO₂ ${v.spo2}%`);
    if (v.respiratory_rate) bits.push(`RR ${v.respiratory_rate}`);
    pushEvent(events, {
      id: `vit-${v.id}`,
      type: 'vitals',
      date: v.recorded_at || v.created_at,
      title: 'Vital signs',
      subtitle: bits.join(' · ') || 'Recorded',
      detail: v.notes || '',
      provider: v.recorded_by_name || '',
      department: 'Nursing',
      status: 'recorded',
    });
  }

  events.sort((a, b) => {
    const da = toDate(a.date)?.getTime() || 0;
    const db = toDate(b.date)?.getTime() || 0;
    return da - db;
  });

  const hmsBrand = require('./hmsBrand');
  const issuedAt = new Date();
  const passportId = `MP-${String(pid).padStart(6, '0')}-${issuedAt.toISOString().slice(0, 10).replace(/-/g, '')}`;

  return {
    patient: {
      id: patient.id,
      patient_code: patient.patient_code || `PT-${patient.id}`,
      first_name: patient.first_name,
      last_name: patient.last_name,
      gender: patient.gender,
      date_of_birth: patient.date_of_birth,
      age_years: patient.calculated_age_years,
      phone: patient.phone,
      blood_group: patient.blood_group || patient.blood_type || null,
      address: patient.address || patient.residential_address || null,
      next_of_kin_name: patient.next_of_kin_name,
      next_of_kin_phone: patient.next_of_kin_phone,
    },
    allergies: (allergies || []).map((a) => ({
      substance: a.allergen || a.substance || a.name,
      severity: a.severity,
      reaction: a.reaction || a.notes,
    })),
    chronicMedications: (medications || []).map((m) => ({
      name: m.medication_name || m.name,
      dosage: m.dosage,
      notes: m.notes,
    })),
    insurance: insurance
      ? { carrier: insurance.carrier_name, policy: insurance.policy_number, member_id: insurance.member_id }
      : null,
    timeline: events,
    diagnosisSummary: sortChrono(diagnosisSummary),
    prescriptionSummary: sortChrono(prescriptionSummary),
    treatmentSummary: sortChrono(treatmentSummary),
    meta: {
      passport_id: passportId,
      issued_at: issuedAt.toISOString(),
      facility_name: opts.facilityName || hmsBrand.facilityName || hmsBrand.name,
      facility_legal: hmsBrand.legalName || hmsBrand.orgName,
      letterhead: hmsBrand.letterheadPath,
      issued_by_label: opts.issuedBy || hmsBrand.facilityName,
      locale: opts.locale || 'en',
      fmtDate: (v) => fmtDate(v, opts.locale === 'fr' ? 'fr-FR' : 'en-GB'),
      fmtDateTime: (v) => fmtDateTime(v, opts.locale === 'fr' ? 'fr-FR' : 'en-GB'),
    },
  };
}

module.exports = {
  buildPatientMedicalPassport,
  fmtDate,
  fmtDateTime,
};
