'use strict';

const SOURCE_MODULES = ['ipd', 'er', 'opd', 'maternity'];

function normDate(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function normTime(t) {
  if (!t) return null;
  const s = String(t).trim();
  if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 8);
  return null;
}

/**
 * Active clinical doctors — same source as OPD/appointments doctor pickers.
 * @param {import('mysql2/promise').Pool} pool
 */
async function loadCertifyingDoctors(pool) {
  const {
    fetchActiveDoctors,
    doctorEmployeeWhereSql,
    doctorEmployeeWhereParams,
  } = require('./hmsDoctorStaff');

  let rows = await fetchActiveDoctors(pool);

  if (!rows.length) {
    const where = doctorEmployeeWhereSql();
    const params = doctorEmployeeWhereParams();
    const [r2] = await pool
      .query(
        `SELECT e.id, e.first_name, e.last_name, e.primary_department, e.specialisation
         FROM tbl_employee e
         LEFT JOIN tbl_role r ON CAST(r.role AS UNSIGNED) = CAST(e.role AS UNSIGNED)
         WHERE ${where}
         ORDER BY e.last_name, e.first_name
         LIMIT 300`,
        params
      )
      .catch(() => [[]]);
    rows = r2 || [];
  }

  if (!rows.length) {
    const [r3] = await pool
      .query(
        `SELECT DISTINCT e.id, e.first_name, e.last_name, e.primary_department, e.specialisation
         FROM tbl_employee e
         LEFT JOIN tbl_role r ON CAST(r.role AS UNSIGNED) = CAST(e.role AS UNSIGNED)
         LEFT JOIN tbl_employee_doctor_specialisation ds ON ds.employee_id = e.id
         WHERE e.status = 1
           AND CAST(e.role AS UNSIGNED) NOT IN (1, 99)
           AND (
             r.title REGEXP 'Doctor|Physician|M[eé]decin|Specialist|Sp[eé]cialiste'
             OR ds.id IS NOT NULL
           )
         ORDER BY e.last_name, e.first_name
         LIMIT 300`
      )
      .catch(() => [[]]);
    rows = r3 || [];
  }

  return (rows || []).map((r) => ({
    id: r.id,
    first_name: r.first_name,
    last_name: r.last_name,
    specialisation: r.specialisation || null,
    primary_department: r.primary_department || null,
    job_title: (r.specialisation || r.primary_department || '').trim() || null,
  }));
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
async function loadDeathStats(pool) {
  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const [[tot]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_death_registry').catch(() => [[{ c: 0 }]]);
  const [[month]] = await pool
    .query('SELECT COUNT(*) AS c FROM tbl_death_registry WHERE date_of_death >= ?', [monthStart])
    .catch(() => [[{ c: 0 }]]);
  const [byMod] = await pool
    .query(
      `SELECT source_module, COUNT(*) AS c FROM tbl_death_registry GROUP BY source_module`
    )
    .catch(() => [[]]);
  const modMap = { ipd: 0, er: 0, opd: 0, maternity: 0 };
  for (const r of byMod || []) modMap[r.source_module] = parseInt(r.c, 10) || 0;
  return {
    total: parseInt(tot?.c, 10) || 0,
    this_month: parseInt(month?.c, 10) || 0,
    by_module: modMap,
  };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
async function listDeathRecords(pool, limit = 200) {
  const [rows] = await pool.query(
    `SELECT d.*,
            p.first_name, p.last_name, p.patient_code,
            doc.first_name AS cert_fn, doc.last_name AS cert_ln,
            rep.first_name AS rep_fn, rep.last_name AS rep_ln,
            b.ward_name, b.bed_label,
            v.queue_status AS visit_status,
            mp.antenatal_number
     FROM tbl_death_registry d
     JOIN tbl_patient p ON p.id = d.patient_id
     LEFT JOIN tbl_employee doc ON doc.id = d.certifying_doctor_id
     LEFT JOIN tbl_employee rep ON rep.id = d.reported_by
     LEFT JOIN tbl_admission a ON a.id = d.admission_id
     LEFT JOIN tbl_bed b ON b.id = a.bed_id
     LEFT JOIN tbl_opd_visit v ON v.id = d.visit_id
     LEFT JOIN maternity_patients mp ON mp.id = d.maternity_patient_id
     ORDER BY d.date_of_death DESC, d.id DESC
     LIMIT ?`,
    [limit]
  );
  return (rows || []).map((r) => ({
    ...r,
    patient_name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
    certifying_doctor: [r.cert_fn, r.cert_ln].filter(Boolean).join(' ') || null,
    reported_by_name: [r.rep_fn, r.rep_ln].filter(Boolean).join(' ') || null,
  }));
}

/**
 * Pending cases eligible for death registration.
 * @param {import('mysql2/promise').Pool} pool
 */
async function loadPendingCases(pool) {
  const ipdHosp = require('./ipdHospitalization');
  const nd = ipdHosp.NOT_DISCHARGED;

  const [ipd] = await pool.query(
    `SELECT a.id AS admission_id, a.patient_id, p.first_name, p.last_name,
            b.ward_name, b.bed_label, 'ipd' AS source_module
     FROM tbl_admission a
     JOIN tbl_patient p ON p.id = a.patient_id
     LEFT JOIN tbl_bed b ON b.id = a.bed_id
     WHERE ${nd}
       AND COALESCE(p.is_deceased, 0) = 0
       AND NOT EXISTS (SELECT 1 FROM tbl_death_registry dr WHERE dr.admission_id = a.id)
     ORDER BY a.id DESC LIMIT 80`
  ).catch(() => [[]]);

  const [er] = await pool.query(
    `SELECT v.id AS visit_id, v.patient_id, p.first_name, p.last_name,
            v.er_status, v.queue_status, 'er' AS source_module
     FROM tbl_opd_visit v
     JOIN tbl_patient p ON p.id = v.patient_id
     WHERE v.is_emergency = 1
       AND COALESCE(v.queue_status, '') NOT IN ('completed','lwbs')
       AND COALESCE(p.is_deceased, 0) = 0
       AND NOT EXISTS (SELECT 1 FROM tbl_death_registry dr WHERE dr.visit_id = v.id)
     ORDER BY v.id DESC LIMIT 80`
  ).catch(() => [[]]);

  const [opd] = await pool.query(
    `SELECT v.id AS visit_id, v.patient_id, p.first_name, p.last_name,
            v.queue_status, 'opd' AS source_module
     FROM tbl_opd_visit v
     JOIN tbl_patient p ON p.id = v.patient_id
     WHERE COALESCE(v.is_emergency, 0) = 0
       AND COALESCE(v.queue_status, '') IN ('waiting_doctor','in_consultation','triaged','registered','clinical_discharged')
       AND COALESCE(p.is_deceased, 0) = 0
       AND NOT EXISTS (SELECT 1 FROM tbl_death_registry dr WHERE dr.visit_id = v.id)
     ORDER BY v.id DESC LIMIT 80`
  ).catch(() => [[]]);

  const [maternity] = await pool.query(
    `SELECT mp.id AS maternity_patient_id, mp.patient_id, p.first_name, p.last_name,
            mp.antenatal_number, mp.status, 'maternity' AS source_module
     FROM maternity_patients mp
     JOIN tbl_patient p ON p.id = mp.patient_id
     WHERE mp.status IN ('active','delivered')
       AND COALESCE(p.is_deceased, 0) = 0
       AND NOT EXISTS (
         SELECT 1 FROM tbl_death_registry dr WHERE dr.maternity_patient_id = mp.id
       )
     ORDER BY mp.id DESC LIMIT 80`
  ).catch(() => [[]]);

  const label = (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim();

  return {
    ipd: (ipd || []).map((r) => ({ ...r, label: label(r), context: [r.ward_name, r.bed_label].filter(Boolean).join(' · ') })),
    er: (er || []).map((r) => ({ ...r, label: label(r), context: `ER #${r.visit_id}` })),
    opd: (opd || []).map((r) => ({ ...r, label: label(r), context: `OPD #${r.visit_id}` })),
    maternity: (maternity || []).map((r) => ({
      ...r,
      label: label(r),
      context: r.antenatal_number ? `ANC ${r.antenatal_number}` : `Maternity #${r.maternity_patient_id}`,
    })),
  };
}

async function applyIpdSideEffects(conn, admissionId) {
  const [[adm]] = await conn.query(
    `SELECT id, bed_id FROM tbl_admission WHERE id = ? LIMIT 1`,
    [admissionId]
  );
  if (!adm) return;
  await conn.query(
    `UPDATE tbl_admission SET discharge_outcome='deceased', ipd_status='clinical_discharged',
     clinical_discharged_at=COALESCE(clinical_discharged_at, NOW())
     WHERE id=?`,
    [admissionId]
  );
  if (adm.bed_id) {
    await conn.query("UPDATE tbl_bed SET status='housekeeping' WHERE id=?", [adm.bed_id]);
  }
}

async function applyErSideEffects(conn, visitId, userId, summary) {
  await conn.query(
    `UPDATE tbl_opd_visit
     SET queue_status='completed', er_status='completed', disposition_at=NOW(),
         completed_at=NOW(), treatment_note=COALESCE(NULLIF(?, ''), treatment_note)
     WHERE id=?`,
    [summary || '', visitId]
  );
  await conn.query('UPDATE tbl_er_bed SET current_visit_id=NULL WHERE current_visit_id=?', [visitId]).catch(
    () => {}
  );
  const existing = await conn
    .query('SELECT id FROM tbl_er_disposition WHERE visit_id=? LIMIT 1', [visitId])
    .then(([r]) => r[0])
    .catch(() => null);
  if (existing?.id) {
    await conn.query(
      `UPDATE tbl_er_disposition SET pathway='deceased', summary=COALESCE(?, summary),
       decided_by=?, decided_at=NOW() WHERE id=?`,
      [summary || null, userId, existing.id]
    );
  } else {
    await conn.query(
      `INSERT INTO tbl_er_disposition (visit_id, pathway, summary, decided_by, decided_at)
       VALUES (?, 'deceased', ?, ?, NOW())`,
      [visitId, summary || null, userId]
    );
  }
}

async function applyOpdSideEffects(conn, visitId, summary) {
  await conn.query(
    `UPDATE tbl_opd_visit
     SET queue_status='completed', completed_at=NOW(), disposition_at=NOW(),
         treatment_note=COALESCE(NULLIF(?, ''), treatment_note)
     WHERE id=?`,
    [summary || '', visitId]
  );
}

async function applyMaternitySideEffects(conn, maternityPatientId, deliveryRecordId) {
  await conn.query(`UPDATE maternity_patients SET status='deceased' WHERE id=?`, [maternityPatientId]);
  if (deliveryRecordId) {
    await conn.query(`UPDATE delivery_records SET outcome='maternal_death' WHERE id=?`, [deliveryRecordId]).catch(
      () => {}
    );
  }
}

async function markPatientDeceased(conn, patientId, dateOfDeath) {
  await conn.query(
    `UPDATE tbl_patient SET is_deceased=1, date_of_death=COALESCE(date_of_death, ?) WHERE id=?`,
    [dateOfDeath, patientId]
  );
}

/**
 * Record a death event from any clinical module.
 * @param {import('mysql2/promise').Pool} pool
 */
async function recordDeath(pool, opts) {
  const sourceModule = String(opts.sourceModule || 'ipd').toLowerCase();
  if (!SOURCE_MODULES.includes(sourceModule)) {
    return { ok: false, error: 'Invalid source module.' };
  }

  const patientId = parseInt(opts.patientId, 10) || 0;
  const admissionId = parseInt(opts.admissionId, 10) || null;
  const visitId = parseInt(opts.visitId, 10) || null;
  const maternityPatientId = parseInt(opts.maternityPatientId, 10) || null;
  const deliveryRecordId = parseInt(opts.deliveryRecordId, 10) || null;
  const certifyingDoctorId = parseInt(opts.certifyingDoctorId, 10) || null;
  const reportedBy = parseInt(opts.reportedBy, 10) || null;
  const dateOfDeath = normDate(opts.dateOfDeath);
  const timeOfDeath = normTime(opts.timeOfDeath);
  const cause = String(opts.causeOfDeath || '').trim().slice(0, 500) || null;
  const notes = String(opts.notes || '').trim().slice(0, 2000) || null;

  if (patientId < 1) return { ok: false, error: 'Patient is required.' };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const cols = [
      'patient_id',
      'source_module',
      'admission_id',
      'visit_id',
      'maternity_patient_id',
      'delivery_record_id',
      'date_of_death',
      'time_of_death',
      'cause_of_death',
      'certifying_doctor_id',
      'notes',
      'reported_by',
    ];
    const vals = [
      patientId,
      sourceModule,
      admissionId || null,
      visitId || null,
      maternityPatientId || null,
      deliveryRecordId || null,
      dateOfDeath,
      timeOfDeath,
      cause,
      certifyingDoctorId || null,
      notes,
      reportedBy,
    ];

    const updates = cols
      .filter((c) => c !== 'patient_id' && c !== 'source_module')
      .map((c) => `${c}=VALUES(${c})`)
      .join(', ');

    let uniqKey = 'id';
    if (sourceModule === 'ipd' && admissionId) {
      await conn.query(
        `INSERT INTO tbl_death_registry (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${updates}`,
        vals
      );
    } else if ((sourceModule === 'er' || sourceModule === 'opd') && visitId) {
      await conn.query(
        `INSERT INTO tbl_death_registry (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${updates}`,
        vals
      );
    } else if (sourceModule === 'maternity' && maternityPatientId) {
      const [[exists]] = await conn.query(
        `SELECT id FROM tbl_death_registry WHERE maternity_patient_id=? LIMIT 1`,
        [maternityPatientId]
      );
      if (exists?.id) {
        await conn.query(
          `UPDATE tbl_death_registry SET date_of_death=?, time_of_death=?, cause_of_death=?,
           certifying_doctor_id=?, notes=?, reported_by=?, delivery_record_id=COALESCE(?, delivery_record_id)
           WHERE id=?`,
          [dateOfDeath, timeOfDeath, cause, certifyingDoctorId, notes, reportedBy, deliveryRecordId, exists.id]
        );
      } else {
        await conn.query(
          `INSERT INTO tbl_death_registry (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          vals
        );
      }
    } else {
      await conn.query(
        `INSERT INTO tbl_death_registry (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        vals
      );
    }

    await markPatientDeceased(conn, patientId, dateOfDeath);

    if (sourceModule === 'ipd' && admissionId) await applyIpdSideEffects(conn, admissionId);
    if (sourceModule === 'er' && visitId) await applyErSideEffects(conn, visitId, reportedBy, cause || notes);
    if (sourceModule === 'opd' && visitId) await applyOpdSideEffects(conn, visitId, cause || notes);
    if (sourceModule === 'maternity' && maternityPatientId) {
      await applyMaternitySideEffects(conn, maternityPatientId, deliveryRecordId);
    }

    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    return { ok: false, error: e.message || 'Could not save death record.' };
  } finally {
    conn.release();
  }
}

async function loadDeathRegistryPageData(pool) {
  const [stats, rows, pending, doctors] = await Promise.all([
    loadDeathStats(pool),
    listDeathRecords(pool),
    loadPendingCases(pool),
    loadCertifyingDoctors(pool),
  ]);
  return { stats, rows, pending, doctors };
}

module.exports = {
  SOURCE_MODULES,
  recordDeath,
  listDeathRecords,
  loadPendingCases,
  loadDeathStats,
  loadCertifyingDoctors,
  loadDeathRegistryPageData,
};
