'use strict';

const { ensureVitalSignColumns } = require('./ensureVitalSignSchema');

/**
 * Insert into tbl_vital_sign with recorded_at always populated.
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} data
 * @returns {Promise<number>} insertId
 */
async function insertVitalSign(pool, data) {
  await ensureVitalSignColumns(pool);

  const patientId = parseInt(data.patient_id, 10) || 0;
  if (patientId < 1) throw new Error('patient_id is required');

  const recordedAt = data.recorded_at instanceof Date ? data.recorded_at : new Date();
  const recordedBy = data.recorded_by != null ? parseInt(data.recorded_by, 10) || null : null;
  const createdBy = data.created_by != null ? parseInt(data.created_by, 10) || recordedBy : recordedBy;

  const [result] = await pool.query(
    `INSERT INTO tbl_vital_sign (
      facility_id, patient_id, opd_visit_id, admission_id,
      bp_sys, bp_dia, heart_rate, temp_c, spo2, rr,
      weight_kg, height_cm, waist_cm, notes,
      recorded_by, recorded_at, source_station, created_by, created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      parseInt(data.facility_id, 10) || 1,
      patientId,
      data.opd_visit_id != null ? parseInt(data.opd_visit_id, 10) || null : null,
      data.admission_id != null ? parseInt(data.admission_id, 10) || null : null,
      data.bp_sys != null ? parseInt(data.bp_sys, 10) || null : null,
      data.bp_dia != null ? parseInt(data.bp_dia, 10) || null : null,
      data.heart_rate != null ? parseInt(data.heart_rate, 10) || null : null,
      data.temp_c != null ? parseFloat(data.temp_c) : null,
      data.spo2 != null ? parseInt(data.spo2, 10) || null : null,
      data.rr != null ? parseInt(data.rr, 10) || null : null,
      data.weight_kg != null ? parseFloat(data.weight_kg) : null,
      data.height_cm != null ? parseInt(data.height_cm, 10) || null : null,
      data.waist_cm != null ? parseFloat(data.waist_cm) : null,
      data.notes != null ? String(data.notes).trim() || null : null,
      recordedBy,
      recordedAt,
      data.source_station || 'nursing',
      createdBy,
      recordedAt,
    ]
  );

  return result.insertId;
}

module.exports = { insertVitalSign };
