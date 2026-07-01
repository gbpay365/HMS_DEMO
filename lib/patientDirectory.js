'use strict';

const PATIENT_LIST_CAP = 2500;

/** Active patients — portable across MySQL ints and PostgreSQL boolean/text status. */
function patientActiveWhere(alias = '') {
  const a = alias ? `${alias}.` : '';
  return `(
    ${a}status IS NULL
    OR ${a}status IN (1, true)
    OR LOWER(CAST(${a}status AS TEXT)) IN ('1', 'true', 't', 'yes', 'active')
  )`;
}

function mapPatientRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    patient_code: row.patient_code != null ? String(row.patient_code).trim() : '',
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    gender: row.gender,
    patient_type: row.patient_type || null,
    created_at: row.created_at || null,
    status: row.status,
  };
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
  const mapped = mapPatientRow(row);
  if (!mapped || mapped.id == null) return list;
  const id = String(mapped.id);
  const out = Array.isArray(list) ? list.filter((p) => String(p.id) !== id) : [];
  return [mapped, ...out];
}

function looksLikePatientCode(q) {
  return /^[A-Za-z]{2,8}-\d{3,8}-[A-Za-z]{2,8}$/.test(String(q || '').trim());
}

/** PostgreSQL-safe directory search (avoids MySQL CONCAT/CAST CHAR edge cases). */
function directorySearchWhere(pool, alias = '') {
  const a = alias ? `${alias}.` : '';
  if (pool?.driver === 'postgres') {
    return `(
      LOWER(TRIM(COALESCE(${a}patient_code, ''))) = LOWER(TRIM(?))
      OR LOWER(COALESCE(${a}patient_code, '')) LIKE LOWER(?)
      OR LOWER(COALESCE(${a}first_name, '')) LIKE LOWER(?)
      OR LOWER(COALESCE(${a}last_name, '')) LIKE LOWER(?)
      OR LOWER(COALESCE(${a}first_name, '') || ' ' || COALESCE(${a}last_name, '')) LIKE LOWER(?)
      OR LOWER(COALESCE(${a}phone, '')) LIKE LOWER(?)
      OR CAST(${a}id AS TEXT) LIKE ?
    )`;
  }
  const { patientSearchWhere } = require('./hmsCaseInsensitiveSearch');
  return patientSearchWhere(alias);
}

function directorySearchBindings(q, pool) {
  const term = String(q || '').trim();
  const like = term ? `%${term}%` : '%';
  const idLike = `%${term}%`;
  if (pool?.driver === 'postgres') {
    return [term, like, like, like, like, like, idLike];
  }
  const { patientSearchBindings } = require('./hmsCaseInsensitiveSearch');
  return patientSearchBindings(q);
}

async function fetchPatientById(pool, id) {
  const pid = parseInt(String(id || ''), 10) || 0;
  if (pid < 1) return null;
  const [rows] = await pool.query('SELECT * FROM tbl_patient WHERE id = ? LIMIT 1', [pid]);
  return mapPatientRow(rows?.[0]);
}

async function fetchPatientByCode(pool, code) {
  const norm = String(code || '').trim();
  if (!norm) return null;
  const [rows] = await pool.query(
    `SELECT * FROM tbl_patient
     WHERE LOWER(TRIM(COALESCE(patient_code, ''))) = LOWER(TRIM(?))
     ORDER BY id DESC
     LIMIT 1`,
    [norm]
  );
  return mapPatientRow(rows?.[0]);
}

async function repairRecentMisclassifiedPatients(pool) {
  try {
    const [rows] = await pool.query(
      `SELECT id FROM tbl_patient
       WHERE patient_code IS NOT NULL AND TRIM(COALESCE(patient_code, '')) <> ''
         AND CAST(status AS TEXT) IN ('0', 'false')
       ORDER BY id DESC
       LIMIT 120`
    );
    for (const row of rows || []) {
      await pool.query('UPDATE tbl_patient SET status = 1 WHERE id = ?', [row.id]).catch(() => {});
    }
  } catch (_) {
    /* non-blocking */
  }
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ q?: string, patientId?: number|string }} [opts]
 */
async function loadPatientDirectory(pool, opts = {}) {
  await ensurePatientDirectoryColumns(pool);
  await repairRecentMisclassifiedPatients(pool);

  const activeWhere = patientActiveWhere();
  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM tbl_patient WHERE ${activeWhere}`
  );
  let patientTotal = parseInt(String(countRow?.total ?? 0), 10) || 0;

  const q = String(opts.q || '').trim();
  const highlightId = parseInt(String(opts.patientId || ''), 10) || 0;
  let patients = [];
  let queryError = null;

  try {
    if (q) {
      const whereSearch = directorySearchWhere(pool);
      const bindings = directorySearchBindings(q, pool);
      const [rows] = await pool.query(
        `SELECT * FROM tbl_patient
         WHERE ${activeWhere} AND ${whereSearch}
         ORDER BY id DESC
         LIMIT 200`,
        bindings
      );
      patients = (rows || []).map(mapPatientRow).filter(Boolean);

      if (!patients.length && looksLikePatientCode(q)) {
        const byCode = await fetchPatientByCode(pool, q);
        if (byCode) patients = [byCode];
      }
    } else {
      const [rows] = await pool.query(
        `SELECT * FROM tbl_patient
         WHERE ${activeWhere}
         ORDER BY id DESC
         LIMIT ?`,
        [PATIENT_LIST_CAP]
      );
      patients = (rows || []).map(mapPatientRow).filter(Boolean);
    }
  } catch (e) {
    queryError = e;
    console.error('[patientDirectory] list query failed:', e.message);
    try {
      const [rows] = await pool.query(
        `SELECT * FROM tbl_patient
         WHERE ${activeWhere}
         ORDER BY id DESC
         LIMIT ?`,
        [PATIENT_LIST_CAP]
      );
      patients = (rows || []).map(mapPatientRow).filter(Boolean);
      queryError = null;
    } catch (e2) {
      console.error('[patientDirectory] fallback query failed:', e2.message);
      patients = [];
    }
  }

  if (highlightId > 0) {
    try {
      const row = await fetchPatientById(pool, highlightId);
      if (row) {
        patients = mergePatientRow(patients, row);
        if (!patients.some((p) => String(p.id) === String(highlightId))) {
          patientTotal = Math.max(patientTotal, patients.length);
        }
      }
    } catch (e) {
      console.warn('[patientDirectory] highlight patient:', e.message);
    }
  }

  if (q && !patients.length) {
    const byCode = await fetchPatientByCode(pool, q).catch(() => null);
    if (byCode) patients = [byCode];
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

/** New registrations should always be active unless staff explicitly chose inactive. */
async function ensurePatientActiveOnRegister(conn, patientId, statusVal) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) return;
  if (parseInt(statusVal, 10) === 0) return;
  await conn
    .query('UPDATE tbl_patient SET status = 1 WHERE id = ?', [pid])
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
  mapPatientRow,
  fetchPatientById,
  fetchPatientByCode,
  loadPatientDirectory,
  syncPatientIdSequence,
  ensurePatientActiveOnRegister,
  patientAddWantsJson,
  respondPatientAdd,
};
