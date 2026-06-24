'use strict';

const { ensureCashierIdentitySchema } = require('./ensureCashierIdentitySchema');

function formatCashierCode(seq) {
  const n = Math.max(1, parseInt(String(seq), 10) || 1);
  return `CA${String(n).padStart(2, '0')}`;
}

function formatCashierIdentity(seq) {
  const n = Math.max(1, parseInt(String(seq), 10) || 1);
  return `Cashier ${String(n).padStart(2, '0')}`;
}

function formatCashierDisplay(row) {
  if (!row) return null;
  const code = row.cashier_code || row.code || '';
  const identity = row.cashier_identity || row.identity || '';
  if (code && identity) return `${code} — ${identity}`;
  return code || identity || null;
}

function parseCodeSequence(code) {
  const m = String(code || '').trim().match(/^CA(\d+)$/i);
  return m ? parseInt(m[1], 10) : 0;
}

function rowToSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.cashier_code,
    identity: row.cashier_identity,
    display: formatCashierDisplay(row),
  };
}

async function fetchCashierRoles(pool) {
  const roles = new Set(['11']);
  try {
    const [portalRows] = await pool.query(
      `SELECT DISTINCT role FROM tbl_acl_role_portal
       WHERE LOWER(TRIM(COALESCE(portal_code,''))) = 'cashier'`
    );
    for (const r of portalRows || []) {
      if (r && r.role != null) roles.add(String(r.role));
    }
  } catch (_) {
    /* ACL table optional on fresh installs */
  }
  return [...roles];
}

async function isCashierRole(pool, roleId) {
  const roles = await fetchCashierRoles(pool);
  return roles.includes(String(roleId ?? '').trim());
}

function formatEmployeeName(row) {
  if (!row) return '';
  const name = `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim();
  return name;
}

async function deactivateCashierForEmployee(pool, employeeId) {
  const uid = parseInt(String(employeeId || ''), 10) || 0;
  if (uid < 1) return false;
  const [r] = await pool
    .query('UPDATE tbl_cashier SET status = 0, updated_at = NOW() WHERE employee_id = ? AND status = 1', [uid])
    .catch(() => [{ affectedRows: 0 }]);
  return (r?.affectedRows || 0) > 0;
}

/**
 * On employee create/update: assign CA## / Cashier ## when role is Cashier; deactivate when not.
 */
async function ensureCashierOnEmployeeSave(pool, employeeId, roleId, opts = {}) {
  const uid = parseInt(String(employeeId || ''), 10) || 0;
  if (uid < 1) return { assigned: null, deactivated: false };
  const facilityId = parseInt(String(opts.facilityId || 1), 10) || 1;
  const status = parseInt(String(opts.status ?? 1), 10) || 0;
  const isCashier = await isCashierRole(pool, roleId);
  if (!isCashier || status !== 1) {
    const deactivated = await deactivateCashierForEmployee(pool, uid);
    return { assigned: null, deactivated };
  }
  const assigned = await assignCashierToEmployee(pool, uid, facilityId);
  return { assigned, deactivated: false };
}

async function listCashierEmployeeIds(pool, facilityId = 1) {
  const roles = await fetchCashierRoles(pool);
  if (!roles.length) return [];
  const placeholders = roles.map(() => '?').join(',');
  const params = [...roles];
  const roleExpr = pool?.driver === 'postgres' ? 'e.role::text' : 'CAST(e.role AS CHAR)';
  let sql = `
    SELECT e.id
      FROM tbl_employee e
     WHERE e.status = 1
       AND ${roleExpr} IN (${placeholders})`;
  // tbl_employee uses default_facility_id on PostgreSQL; legacy MySQL schemas omit facility.
  if (facilityId > 0 && pool?.driver === 'postgres') {
    sql += ' AND (e.default_facility_id IS NULL OR e.default_facility_id = ? OR e.default_facility_id = 0)';
    params.push(facilityId);
  }
  sql += ' ORDER BY e.id ASC';
  const [rows] = await pool.query(sql, params);
  return (rows || []).map((r) => r.id).filter(Boolean);
}

async function maxAssignedSequence(pool, facilityId = 1) {
  const [rows] = await pool
    .query(
      `SELECT cashier_code FROM tbl_cashier
       WHERE facility_id = ? AND status = 1
       ORDER BY id ASC`,
      [facilityId]
    )
    .catch(() => [[]]);
  let max = 0;
  for (const r of rows || []) {
    max = Math.max(max, parseCodeSequence(r.cashier_code));
  }
  return max;
}

async function syncCashierIdentities(pool, opts = {}) {
  await ensureCashierIdentitySchema(pool);
  const facilityId = parseInt(String(opts.facilityId || 1), 10) || 1;
  const employeeIds = await listCashierEmployeeIds(pool, facilityId);
  if (!employeeIds.length) return { created: 0, total: 0 };

  const placeholders = employeeIds.map(() => '?').join(',');
  const [existing] = await pool
    .query(
      `SELECT employee_id FROM tbl_cashier
       WHERE employee_id IN (${placeholders}) AND status = 1`,
      employeeIds
    )
    .catch(() => [[]]);
  const assigned = new Set((existing || []).map((r) => r.employee_id));
  const missing = employeeIds.filter((id) => !assigned.has(id));
  if (!missing.length) return { created: 0, total: employeeIds.length };

  let seq = await maxAssignedSequence(pool, facilityId);
  let created = 0;
  const { optionalInTransaction } = require('./pgTransaction');
  for (const employeeId of missing) {
    seq += 1;
    const cashier_code = formatCashierCode(seq);
    const cashier_identity = formatCashierIdentity(seq);
    const ok = await optionalInTransaction(pool, 'cashier_sync_insert', async () => {
      await pool.query(
        `INSERT INTO tbl_cashier (facility_id, cashier_code, cashier_identity, employee_id, status)
         VALUES (?, ?, ?, ?, 1)`,
        [facilityId, cashier_code, cashier_identity, employeeId]
      );
      return true;
    });
    if (ok) created += 1;
  }
  return { created, total: employeeIds.length };
}

async function assignCashierToEmployee(pool, employeeId, facilityId = 1) {
  const uid = parseInt(String(employeeId || ''), 10) || 0;
  if (uid < 1) return null;
  await ensureCashierIdentitySchema(pool);

  const [[existing]] = await pool
    .query(
      `SELECT id, facility_id, cashier_code, cashier_identity, employee_id, status
         FROM tbl_cashier
        WHERE employee_id = ? AND status = 1
        LIMIT 1`,
      [uid]
    )
    .catch(() => [[null]]);
  if (existing) return existing;

  const fid = parseInt(String(facilityId || 1), 10) || 1;
  const [[emp]] = await pool
    .query('SELECT id FROM tbl_employee WHERE id = ? AND status = 1 LIMIT 1', [uid])
    .catch(() => [[null]]);
  if (!emp) return null;

  let seq = await maxAssignedSequence(pool, fid);
  seq += 1;
  const cashier_code = formatCashierCode(seq);
  const cashier_identity = formatCashierIdentity(seq);

  const { optionalInTransaction } = require('./pgTransaction');
  await optionalInTransaction(pool, 'cashier_assign_insert', async () => {
    await pool.query(
      `INSERT INTO tbl_cashier (facility_id, cashier_code, cashier_identity, employee_id, status)
       VALUES (?, ?, ?, ?, 1)`,
      [fid, cashier_code, cashier_identity, uid]
    );
  });

  const [[assigned]] = await pool
    .query(
      `SELECT id, facility_id, cashier_code, cashier_identity, employee_id, status
         FROM tbl_cashier
        WHERE employee_id = ? AND status = 1
        LIMIT 1`,
      [uid]
    )
    .catch(() => [[null]]);
  return assigned || null;
}

async function resolveCashierForEmployee(pool, employeeId, opts = {}) {
  const uid = parseInt(String(employeeId || ''), 10) || 0;
  if (uid < 1) return null;
  await ensureCashierIdentitySchema(pool);
  const facilityId = parseInt(String(opts.facilityId || 1), 10) || 1;

  const [[row]] = await pool
    .query(
      `SELECT id, facility_id, cashier_code, cashier_identity, employee_id, status
         FROM tbl_cashier
        WHERE employee_id = ? AND status = 1
        LIMIT 1`,
      [uid]
    )
    .catch(() => [[null]]);
  if (row) return row;

  if (opts.autoAssign === false) return null;

  const roles = await fetchCashierRoles(pool);
  const [[emp]] = await pool
    .query('SELECT id, role FROM tbl_employee WHERE id = ? AND status = 1 LIMIT 1', [uid])
    .catch(() => [[null]]);
  if (!emp) return null;
  const roleStr = String(emp.role ?? '');
  if (!roles.includes(roleStr) && !opts.forceAssign) return null;

  await syncCashierIdentities(pool, { facilityId });
  const [[assigned]] = await pool
    .query(
      `SELECT id, facility_id, cashier_code, cashier_identity, employee_id, status
         FROM tbl_cashier
        WHERE employee_id = ? AND status = 1
        LIMIT 1`,
      [uid]
    )
    .catch(() => [[null]]);
  if (assigned) return assigned;

  if (opts.forceAssign) {
    return assignCashierToEmployee(pool, uid, facilityId);
  }
  return null;
}

async function attachCashierToSession(pool, req, opts = {}) {
  if (!req?.session?.user) return null;
  const uid = req.session.userId || req.session.user.id;
  const facilityId = parseInt(String(req.session.facilityId || opts.facilityId || 1), 10) || 1;
  const row = await resolveCashierForEmployee(pool, uid, { facilityId, ...opts });
  const sessionRow = rowToSession(row);
  if (sessionRow) {
    req.session.cashier = sessionRow;
    req.session.user.cashierCode = sessionRow.code;
    req.session.user.cashierIdentity = sessionRow.identity;
    req.session.user.cashierDisplay = sessionRow.display;
  } else {
    delete req.session.cashier;
    delete req.session.user.cashierCode;
    delete req.session.user.cashierIdentity;
    delete req.session.user.cashierDisplay;
  }
  return sessionRow;
}

async function loadCashierMapByEmployeeIds(pool, employeeIds = []) {
  const ids = [...new Set((employeeIds || []).map((id) => parseInt(id, 10)).filter((id) => id > 0))];
  if (!ids.length) return {};
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool
    .query(
      `SELECT id, cashier_code, cashier_identity, employee_id
         FROM tbl_cashier
        WHERE employee_id IN (${placeholders}) AND status = 1`,
      ids
    )
    .catch(() => [[]]);
  const out = {};
  for (const r of rows || []) {
    out[r.employee_id] = {
      id: r.id,
      cashier_code: r.cashier_code,
      cashier_identity: r.cashier_identity,
      display: formatCashierDisplay(r),
    };
  }
  return out;
}

async function resolveCashierDisplayName(pool, employeeId) {
  const row = await resolveCashierForEmployee(pool, employeeId, { autoAssign: false });
  if (row) return formatCashierDisplay(row);
  return null;
}

module.exports = {
  formatCashierCode,
  formatCashierIdentity,
  formatCashierDisplay,
  formatEmployeeName,
  ensureCashierIdentitySchema,
  fetchCashierRoles,
  isCashierRole,
  syncCashierIdentities,
  assignCashierToEmployee,
  ensureCashierOnEmployeeSave,
  deactivateCashierForEmployee,
  resolveCashierForEmployee,
  attachCashierToSession,
  loadCashierMapByEmployeeIds,
  resolveCashierDisplayName,
  rowToSession,
};
