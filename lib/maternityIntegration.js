'use strict';

const MATERNITY_WARD_NAME = 'Maternity Ward';

async function ensureMaternityIntegrationSchema(pool) {
  const q = (sql) =>
    pool.query(sql).catch((e) => {
      const msg = String(e.message || '');
      if (/Duplicate|already exists|ER_DUP|duplicate column/i.test(msg)) return;
      throw e;
    });

  await q('ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS guardian_patient_id INT NULL');
  await q('ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS birth_mother_patient_id INT NULL');
  await q('ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS is_newborn TINYINT(1) NOT NULL DEFAULT 0');
  await q('ALTER TABLE labor_records ADD COLUMN IF NOT EXISTS admission_id INT NULL');
  await q('ALTER TABLE newborn_records ADD COLUMN IF NOT EXISTS patient_id INT NULL');
  await q('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS maternity_labor_id INT NULL');
  await q('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS hos_payment_deferred TINYINT(1) NOT NULL DEFAULT 0');
  await q('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS clinical_discharged_at DATETIME NULL');
  await q("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_status VARCHAR(30) DEFAULT 'admitted'");
  await q('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS newborn_record_id INT NULL');
}

async function generateNeonatalNumber(conn) {
  const year = new Date().getFullYear();
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS c FROM newborn_records WHERE YEAR(created_at) = ?`,
    [year]
  );
  const n = (parseInt(row?.c, 10) || 0) + 1;
  return `NB-${year}-${String(n).padStart(4, '0')}`;
}

/**
 * Create a tbl_patient row for a live newborn linked to the mother.
 */
async function createNewbornPatientRecord(conn, opts) {
  const motherPatientId = parseInt(opts.motherPatientId, 10);
  const sex = String(opts.sex || 'male').toLowerCase();
  const timeOfBirth = opts.timeOfBirth || null;

  const [[mother]] = await conn.query(
    'SELECT id, first_name, last_name, phone FROM tbl_patient WHERE id = ? LIMIT 1',
    [motherPatientId]
  );
  if (!mother) throw new Error('Mother patient not found');

  const ensurePatientCodeSchema = require('./ensurePatientCodeSchema');
  await ensurePatientCodeSchema(conn).catch(() => {});
  const { allocateNextPatientCodeLocked } = require('./hmsPatientCode');
  const patientCode = await allocateNextPatientCodeLocked(conn);

  const gender = sex === 'female' ? 'Female' : 'Male';
  const motherLast = String(mother.last_name || '').trim() || 'Mother';
  const firstName = 'Baby';
  const lastName = `of ${motherLast}`;
  const dobIso = timeOfBirth ? String(timeOfBirth).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const phone = String(mother.phone || '').trim() || '000000000';

  const [ins] = await conn.query(
    `INSERT INTO tbl_patient
     (patient_code, first_name, last_name, gender, dob, phone, patient_type,
      guardian_patient_id, birth_mother_patient_id, is_newborn, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,1,1,NOW())`,
    [patientCode, firstName, lastName, gender, dobIso, phone, 'newborn', motherPatientId, motherPatientId]
  );
  const babyId = ins.insertId;
  const { refreshPatientIdentityKey } = require('./ensurePatientIdentitySchema');
  await refreshPatientIdentityKey(conn, babyId).catch(() => {});

  const qrToken = `GBPAY-${babyId}-${Date.now()}`;
  await conn
    .query(
      "INSERT IGNORE INTO tbl_patient_wallet (patient_id, balance, status, qr_token, created_at, updated_at) VALUES (?,0,'active',?,NOW(),NOW())",
      [babyId, qrToken]
    )
    .catch(() => {});

  return { patientId: babyId, patientCode };
}

async function findAvailableMaternityBed(conn, facilityId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const [rows] = await conn.query(
    `SELECT b.id, b.bed_label, b.ward_name
     FROM tbl_bed b
     WHERE b.facility_id = ?
       AND LOWER(TRIM(COALESCE(b.status,''))) = 'available'
       AND (
         LOWER(TRIM(COALESCE(b.ward_name,''))) LIKE '%maternity%'
         OR TRIM(COALESCE(b.ward_name,'')) = ?
       )
     ORDER BY b.ward_name, b.bed_label
     LIMIT 1`,
    [fid, MATERNITY_WARD_NAME]
  );
  return rows[0] || null;
}

/**
 * Create IPD admission for a mother in labor and link labor_records.admission_id.
 */
async function createMaternityIpdAdmission(conn, opts) {
  const patientId = parseInt(opts.patientId, 10);
  const laborRecordId = parseInt(opts.laborRecordId, 10);
  const facilityId = Math.max(1, parseInt(opts.facilityId, 10) || 1);
  const userId = parseInt(opts.userId, 10) || null;
  const payLater = opts.payLater !== false && opts.payLater !== 0 && opts.payLater !== '0';
  const bedId = parseInt(opts.bedId, 10) || 0;

  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS facility_id INT DEFAULT 1').catch(() => {});
  await conn.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_status VARCHAR(30) DEFAULT 'admitted'").catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS maternity_labor_id INT NULL').catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS hos_payment_deferred TINYINT(1) NOT NULL DEFAULT 0').catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_department VARCHAR(120) DEFAULT NULL').catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_diagnosis VARCHAR(255) DEFAULT NULL').catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitting_doctor_id INT DEFAULT NULL').catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS created_by INT DEFAULT NULL').catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS admitted_at DATETIME DEFAULT CURRENT_TIMESTAMP').catch(() => {});
  await conn.query('ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS running_bill DECIMAL(12,2) DEFAULT 0').catch(() => {});

  let bed = null;
  if (bedId > 0) {
    const [[b]] = await conn.query('SELECT id, status, ward_name, bed_label FROM tbl_bed WHERE id = ? FOR UPDATE', [
      bedId,
    ]);
    if (b && String(b.status || '').toLowerCase() === 'available') bed = b;
  } else {
    bed = await findAvailableMaternityBed(conn, facilityId);
  }

  const diagnosis = String(opts.admittingDiagnosis || '').trim() || 'Maternity — labor / delivery';
  const [ins] = await conn.query(
    `INSERT INTO tbl_admission
     (facility_id, patient_id, bed_id, ipd_status, admitting_department, admitting_diagnosis,
      admitting_doctor_id, hos_payment_deferred, maternity_labor_id, created_by, admitted_at, running_bill)
     VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),0)`,
    [
      facilityId,
      patientId,
      bed ? bed.id : null,
      'admitted',
      'Maternity',
      diagnosis,
      parseInt(opts.admittingDoctorId, 10) || null,
      payLater ? 1 : 0,
      laborRecordId,
      userId,
    ]
  );

  if (bed) {
    await conn.query("UPDATE tbl_bed SET status='occupied' WHERE id=?", [bed.id]);
  }
  await conn.query('UPDATE labor_records SET admission_id = ? WHERE id = ?', [ins.insertId, laborRecordId]);

  return {
    admissionId: ins.insertId,
    bedId: bed ? bed.id : null,
    bedLabel: bed ? `${bed.ward_name || MATERNITY_WARD_NAME} — ${bed.bed_label || bed.id}` : null,
  };
}

module.exports = {
  MATERNITY_WARD_NAME,
  ensureMaternityIntegrationSchema,
  generateNeonatalNumber,
  createNewbornPatientRecord,
  createMaternityIpdAdmission,
  findAvailableMaternityBed,
};
