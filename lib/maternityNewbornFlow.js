'use strict';

const PEDIATRIC_WARD_NAME = 'Pediatric Ward';

async function ensureNewbornFlowSchema(pool) {
  const q = (sql) =>
    pool.query(sql).catch((e) => {
      const msg = String(e.message || '');
      if (/Duplicate|already exists|ER_DUP|duplicate column/i.test(msg)) return;
      throw e;
    });
  await q('ALTER TABLE newborn_records ADD COLUMN IF NOT EXISTS baby_admission_id INT NULL');
  await q('ALTER TABLE newborn_records ADD COLUMN IF NOT EXISTS opd_visit_id INT NULL');
}

async function findAvailablePediatricBed(conn, facilityId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const [rows] = await conn.query(
    `SELECT b.id, b.bed_label, b.ward_name
     FROM tbl_bed b
     WHERE b.facility_id = ?
       AND LOWER(TRIM(COALESCE(b.status,''))) = 'available'
       AND (
         LOWER(TRIM(COALESCE(b.ward_name,''))) LIKE '%pediatric%'
         OR TRIM(COALESCE(b.ward_name,'')) = ?
       )
     ORDER BY b.ward_name, b.bed_label
     LIMIT 1`,
    [fid, PEDIATRIC_WARD_NAME]
  );
  return rows[0] || null;
}

async function createBabyNicuAdmission(conn, opts) {
  const babyPatientId = parseInt(opts.babyPatientId, 10);
  const newbornRecordId = parseInt(opts.newbornRecordId, 10);
  const facilityId = Math.max(1, parseInt(opts.facilityId, 10) || 1);
  const userId = parseInt(opts.userId, 10) || null;
  const payLater = opts.payLater !== false && opts.payLater !== 0 && opts.payLater !== '0';
  const diagnosis =
    String(opts.diagnosis || '').trim() || 'NICU — neonatal admission';

  let bed = await findAvailablePediatricBed(conn, facilityId);
  const bedId = bed ? bed.id : null;

  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS facility_id INT DEFAULT 1').catch(() => {});
  await conn.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_status VARCHAR(30) DEFAULT 'admitted'").catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS hos_payment_deferred TINYINT(1) NOT NULL DEFAULT 0').catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_department VARCHAR(120) DEFAULT NULL').catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_diagnosis VARCHAR(255) DEFAULT NULL').catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_doctor_id INT DEFAULT NULL').catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS created_by INT DEFAULT NULL').catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitted_at DATETIME DEFAULT CURRENT_TIMESTAMP').catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS running_bill DECIMAL(12,2) DEFAULT 0').catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS newborn_record_id INT NULL').catch(() => {});

  const [ins] = await conn.query(
    `INSERT INTO tbl_admission
     (facility_id, patient_id, bed_id, ipd_status, admitting_department, admitting_diagnosis,
      admitting_doctor_id, hos_payment_deferred, newborn_record_id, created_by, admitted_at, running_bill)
     VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),0)`,
    [
      facilityId,
      babyPatientId,
      bedId,
      'admitted',
      'Pediatrics',
      diagnosis,
      parseInt(opts.admittingDoctorId, 10) || null,
      payLater ? 1 : 0,
      newbornRecordId,
      userId,
    ]
  );

  if (bed) {
    await conn.query("UPDATE tbl_bed SET status='occupied' WHERE id=?", [bed.id]);
  }

  const { postIpdChargeFromCatalog, findCatalogByName, EVENT_CATALOG } = require('./maternityBilling');
  const nicuCat = await findCatalogByName(conn, EVENT_CATALOG.nicu_day);
  if (nicuCat?.id) {
    await postIpdChargeFromCatalog(conn, {
      admissionId: ins.insertId,
      catalogId: nicuCat.id,
      patientId: babyPatientId,
      userId,
      facilityId,
      sourceModule: 'maternity_newborn',
      sourcePk: newbornRecordId,
    }).catch(() => {});
  }

  await conn.query('UPDATE newborn_records SET baby_admission_id = ?, discharge_status = ? WHERE id = ?', [
    ins.insertId,
    'admitted',
    newbornRecordId,
  ]);

  return {
    admissionId: ins.insertId,
    bedId,
    bedLabel: bed ? `${bed.ward_name || PEDIATRIC_WARD_NAME} — ${bed.bed_label || bed.id}` : null,
  };
}

async function createPediatricOpdVisit(conn, opts) {
  const { createFollowUpOpdVisit } = require('./followUpConsultation');
  const babyPatientId = parseInt(opts.babyPatientId, 10);
  const newbornRecordId = parseInt(opts.newbornRecordId, 10);
  const facilityId = Math.max(1, parseInt(opts.facilityId, 10) || 1);
  const userId = parseInt(opts.userId, 10) || null;

  const visitId = await createFollowUpOpdVisit(conn, {
    facilityId,
    userId,
    patientId: babyPatientId,
    paymentCode: null,
    department: 'Pediatrics',
    assignedDoctorId: parseInt(opts.assignedDoctorId, 10) || 0,
    chiefComplaint: String(opts.chiefComplaint || 'Newborn assessment — post-delivery'),
  });

  await conn.query('UPDATE newborn_records SET opd_visit_id = ? WHERE id = ?', [visitId, newbornRecordId]);
  return { visitId };
}

/**
 * After newborn registration: optional pediatric OPD + NICU IPD paths.
 */
async function processNewbornClinicalPaths(conn, opts) {
  await ensureNewbornFlowSchema(conn);
  const newbornRecordId = parseInt(opts.newbornRecordId, 10);
  const babyPatientId = parseInt(opts.babyPatientId, 10);
  if (newbornRecordId < 1 || babyPatientId < 1) return {};

  const out = {};
  if (opts.pediatricOpd) {
    out.opd = await createPediatricOpdVisit(conn, {
      babyPatientId,
      newbornRecordId,
      facilityId: opts.facilityId,
      userId: opts.userId,
      assignedDoctorId: opts.assignedDoctorId,
      chiefComplaint: opts.chiefComplaint,
    });
  }
  if (opts.nicuAdmission) {
    out.ipd = await createBabyNicuAdmission(conn, {
      babyPatientId,
      newbornRecordId,
      facilityId: opts.facilityId,
      userId: opts.userId,
      payLater: opts.payLater,
      diagnosis: opts.nicuReason ? `NICU — ${opts.nicuReason}` : undefined,
      admittingDoctorId: opts.assignedDoctorId,
    });
  }
  return out;
}

async function loadAdmissionMaternityContext(pool, admission) {
  if (!admission) return null;
  const aid = parseInt(admission.id, 10) || 0;
  const patientId = parseInt(admission.patient_id, 10) || 0;
  if (aid < 1) return null;

  if (String(admission.admitting_department || '') === 'Maternity' || admission.maternity_labor_id) {
    const [[lr]] = await pool.query(
      `SELECT lr.id, lr.status, lr.maternity_patient_id, mp.antenatal_number
       FROM labor_records lr
       JOIN maternity_patients mp ON mp.id = lr.maternity_patient_id
       WHERE lr.id = ? OR lr.admission_id = ?
       ORDER BY lr.admission_date DESC
       LIMIT 1`,
      [admission.maternity_labor_id || 0, aid]
    );
    if (lr) {
      return {
        kind: 'mother',
        labor_status: lr.status,
        maternity_patient_id: lr.maternity_patient_id,
        antenatal_number: lr.antenatal_number,
        chart_url: `/maternity/chart/${lr.maternity_patient_id}`,
      };
    }
  }

  if (parseInt(admission.is_newborn, 10) === 1 || admission.newborn_record_id) {
    const [[nb]] = await pool.query(
      `SELECT nb.id, nb.neonatal_number, nb.maternity_patient_id, mp.antenatal_number,
              mp.patient_id AS mother_patient_id,
              pm.first_name AS mother_first_name, pm.last_name AS mother_last_name
       FROM newborn_records nb
       JOIN maternity_patients mp ON mp.id = nb.maternity_patient_id
       JOIN tbl_patient pm ON pm.id = mp.patient_id
       WHERE nb.baby_admission_id = ? OR nb.patient_id = ?
       ORDER BY nb.id DESC
       LIMIT 1`,
      [aid, patientId]
    );
    if (nb) {
      return {
        kind: 'baby',
        neonatal_number: nb.neonatal_number,
        maternity_patient_id: nb.maternity_patient_id,
        antenatal_number: nb.antenatal_number,
        mother_patient_id: nb.mother_patient_id,
        mother_name: `${nb.mother_first_name || ''} ${nb.mother_last_name || ''}`.trim(),
        chart_url: `/maternity/chart/${nb.maternity_patient_id}?tab=newborn`,
      };
    }
  }

  const episode = await require('./maternityBilling').loadPatientMaternityEpisode(pool, patientId);
  if (episode && (episode.labor_status === 'in_labor' || episode.status === 'active')) {
    return {
      kind: 'mother_anc',
      labor_status: episode.labor_status,
      maternity_patient_id: episode.id,
      antenatal_number: episode.antenatal_number,
      chart_url: episode.chart_url,
    };
  }

  return null;
}

module.exports = {
  PEDIATRIC_WARD_NAME,
  ensureNewbornFlowSchema,
  createBabyNicuAdmission,
  createPediatricOpdVisit,
  processNewbornClinicalPaths,
  loadAdmissionMaternityContext,
};
