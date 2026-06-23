'use strict';

const cfg = require('./integrationConfig');
const { getSettings } = require('./facilityIntegrationSettings');
const {
  employeePayloadFromRow,
  isPayrollEmployeeRow,
  employeeDirectoryWhereSql,
} = require('./coreAccountEmployeeSync');

async function postJson(url, body, headers) {
  if (typeof fetch !== 'function') {
    return { ok: false, status: 0, data: { error: 'fetch unavailable' } };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

async function integrationHeaders(pool, facilityId) {
  const fid = parseInt(String(facilityId), 10) || cfg.facilityId();
  const s = await getSettings(pool, fid);
  return {
    'X-API-Key': s.zaizens_api_key_outbound || cfg.zaizensPayrollApiKey(),
    'X-Facility-Id': String(fid),
  };
}

const EMPLOYEE_SELECT_SQL = `
  SELECT e.id, e.role, e.username, e.first_name, e.last_name, e.emailid, e.job_title, e.joining_date, e.status,
         e.employee_id, e.primary_department, e.gender, e.phone, e.address, e.bio, e.password,
         COALESCE(rl.role_title, '') AS role_title,
         COALESCE(pp.sector, 'medical') AS sector
    FROM tbl_employee e
    LEFT JOIN tbl_hms_pay_profile pp ON pp.employee_id = e.id AND pp.facility_id = ?
    LEFT JOIN (
      SELECT CAST(role AS UNSIGNED) AS role_id, MIN(title) AS role_title
      FROM tbl_role GROUP BY CAST(role AS UNSIGNED)
    ) rl ON rl.role_id = CAST(e.role AS UNSIGNED)`;

function zaizensPayloadFromRow(row, event = 'upsert', facilityId = cfg.facilityId()) {
  const base = employeePayloadFromRow(row, event, facilityId);
  return {
    ...base,
    gender: row.gender || '',
    phone: row.phone || '',
    address: row.address || '',
    bio: row.bio || '',
    password_hash: row.password || '',
  };
}

async function syncEmployeeToZaizensPayroll(pool, employeeId, event = 'upsert', facilityId) {
  const fid = parseInt(String(facilityId || cfg.facilityId()), 10) || cfg.facilityId();
  const settings = await getSettings(pool, fid);
  const syncOn = settings.zaizens_sync_enabled === 1 || cfg.isZaizensPayrollSyncEnabled();
  if (!syncOn) return { ok: false, skipped: true, reason: 'disabled' };
  const url = settings.zaizens_url || cfg.zaizensPayrollUrl();
  const key = settings.zaizens_api_key_outbound || cfg.zaizensPayrollApiKey();
  if (!url || !key) return { ok: false, skipped: true, reason: 'missing config' };

  const eid = parseInt(String(employeeId || ''), 10) || 0;
  if (eid < 1) return { ok: false, skipped: true, reason: 'invalid id' };

  const [[row]] = await pool
    .query(`${EMPLOYEE_SELECT_SQL} WHERE e.id=? LIMIT 1`, [fid, eid])
    .catch(() => [[null]]);
  if (!row && event !== 'deleted') return { ok: false, skipped: true, reason: 'not found' };
  if (row && !isPayrollEmployeeRow(row)) event = 'deleted';

  const body = row
    ? zaizensPayloadFromRow(row, event, fid)
    : { event: 'deleted', hms_employee_id: eid, facility_id: fid, is_active: false };

  try {
    const res = await postJson(`${url}/api/v1/integrations/employees`, body, await integrationHeaders(pool, fid));
    return { ok: res.ok, status: res.status, data: res.data };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function syncAllEmployeesToZaizensPayroll(pool, opts = {}) {
  const fid = parseInt(String(opts.facilityId || cfg.facilityId()), 10) || cfg.facilityId();
  const settings = await getSettings(pool, fid);
  const syncOn = settings.zaizens_sync_enabled === 1 || cfg.isZaizensPayrollSyncEnabled();
  if (!syncOn) return { ok: false, skipped: true, reason: 'disabled' };
  const url = settings.zaizens_url || cfg.zaizensPayrollUrl();
  const key = settings.zaizens_api_key_outbound || cfg.zaizensPayrollApiKey();
  if (!url || !key) return { ok: false, skipped: true, reason: 'missing config' };

  const where = employeeDirectoryWhereSql('e');
  const [rows] = await pool
    .query(`${EMPLOYEE_SELECT_SQL} WHERE ${where} ORDER BY e.id ASC`, [fid])
    .catch(() => [[]]);

  const employees = (rows || []).map((row) => zaizensPayloadFromRow(row, 'upsert', fid));
  const body = {
    facility_id: fid,
    replace_all: opts.replaceAll !== false,
    employees,
  };

  const res = await postJson(`${url}/api/v1/integrations/employees/bulk`, body, await integrationHeaders(pool, fid));
  return { ok: res.ok, status: res.status, data: res.data, count: employees.length };
}

module.exports = {
  syncEmployeeToZaizensPayroll,
  syncAllEmployeesToZaizensPayroll,
};
