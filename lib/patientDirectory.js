'use strict';

const PATIENT_LIST_CAP = 2500;

const DIRECTORY_SELECT = `id, patient_code, first_name, last_name, email, phone, gender, patient_type, created_at`;

/** Active patients — portable across MySQL ints and PostgreSQL boolean/text status. */
function patientActiveWhere(alias = '') {
  const a = alias ? `${alias}.` : '';
  return `(
    ${a}status IS NULL
    OR CAST(${a}status AS TEXT) NOT IN ('0', 'false', 'f', 'no', 'inactive')
  )`;
}

async function ensurePatientDirectoryColumns(pool) {
  const stmts = [
    'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS patient_code VARCHAR(32) NULL',
    'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL',
    'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS patient_type VARCHAR(30) NULL',
    'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS status SMALLINT DEFAULT 1',
  ];
  for (const sql of stmts) {
    await pool.query(sql).catch(() => {});
  }
}

function mergePatientRow(list, row) {
  if (!row || row.id == null) return list;
  const id = String(row.id);
  const out = Array.isArray(list) ? list.filter((p) => String(p.id) !== id) : [];
  return [row, ...out];
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ q?: string, patientId?: number|string }} [opts]
 */
async function loadPatientDirectory(pool, opts = {}) {
  await ensurePatientDirectoryColumns(pool);

  const activeWhere = patientActiveWhere();
  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM tbl_patient WHERE ${activeWhere}`
  );
  const patientTotal = parseInt(String(countRow?.total ?? 0), 10) || 0;

  const q = String(opts.q || '').trim();
  const highlightId = parseInt(String(opts.patientId || ''), 10) || 0;
  let patients = [];
  let queryError = null;

  try {
    if (q) {
      const {
        patientSearchWhere,
        patientSearchBindings,
        normalizeSearchTerm,
      } = require('./hmsCaseInsensitiveSearch');
      if (normalizeSearchTerm(q)) {
        const [rows] = await pool.query(
          `SELECT ${DIRECTORY_SELECT}
           FROM tbl_patient
           WHERE ${activeWhere} AND ${patientSearchWhere('')}
           ORDER BY id DESC
           LIMIT 200`,
          patientSearchBindings(q)
        );
        patients = Array.isArray(rows) ? rows : [];
      }
    } else {
      const [rows] = await pool.query(
        `SELECT ${DIRECTORY_SELECT}
         FROM tbl_patient
         WHERE ${activeWhere}
         ORDER BY id DESC
         LIMIT ?`,
        [PATIENT_LIST_CAP]
      );
      patients = Array.isArray(rows) ? rows : [];
    }
  } catch (e) {
    queryError = e;
    console.error('[patientDirectory] list query failed:', e.message);
    try {
      const [rows] = await pool.query(
        `SELECT ${DIRECTORY_SELECT}
         FROM tbl_patient
         WHERE ${activeWhere}
         ORDER BY id DESC
         LIMIT ?`,
        [PATIENT_LIST_CAP]
      );
      patients = Array.isArray(rows) ? rows : [];
      queryError = null;
    } catch (e2) {
      console.error('[patientDirectory] fallback query failed:', e2.message);
      patients = [];
    }
  }

  if (highlightId > 0) {
    try {
      const [[row]] = await pool.query(
        `SELECT ${DIRECTORY_SELECT} FROM tbl_patient WHERE id = ? LIMIT 1`,
        [highlightId]
      );
      if (row) {
        const statusText = row.status == null ? '' : String(row.status).toLowerCase();
        const inactive = ['0', 'false', 'f', 'no', 'inactive'].includes(statusText);
        if (!inactive) patients = mergePatientRow(patients, row);
      }
    } catch (e) {
      console.warn('[patientDirectory] highlight patient:', e.message);
    }
  }

  return {
    patients,
    patientTotal,
    searchQ: q || null,
    queryError: queryError ? queryError.message : null,
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
  const parts = [];
  if (payload.patientCode) parts.push(`q=${encodeURIComponent(payload.patientCode)}`);
  if (payload.patientId) parts.push(`patient_id=${encodeURIComponent(String(payload.patientId))}`);
  const extra = parts.length ? `&${parts.join('&')}` : '';
  if (payload.redirect) return res.redirect(payload.redirect);
  return res.redirect(`/patients?msg=${encodeURIComponent(payload.message || 'Patient registered.')}${extra}`);
}

module.exports = {
  PATIENT_LIST_CAP,
  patientActiveWhere,
  ensurePatientDirectoryColumns,
  loadPatientDirectory,
  syncPatientIdSequence,
  patientAddWantsJson,
  respondPatientAdd,
};
