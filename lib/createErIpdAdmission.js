'use strict';

const { ensureAdmissionErColumns, transferErChargesToIpd } = require('./transferErChargesToIpd');

/**
 * Create or reuse a pending tbl_admission from an ER visit (IPD disposition).
 * @returns {Promise<{ admissionId: number, created: boolean, chargeTransfer: object }|null>}
 */
async function createErIpdAdmission(pool, o) {
  const vid = parseInt(o.visitId, 10) || 0;
  const uid = parseInt(o.createdBy, 10) || null;
  const fid = o.facilityId != null ? Number(o.facilityId) || 1 : 1;
  if (vid < 1) return null;

  await ensureAdmissionErColumns(pool);

  const vrow = await pool
    .query(
      `SELECT id, patient_id, assigned_doctor_id, facility_id, ticket_number
         FROM tbl_opd_visit WHERE id=? AND is_emergency=1 LIMIT 1`,
      [vid]
    )
    .then(([r]) => r && r[0])
    .catch(() => null);
  if (!vrow) return null;

  const patientId = parseInt(vrow.patient_id, 10) || 0;
  const doctorId = parseInt(vrow.assigned_doctor_id, 10) || parseInt(o.admittingDoctorId, 10) || uid || null;
  const dept = String(o.admittingDepartment || 'General Medicine').trim();
  const diagnosis = String(o.admittingDiagnosis || 'Emergency — admit from A&E').trim();
  const notes = String(o.notes || '').trim();

  const nd = "(discharged_at IS NULL OR discharged_at = '0000-00-00 00:00:00' OR discharged_at = '0000-00-00')";
  const [[existing]] = await pool
    .query(
      `SELECT id FROM tbl_admission
        WHERE patient_id=? AND ${nd}
          AND (bed_id IS NULL OR bed_id = 0)
          AND ipd_status IN ('pending','admitted')
        ORDER BY id DESC LIMIT 1`,
      [patientId]
    )
    .catch(() => [[null]]);

  let admissionId = existing && existing.id ? parseInt(existing.id, 10) : 0;
  let created = false;

  if (admissionId < 1) {
    await pool.query("ALTER TABLE tbl_admission ADD COLUMN IF NOT EXISTS ipd_status VARCHAR(30) DEFAULT 'admitted'").catch(() => {});
    const ins = await pool.query(
      `INSERT INTO tbl_admission
        (facility_id, patient_id, bed_id, ipd_status, admitting_department, admitting_diagnosis,
         admitting_doctor_id, deposit_amount, created_by, admitted_at, running_bill, source_opd_visit_id)
       VALUES (?,?,?,?,?,?,?,?,?,NOW(),0,?)`,
      [fid, patientId, null, 'pending', dept, diagnosis, doctorId, 0, uid, vid]
    );
    admissionId = ins[0].insertId;
    created = true;
  } else {
    await pool
      .query(
        `UPDATE tbl_admission
            SET admitting_department=COALESCE(NULLIF(?,''), admitting_department),
                admitting_diagnosis=COALESCE(NULLIF(?,''), admitting_diagnosis),
                admitting_doctor_id=COALESCE(?, admitting_doctor_id),
                source_opd_visit_id=COALESCE(source_opd_visit_id, ?)
          WHERE id=?`,
        [dept, diagnosis, doctorId, vid, admissionId]
      )
      .catch(() => {});
  }

  const chargeTransfer = await transferErChargesToIpd(pool, {
    visitId: vid,
    admissionId,
    addedBy: uid,
    facilityId: fid,
  });

  return { admissionId, created, chargeTransfer, patientId, ticketNumber: vrow.ticket_number };
}

module.exports = { createErIpdAdmission };
