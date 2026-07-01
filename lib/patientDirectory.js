'use strict';

const PATIENT_LIST_CAP = 2500;

function statusTextExpr(alias = '', pool) {
  const a = alias ? `${alias}.` : '';
  return pool?.driver === 'postgres'
    ? `CAST(${a}status AS TEXT)`
    : `CAST(${a}status AS CHAR)`;
}

/**
 * Active patients — portable across MySQL tinyint and PostgreSQL boolean/int status.
 * Never mix boolean and integer in a single IN (...) — PostgreSQL rejects that.
 */
function patientActiveWhere(alias = '', pool) {
  const a = alias ? `${alias}.` : '';
  const st = statusTextExpr(alias, pool);
  if (pool?.driver === 'postgres') {
    return `(
      ${a}status IS NULL
      OR ${a}status IS TRUE
      OR LOWER(${st}) IN ('1', 'true', 't', 'yes', 'active')
    )`;
  }
  return `(
    ${a}status IS NULL
    OR ${a}status = 1
    OR LOWER(${st}) IN ('1', 'true', 't', 'yes', 'active')
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

const PATIENT_ROW_COLUMNS =
  'id, patient_code, first_name, last_name, email, phone, gender, patient_type, created_at, status';

async function fetchPatientById(pool, id) {
  const pid = parseInt(String(id || ''), 10) || 0;
  if (pid < 1) return null;
  const [rows] = await pool.query(
    `SELECT ${PATIENT_ROW_COLUMNS} FROM tbl_patient WHERE id = ? LIMIT 1`,
    [pid]
  );
  return mapPatientRow(rows?.[0]);
}

async function fetchPatientByCode(pool, code) {
  const norm = String(code || '').trim();
  if (!norm) return null;
  const [rows] = await pool.query(
    `SELECT ${PATIENT_ROW_COLUMNS} FROM tbl_patient
     WHERE LOWER(TRIM(COALESCE(patient_code, ''))) = LOWER(TRIM(?))
     ORDER BY id DESC
     LIMIT 1`,
    [norm]
  );
  return mapPatientRow(rows?.[0]);
}

async function repairRecentMisclassifiedPatients(pool) {
  try {
    const st = statusTextExpr('', pool);
    const inactive =
      pool?.driver === 'postgres'
        ? `(status = 0 OR status IS FALSE OR LOWER(${st}) IN ('0', 'false'))`
        : `(status = 0 OR LOWER(${st}) IN ('0', 'false'))`;
    const [rows] = await pool.query(
      `SELECT id FROM tbl_patient
       WHERE patient_code IS NOT NULL AND TRIM(COALESCE(patient_code, '')) <> ''
         AND ${inactive}
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

/** After registration redirect (?patient_id=&q=CODE), backfill code/status for that row. */
async function repairHighlightedPatientFromQuery(pool, patientId, code) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) return;
  const norm = String(code || '').trim();
  try {
    await pool.query('UPDATE tbl_patient SET status = 1 WHERE id = ?', [pid]);
    if (norm && looksLikePatientCode(norm)) {
      await pool.query(
        `UPDATE tbl_patient
         SET patient_code = ?
         WHERE id = ?
           AND (
             patient_code IS NULL
             OR TRIM(COALESCE(patient_code, '')) = ''
           )`,
        [norm, pid]
      );
    }
  } catch (e) {
    console.warn('[patientDirectory] repair highlight:', e.message);
  }
}

async function repairPatientsMissingCode(pool, limit = 40) {
  try {
    const [rows] = await pool.query(
      `SELECT id FROM tbl_patient
       WHERE patient_code IS NULL OR TRIM(COALESCE(patient_code, '')) = ''
       ORDER BY id DESC
       LIMIT ?`,
      [limit]
    );
    if (!rows?.length) return;
    const { allocateNextPatientCode } = require('./hmsPatientCode');
    for (const row of rows) {
      const code = await allocateNextPatientCode(pool);
      const updated = await pool
        .query(
          `UPDATE tbl_patient
           SET patient_code = ?, status = 1
           WHERE id = ?
             AND (patient_code IS NULL OR TRIM(COALESCE(patient_code, '')) = '')`,
          [code, row.id]
        )
        .catch(() => null);
      if (!updated) continue;
    }
  } catch (_) {
    /* non-blocking */
  }
}

async function countActivePatients(pool) {
  const activeWhere = patientActiveWhere('', pool);
  const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM tbl_patient WHERE ${activeWhere}`);
  return parseInt(String(rows?.[0]?.total ?? 0), 10) || 0;
}

async function loadPatientDirectoryInner(pool, opts = {}) {
  await ensurePatientDirectoryColumns(pool);
  await repairRecentMisclassifiedPatients(pool);

  const q = String(opts.q || '').trim();
  const highlightId = parseInt(String(opts.patientId || ''), 10) || 0;
  let patients = [];
  let queryError = null;

  if (highlightId > 0 && q) {
    await repairHighlightedPatientFromQuery(pool, highlightId, q);
  } else if (highlightId > 0) {
    await pool.query('UPDATE tbl_patient SET status = 1 WHERE id = ?', [highlightId]).catch(() => {});
  }

  // Resolve explicit registration targets first — never apply the active filter here.
  if (highlightId > 0) {
    const row = await fetchPatientById(pool, highlightId);
    if (row) patients = mergePatientRow(patients, row);
  }
  if (q) {
    const byCode = await fetchPatientByCode(pool, q);
    if (byCode) patients = mergePatientRow(patients, byCode);
  }

  const highlighted = patients.slice();

  let patientTotal = await countActivePatients(pool);
  const activeWhere = patientActiveWhere('', pool);

  try {
    if (q) {
      const whereSearch = directorySearchWhere(pool);
      const bindings = directorySearchBindings(q, pool);
      const [rows] = await pool.query(
        `SELECT ${PATIENT_ROW_COLUMNS} FROM tbl_patient
         WHERE ${activeWhere} AND ${whereSearch}
         ORDER BY id DESC
         LIMIT 200`,
        bindings
      );
      for (const row of rows || []) {
        patients = mergePatientRow(patients, row);
      }
    } else if (!patients.length) {
      const [rows] = await pool.query(
        `SELECT ${PATIENT_ROW_COLUMNS} FROM tbl_patient
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
        `SELECT ${PATIENT_ROW_COLUMNS} FROM tbl_patient
         WHERE ${activeWhere}
         ORDER BY id DESC
         LIMIT ?`,
        [PATIENT_LIST_CAP]
      );
      for (const row of rows || []) {
        patients = mergePatientRow(patients, row);
      }
      queryError = null;
    } catch (e2) {
      console.error('[patientDirectory] fallback query failed:', e2.message);
      const [rows] = await pool.query(
        `SELECT ${PATIENT_ROW_COLUMNS} FROM tbl_patient ORDER BY id DESC LIMIT ?`,
        [PATIENT_LIST_CAP]
      ).catch(() => [[]]);
      for (const row of rows || []) {
        patients = mergePatientRow(patients, row);
      }
      queryError = e2.message;
    }
  }

  for (const row of highlighted) {
    patients = mergePatientRow(patients, row);
  }

  if (patientTotal < patients.length) {
    patientTotal = Math.max(patientTotal, patients.length);
  } else if (highlightId > 0 && patients.some((p) => String(p.id) === String(highlightId))) {
    patientTotal += 1;
  }

  return {
    patients,
    patientTotal,
    searchQ: q || null,
    queryError,
  };
}

async function searchPatientsForPicker(pool, q, limit = 25) {
  const term = String(q || '').trim();
  if (!term) return [];
  const activeWhere = patientActiveWhere('', pool);
  const whereSearch = directorySearchWhere(pool);
  const bindings = directorySearchBindings(term, pool);
  const lim = Math.min(250, Math.max(1, parseInt(String(limit), 10) || 25));
  const [rows] = await pool.query(
    `SELECT id, first_name, last_name, phone, patient_code
     FROM tbl_patient
     WHERE ${activeWhere} AND ${whereSearch}
     ORDER BY last_name, first_name
     LIMIT ?`,
    [...bindings, lim]
  );
  return rows || [];
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ q?: string, patientId?: number|string }} [opts]
 */
async function loadPatientDirectory(pool, opts = {}) {
  try {
    return await loadPatientDirectoryInner(pool, opts);
  } catch (e) {
    console.error('[patientDirectory] fatal:', e.message);
    try {
      const [rows] = await pool.query(
        'SELECT * FROM tbl_patient ORDER BY id DESC LIMIT ?',
        [PATIENT_LIST_CAP]
      );
      const patients = (rows || []).map(mapPatientRow).filter(Boolean);
      return {
        patients,
        patientTotal: patients.length,
        searchQ: String(opts.q || '').trim() || null,
        queryError: e.message,
      };
    } catch (e2) {
      return {
        patients: [],
        patientTotal: 0,
        searchQ: null,
        queryError: e2.message,
      };
    }
  }
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

/** Read insert id from driver result (MySQL header or PostgreSQL RETURNING). */
async function resolveInsertPatientId(conn, insertResult) {
  const pid = parseInt(String(insertResult?.insertId ?? 0), 10) || 0;
  if (pid > 0) return pid;
  if (conn?.driver === 'postgres') {
    const [rows] = await conn
      .query(`SELECT currval(pg_get_serial_sequence('tbl_patient', 'id')) AS id`)
      .catch(() => [[]]);
    return parseInt(String(rows?.[0]?.id ?? 0), 10) || 0;
  }
  const [rows] = await conn.query('SELECT LAST_INSERT_ID() AS id').catch(() => [[]]);
  return parseInt(String(rows?.[0]?.id ?? 0), 10) || 0;
}

/** New registrations must persist code + active status (PostgreSQL sometimes omits these). */
async function finalizePatientRegistration(conn, patientId, patientCode, statusVal) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) return null;
  const code = String(patientCode || '').trim();
  if (parseInt(statusVal, 10) !== 0) {
    if (code) {
      await conn
        .query(`UPDATE tbl_patient SET status = 1, patient_code = ? WHERE id = ?`, [code, pid])
        .catch(() => {});
    } else {
      await conn.query('UPDATE tbl_patient SET status = 1 WHERE id = ?', [pid]).catch(() => {});
    }
  }
  const [rows] = await conn
    .query(`SELECT ${PATIENT_ROW_COLUMNS} FROM tbl_patient WHERE id = ? LIMIT 1`, [pid])
    .catch(() => [[]]);
  const mapped = mapPatientRow(rows?.[0]);
  if (mapped?.id && code && !mapped.patient_code) {
    mapped.patient_code = code;
  }
  return mapped;
}

async function ensurePatientActiveOnRegister(conn, patientId, statusVal, patientCode) {
  return finalizePatientRegistration(conn, patientId, patientCode, statusVal);
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
      patient: payload.patient || null,
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
  finalizePatientRegistration,
  resolveInsertPatientId,
  repairHighlightedPatientFromQuery,
  repairPatientsMissingCode,
  searchPatientsForPicker,
  directorySearchWhere,
  directorySearchBindings,
  ensurePatientActiveOnRegister,
  patientAddWantsJson,
  respondPatientAdd,
};
