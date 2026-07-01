'use strict';

const PATIENT_LIST_CAP = 2500;

async function loadPatientDirectory(pool) {
  const [[countRow]] = await pool
    .query('SELECT COUNT(*) AS total FROM tbl_patient WHERE COALESCE(status, 1) = 1')
    .catch(() => [[{ total: 0 }]]);
  const patientTotal = parseInt(String(countRow?.total ?? 0), 10) || 0;
  const [patients] = await pool
    .query(
      `SELECT id, patient_code, first_name, last_name, email, phone, gender, patient_type, created_at
       FROM tbl_patient
       WHERE COALESCE(status, 1) = 1
       ORDER BY COALESCE(created_at, '1970-01-01 00:00:00') DESC, id DESC
       LIMIT ?`,
      [PATIENT_LIST_CAP]
    )
    .catch(() => [[]]);
  return {
    patients: Array.isArray(patients) ? patients : [],
    patientTotal,
  };
}

/** Keep PostgreSQL serial in sync after bulk imports so new rows sort at the top. */
async function syncPatientIdSequence(conn) {
  if (!conn || conn.driver !== 'postgres') return;
  await conn
    .query(
      `SELECT setval(
         pg_get_serial_sequence('tbl_patient', 'id'),
         GREATEST(COALESCE((SELECT MAX(id) FROM tbl_patient), 0), 1)
       )`
    )
    .catch(() => {});
}

function patientAddWantsJson(req) {
  const accept = String(req.headers.accept || '');
  return accept.includes('application/json');
}

function respondPatientAdd(req, res, payload) {
  const wantsJson = patientAddWantsJson(req);
  if (!payload.ok) {
    const status = payload.status || 400;
    if (wantsJson) return res.status(status).json({ ok: false, error: payload.error });
    return res.redirect(payload.redirect || `/patients?err=${encodeURIComponent(payload.error || 'Registration failed.')}`);
  }
  if (wantsJson) {
    return res.json({
      ok: true,
      patientId: payload.patientId,
      patientCode: payload.patientCode,
      message: payload.message,
      redirect: payload.redirect || null,
    });
  }
  const q = payload.patientCode ? `&q=${encodeURIComponent(payload.patientCode)}` : '';
  if (payload.redirect) return res.redirect(payload.redirect);
  return res.redirect(`/patients?msg=${encodeURIComponent(payload.message || 'Patient registered.')}${q}`);
}

module.exports = {
  PATIENT_LIST_CAP,
  loadPatientDirectory,
  syncPatientIdSequence,
  patientAddWantsJson,
  respondPatientAdd,
};
