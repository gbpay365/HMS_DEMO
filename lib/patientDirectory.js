'use strict';

const { columnExists, safeAlterPatientColumn } = require('./ensurePatientCodeSchema');

const PATIENT_LIST_CAP = 2500;

const PATIENT_ROW_COLUMNS_FULL =
  'id, patient_code, first_name, last_name, email, phone, gender, patient_type, created_at, status';

const PATIENT_ROW_COLUMNS_MIN =
  'id, patient_code, first_name, last_name, phone, gender, patient_type, created_at, status';

function statusTextExpr(alias = '', pool) {
  const a = alias ? `${alias}.` : '';
  return pool?.driver === 'postgres'
    ? `CAST(${a}status AS TEXT)`
    : `CAST(${a}status AS CHAR)`;
}

/** Explicit inactive values — safe on PG boolean/smallint/text without CAST(status AS INTEGER). */
function patientInactiveWhere(alias = '', pool) {
  const a = alias ? `${alias}.` : '';
  const st = statusTextExpr(alias, pool);
  if (pool?.driver === 'postgres') {
    return `(
      ${a}status IS NOT NULL
      AND LOWER(${st}) IN ('0', 'false', 'f', 'no', 'inactive')
    )`;
  }
  return `(
    ${a}status IS NOT NULL
    AND (${a}status = 0 OR LOWER(${st}) IN ('0', 'false', 'f', 'no', 'inactive'))
  )`;
}

/**
 * Active patients — portable across MySQL tinyint and PostgreSQL boolean/int/text status.
 */
function patientActiveWhere(alias = '', pool) {
  const a = alias ? `${alias}.` : '';
  const inactive = patientInactiveWhere(alias, pool);
  return `(${a}status IS NULL OR NOT (${inactive}))`;
}

function mapPatientRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    patient_code: row.patient_code != null ? String(row.patient_code).trim() : '',
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email != null ? row.email : '',
    phone: row.phone,
    gender: row.gender,
    patient_type: row.patient_type || null,
    created_at: row.created_at || null,
    status: row.status,
  };
}

async function ensurePatientDirectoryColumns(pool) {
  const pg = pool?.driver === 'postgres';
  const stmts = pg
    ? [
        'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS patient_code VARCHAR(32) NULL',
        'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS email VARCHAR(250) NULL',
        'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL',
        'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS gender VARCHAR(20) NULL',
        'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL',
        'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS patient_type VARCHAR(30) NULL',
        'ALTER TABLE tbl_patient ADD COLUMN IF NOT EXISTS status SMALLINT DEFAULT 1',
      ]
    : [];

  for (const sql of stmts) {
    await pool.query(sql).catch((e) => {
      console.warn('[patientDirectory] ensure column:', e.message);
    });
  }

  if (!pg) {
    const mysqlCols = [
      ['patient_code', "ALTER TABLE tbl_patient ADD COLUMN patient_code VARCHAR(32) NULL"],
      ['email', 'ALTER TABLE tbl_patient ADD COLUMN email VARCHAR(250) NULL'],
      ['phone', 'ALTER TABLE tbl_patient ADD COLUMN phone VARCHAR(50) NULL'],
      ['gender', 'ALTER TABLE tbl_patient ADD COLUMN gender VARCHAR(20) NULL'],
      ['created_at', 'ALTER TABLE tbl_patient ADD COLUMN created_at DATETIME NULL'],
      ['patient_type', 'ALTER TABLE tbl_patient ADD COLUMN patient_type VARCHAR(30) NULL'],
      ['status', 'ALTER TABLE tbl_patient ADD COLUMN status TINYINT DEFAULT 1'],
    ];
    for (const [col, sql] of mysqlCols) {
      if (!(await columnExists(pool, col))) {
        await safeAlterPatientColumn(pool, sql).catch((e) => {
          console.warn('[patientDirectory] ensure column:', e.message);
        });
      }
    }
  }
}

async function patientRowColumns(pool, opts = {}) {
  if (opts.ensureSchema !== false) {
    await ensurePatientDirectoryColumns(pool);
  }
  if (!(await columnExists(pool, 'email'))) {
    return PATIENT_ROW_COLUMNS_MIN;
  }
  return PATIENT_ROW_COLUMNS_FULL;
}

async function selectPatientRows(pool, whereSql, params, orderLimitSql = '', opts = {}) {
  const cols = await patientRowColumns(pool, opts);
  try {
    return await pool.query(
      `SELECT ${cols} FROM tbl_patient WHERE ${whereSql} ${orderLimitSql}`.trim(),
      params
    );
  } catch (e) {
    console.warn('[patientDirectory] selectPatientRows fallback:', e.message);
    return pool.query(
      `SELECT ${PATIENT_ROW_COLUMNS_MIN} FROM tbl_patient WHERE ${whereSql} ${orderLimitSql}`.trim(),
      params
    );
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
  return /^[A-Za-z]{2,8}-\d{3,8}-[A-Za-z]{2,8}$/i.test(String(q || '').trim());
}

async function setPatientActiveWithCode(poolOrConn, patientId, patientCode) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) return false;
  const code = String(patientCode || '').trim();
  const isPg = poolOrConn?.driver === 'postgres';

  const attempts = [];
  if (isPg) {
    if (code) {
      attempts.push([
        `UPDATE tbl_patient
         SET status = TRUE,
             patient_code = CASE
               WHEN patient_code IS NULL OR TRIM(COALESCE(patient_code, '')) = '' THEN ?
               ELSE patient_code
             END
         WHERE id = ?`,
        [code, pid],
      ]);
      attempts.push([
        `UPDATE tbl_patient
         SET status = 1,
             patient_code = CASE
               WHEN patient_code IS NULL OR TRIM(COALESCE(patient_code, '')) = '' THEN ?
               ELSE patient_code
             END
         WHERE id = ?`,
        [code, pid],
      ]);
    } else {
      attempts.push(['UPDATE tbl_patient SET status = TRUE WHERE id = ?', [pid]]);
      attempts.push(['UPDATE tbl_patient SET status = 1 WHERE id = ?', [pid]]);
    }
  } else if (code) {
    attempts.push([
      `UPDATE tbl_patient
       SET status = 1,
           patient_code = IF(patient_code IS NULL OR TRIM(COALESCE(patient_code, '')) = '', ?, patient_code)
       WHERE id = ?`,
      [code, pid],
    ]);
  } else {
    attempts.push(['UPDATE tbl_patient SET status = 1 WHERE id = ?', [pid]]);
  }

  for (const [sql, params] of attempts) {
    try {
      const [res] = await poolOrConn.query(sql, params);
      const n = res?.affectedRows ?? res?.changedRows ?? res?.rowCount ?? 0;
      if (n > 0) return true;
    } catch (e) {
      console.warn('[patientDirectory] setPatientActiveWithCode:', e.message);
    }
  }
  return false;
}

/** PostgreSQL-safe directory search (avoids MySQL CONCAT/CAST CHAR edge cases). */
function directorySearchWhere(pool, alias = '') {
  const a = alias ? `${alias}.` : '';
  if (pool?.driver === 'postgres') {
    return `(
      LOWER(TRIM(COALESCE(${a}patient_code, ''))) = LOWER(TRIM(?))
      OR COALESCE(${a}patient_code, '') ILIKE ?
      OR COALESCE(${a}first_name, '') ILIKE ?
      OR COALESCE(${a}last_name, '') ILIKE ?
      OR (COALESCE(${a}first_name, '') || ' ' || COALESCE(${a}last_name, '')) ILIKE ?
      OR (COALESCE(${a}last_name, '') || ' ' || COALESCE(${a}first_name, '')) ILIKE ?
      OR COALESCE(${a}phone, '') ILIKE ?
      OR CAST(${a}id AS TEXT) ILIKE ?
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
    return [term, like, like, like, like, like, like, idLike];
  }
  const { patientSearchBindings } = require('./hmsCaseInsensitiveSearch');
  return patientSearchBindings(q);
}

async function fetchPatientById(pool, id, opts = {}) {
  const pid = parseInt(String(id || ''), 10) || 0;
  if (pid < 1) return null;
  const [rows] = await selectPatientRows(pool, 'id = ?', [pid], 'LIMIT 1', opts);
  return mapPatientRow(rows?.[0]);
}

async function fetchPatientByCode(pool, code) {
  const norm = String(code || '').trim();
  if (!norm) return null;
  const [rows] = await pool.query(
    `SELECT ${PATIENT_ROW_COLUMNS_MIN} FROM tbl_patient
     WHERE LOWER(TRIM(COALESCE(patient_code, ''))) = LOWER(TRIM(?))
     ORDER BY id DESC
     LIMIT 1`,
    [norm]
  );
  return mapPatientRow(rows?.[0]);
}

async function repairRecentMisclassifiedPatients(pool) {
  try {
    const inactive = patientInactiveWhere('', pool);
    const [rows] = await pool.query(
      `SELECT id, patient_code FROM tbl_patient
       WHERE ${inactive}
       ORDER BY id DESC
       LIMIT 120`
    );
    for (const row of rows || []) {
      await setPatientActiveWithCode(pool, row.id, row.patient_code);
    }
  } catch (e) {
    console.warn('[patientDirectory] repairRecentMisclassifiedPatients:', e.message);
  }
}

async function repairHighlightedPatientFromQuery(pool, patientId, code) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) return;
  const norm = String(code || '').trim();
  try {
    await setPatientActiveWithCode(pool, pid, looksLikePatientCode(norm) ? norm : '');
    if (norm && looksLikePatientCode(norm)) {
      await pool.query(
        `UPDATE tbl_patient
         SET patient_code = ?
         WHERE id = ?
           AND (patient_code IS NULL OR TRIM(COALESCE(patient_code, '')) = '')`,
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
      await setPatientActiveWithCode(pool, row.id, code);
    }
  } catch (e) {
    console.warn('[patientDirectory] repairPatientsMissingCode:', e.message);
  }
}

async function countActivePatients(pool) {
  const activeWhere = patientActiveWhere('', pool);
  const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM tbl_patient WHERE ${activeWhere}`);
  return parseInt(String(rows?.[0]?.total ?? 0), 10) || 0;
}

async function loadPatientDirectoryInner(pool, opts = {}) {
  await ensurePatientDirectoryColumns(pool);
  await repairPatientsMissingCode(pool);
  await repairRecentMisclassifiedPatients(pool);

  const q = String(opts.q || '').trim();
  const highlightId = parseInt(String(opts.patientId || ''), 10) || 0;
  let patients = [];
  let queryError = null;

  if (highlightId > 0 && q) {
    await repairHighlightedPatientFromQuery(pool, highlightId, q);
  } else if (highlightId > 0) {
    await setPatientActiveWithCode(pool, highlightId, '');
  }

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
  const cols = await patientRowColumns(pool);

  try {
    if (q) {
      const whereSearch = directorySearchWhere(pool);
      const bindings = directorySearchBindings(q, pool);
      const [rows] = await pool.query(
        `SELECT ${cols} FROM tbl_patient
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
        `SELECT ${cols} FROM tbl_patient
         WHERE ${activeWhere}
         ORDER BY id DESC
         LIMIT ?`,
        [PATIENT_LIST_CAP]
      );
      patients = (rows || []).map(mapPatientRow).filter(Boolean);
    }
  } catch (e) {
    queryError = e.message;
    console.error('[patientDirectory] list query failed:', e.message);
    try {
      const [rows] = await pool.query(
        `SELECT ${cols} FROM tbl_patient
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
        `SELECT * FROM tbl_patient ORDER BY id DESC LIMIT ?`,
        [PATIENT_LIST_CAP]
      ).catch(() => [[]]);
      for (const row of rows || []) {
        patients = mergePatientRow(patients, row);
      }
      queryError = e2.message;
      patientTotal = patients.filter((p) => {
        const st = p.status;
        return st == null || st === 1 || st === true || String(st).toLowerCase() === 'true';
      }).length;
    }
  }

  for (const row of highlighted) {
    patients = mergePatientRow(patients, row);
  }

  if (!queryError) {
    patientTotal = await countActivePatients(pool);
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
  await ensurePatientDirectoryColumns(pool).catch(() => {});
  await repairRecentMisclassifiedPatients(pool).catch(() => {});
  const activeWhere = patientActiveWhere('', pool);
  const whereSearch = directorySearchWhere(pool);
  const bindings = directorySearchBindings(term, pool);
  const lim = Math.min(250, Math.max(1, parseInt(String(limit), 10) || 25));
  const cols = await patientRowColumns(pool);
  const pickCols = cols.includes('email')
    ? 'id, first_name, last_name, phone, patient_code'
    : 'id, first_name, last_name, phone, patient_code';
  try {
    const [rows] = await pool.query(
      `SELECT ${pickCols}
       FROM tbl_patient
       WHERE ${activeWhere} AND ${whereSearch}
       ORDER BY id DESC, last_name, first_name
       LIMIT ?`,
      [...bindings, lim]
    );
    return rows || [];
  } catch (e) {
    console.error('[patientDirectory] picker search failed:', e.message);
    const [rows] = await pool.query(
      `SELECT id, first_name, last_name, phone, patient_code
       FROM tbl_patient
       WHERE ${whereSearch}
       ORDER BY id DESC
       LIMIT ?`,
      [...bindings, lim]
    ).catch(() => [[]]);
    return rows || [];
  }
}

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

async function finalizePatientRegistration(conn, patientId, patientCode, statusVal) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) return null;
  const code = String(patientCode || '').trim();
  if (parseInt(statusVal, 10) !== 0) {
    await setPatientActiveWithCode(conn, pid, code);
  }
  const mapped = await fetchPatientById(conn, pid, { ensureSchema: false });
  if (mapped?.id && code && !mapped.patient_code) {
    mapped.patient_code = code;
  }
  return mapped;
}

async function ensurePatientVisibleAfterRegistration(pool, patientId, patientCode) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) return null;
  await repairHighlightedPatientFromQuery(pool, pid, patientCode);
  await repairPatientsMissingCode(pool, 8);
  await setPatientActiveWithCode(pool, pid, patientCode);
  const row = await fetchPatientById(pool, pid);
  if (!row) return null;
  const activeWhere = patientActiveWhere('', pool);
  const [check] = await pool
    .query(`SELECT id FROM tbl_patient WHERE id = ? AND ${activeWhere} LIMIT 1`, [pid])
    .catch(() => [[]]);
  if (!check?.length) {
    console.warn('[patientDirectory] patient still inactive after registration repair, id=', pid);
    await setPatientActiveWithCode(pool, pid, patientCode);
  }
  return row;
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
  patientInactiveWhere,
  ensurePatientDirectoryColumns,
  mapPatientRow,
  fetchPatientById,
  fetchPatientByCode,
  countActivePatients,
  loadPatientDirectory,
  syncPatientIdSequence,
  finalizePatientRegistration,
  resolveInsertPatientId,
  repairHighlightedPatientFromQuery,
  repairPatientsMissingCode,
  ensurePatientVisibleAfterRegistration,
  searchPatientsForPicker,
  directorySearchWhere,
  directorySearchBindings,
  ensurePatientActiveOnRegister,
  patientAddWantsJson,
  respondPatientAdd,
};
