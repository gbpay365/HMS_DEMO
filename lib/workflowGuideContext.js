'use strict';

const { createDbPool } = require('./dbPool');

async function row(pool, sql, params = []) {
  const [rows] = await pool.query(sql, params).catch(() => [[]]);
  return rows && rows[0] ? rows[0] : null;
}

async function resolveWorkflowGuideContext(pool) {
  const opdVisit = await row(
    pool,
    `SELECT v.id AS visit_id, v.patient_id, v.payment_code, v.queue_status, v.ticket_number,
            p.first_name, p.last_name
       FROM tbl_opd_visit v
       JOIN tbl_patient p ON p.id = v.patient_id
      WHERE COALESCE(v.is_emergency, 0) = 0
      ORDER BY v.id DESC
      LIMIT 1`
  );

  const admission = await row(
    pool,
    `SELECT a.id AS admission_id, a.patient_id, a.bed_id, a.clinical_discharged_at, a.discharged_at,
            p.first_name, p.last_name
       FROM tbl_admission a
       JOIN tbl_patient p ON p.id = a.patient_id
      ORDER BY a.id DESC
      LIMIT 1`
  );

  const maternity = await row(
    pool,
    `SELECT mp.id AS maternity_id, mp.patient_id, p.first_name, p.last_name
       FROM maternity_patients mp
       JOIN tbl_patient p ON p.id = mp.patient_id
      ORDER BY mp.id DESC
      LIMIT 1`
  );

  const erVisit = await row(
    pool,
    `SELECT v.id AS visit_id, v.patient_id, v.queue_status, v.er_payment_code,
            p.first_name, p.last_name
       FROM tbl_opd_visit v
       JOIN tbl_patient p ON p.id = v.patient_id
      WHERE COALESCE(v.is_emergency, 0) = 1
      ORDER BY v.id DESC
      LIMIT 1`
  );

  const erCompleted = await row(
    pool,
    `SELECT v.id AS visit_id, v.patient_id, v.queue_status, v.er_payment_code
       FROM tbl_opd_visit v
      WHERE COALESCE(v.is_emergency, 0) = 1 AND v.queue_status = 'completed'
      ORDER BY v.id DESC
      LIMIT 1`
  );

  const patientLabel = (r) =>
    r ? `${String(r.first_name || '').trim()} ${String(r.last_name || '').trim()}`.trim() : 'Demo Patient';

  return {
    opd: opdVisit
      ? {
          patientId: opdVisit.patient_id,
          visitId: opdVisit.visit_id,
          paymentCode: opdVisit.payment_code,
          ticketNumber: opdVisit.ticket_number,
          queueStatus: opdVisit.queue_status,
          label: patientLabel(opdVisit),
        }
      : { patientId: 1, visitId: null, label: 'Demo Patient' },
    ipd: admission
      ? {
          patientId: admission.patient_id,
          admissionId: admission.admission_id,
          bedId: admission.bed_id,
          label: patientLabel(admission),
        }
      : { patientId: 1, admissionId: 1, label: 'Demo Patient' },
    maternity: maternity
      ? {
          patientId: maternity.patient_id,
          maternityId: maternity.maternity_id,
          label: patientLabel(maternity),
        }
      : { patientId: 1, maternityId: 1, label: 'Demo Patient' },
    emergency: erVisit
      ? {
          patientId: erVisit.patient_id,
          visitId: erVisit.visit_id,
          queueStatus: erVisit.queue_status,
          erPaymentCode: erVisit.er_payment_code,
          label: patientLabel(erVisit),
          completedVisitId: erCompleted?.visit_id || erVisit.visit_id,
        }
      : { patientId: 1, visitId: 1, label: 'Demo Patient' },
  };
}

async function loadWorkflowGuideContext() {
  const pool = await createDbPool();
  try {
    return await resolveWorkflowGuideContext(pool);
  } finally {
    if (pool.nativePool && pool.nativePool.end) await pool.nativePool.end();
  }
}

module.exports = { loadWorkflowGuideContext, resolveWorkflowGuideContext };
