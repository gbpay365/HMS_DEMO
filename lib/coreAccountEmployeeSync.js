'use strict';

const cfg = require('./integrationConfig');
const { getSettings } = require('./facilityIntegrationSettings');
const guard = require('./hmsStaffAccountGuard');
const vd = require('./visitingDoctor');

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
    'X-API-Key': s.core_account_api_key || cfg.coreAccountApiKey(),
    'X-Facility-Id': String(fid),
  };
}

function isPayrollEmployeeRow(row) {
  if (!row) return false;
  const role = String(row.role ?? '').trim();
  if (guard.isSystemUserRole(role)) return false;
  const username = String(row.username || '').trim();
  if (vd.isVisitingDoctorUsername(username)) return false;
  const email = String(row.emailid || row.email || '').trim().toLowerCase();
  if (/^vd\d+@visiting\.local$/i.test(email)) return false;
  const title = String(row.job_title || row.role_title || '').toLowerCase();
  if (title.includes('visiting doctor')) return false;
  return true;
}

function employeeDirectoryWhereSql(alias = 'e') {
  const vdExclude = vd.staffDirectoryExcludeSql(alias);
  return `CAST(${alias}.role AS CHAR) NOT IN ('1','99') AND ${vdExclude} AND LOWER(${alias}.emailid) NOT LIKE 'vd%@visiting.local'`;
}

function employeePayloadFromRow(row, event = 'upsert', facilityId = cfg.facilityId()) {
  const payroll = isPayrollEmployeeRow(row);
  const active = parseInt(String(row.status ?? '1'), 10) !== 0;
  const fid = parseInt(String(facilityId), 10) || cfg.facilityId();
  const payload = {
    event: payroll ? event : 'deleted',
    hms_employee_id: parseInt(String(row.id), 10) || 0,
    facility_id: fid,
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    email: row.emailid || row.email || '',
    job_title: row.job_title || row.role_title || '',
    hire_date: row.joining_date ? String(row.joining_date).slice(0, 10) : null,
    is_active: payroll && active,
    include_in_payroll: payroll,
    hms_role: String(row.role ?? ''),
    hms_username: row.username || '',
    department: row.primary_department || '',
    employee_code: row.employee_id || '',
    industry_sector: row.sector || row.industry_sector || 'medical',
  };
  return payload;
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

async function syncEmployeeToCoreAccount(pool, employeeId, event = 'upsert', facilityId) {
  const fid = parseInt(String(facilityId || cfg.facilityId()), 10) || cfg.facilityId();
  const settings = await getSettings(pool, fid);
  const syncOn = settings.core_account_sync_enabled === 1 || cfg.isIntegrationEnabled();
  if (!syncOn) return { ok: false, skipped: true, reason: 'disabled' };
  const url = settings.core_account_url || cfg.coreAccountUrl();
  const key = settings.core_account_api_key || cfg.coreAccountApiKey();
  if (!url || !key) return { ok: false, skipped: true, reason: 'missing config' };

  const eid = parseInt(String(employeeId || ''), 10) || 0;
  if (eid < 1) return { ok: false, skipped: true, reason: 'invalid id' };

  const [[row]] = await pool
    .query(`${EMPLOYEE_SELECT_SQL} WHERE e.id=? LIMIT 1`, [fid, eid])
    .catch(() => [[null]]);
  if (!row && event !== 'deleted') return { ok: false, skipped: true, reason: 'not found' };
  if (row && !isPayrollEmployeeRow(row)) event = 'deleted';

  const body = row
    ? employeePayloadFromRow(row, event, fid)
    : { event: 'deleted', hms_employee_id: eid, facility_id: fid, is_active: false };

  try {
    const res = await postJson(`${url}/api/v1/integrations/employees`, body, await integrationHeaders(pool, fid));
    const ok = res.ok || res.status === 409;
    const status = ok ? 'sent' : 'failed';
    if (row) {
      await pool
        .query(
          `UPDATE tbl_employee
              SET external_core_sync_status=?, external_core_sync_at=NOW(),
                  external_core_employee_id=?
            WHERE id=?`,
          [status, res.data?.employeeId || res.data?.employee_id || null, eid]
        )
        .catch(() => {});
    }
    return { ok, status: res.status, data: res.data };
  } catch (e) {
    if (row) {
      await pool
        .query(
          `UPDATE tbl_employee SET external_core_sync_status='failed', external_core_sync_at=NOW() WHERE id=?`,
          [eid]
        )
        .catch(() => {});
    }
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * One-way full replication: push all HMS employees to Account_Core and deactivate stale records there.
 */
async function syncAllEmployeesToCoreAccount(pool, opts = {}) {
  const fid = parseInt(String(opts.facilityId || cfg.facilityId()), 10) || cfg.facilityId();
  const settings = await getSettings(pool, fid);
  const syncOn = settings.core_account_sync_enabled === 1 || cfg.isIntegrationEnabled();
  if (!syncOn) return { ok: false, skipped: true, reason: 'disabled' };
  const url = settings.core_account_url || cfg.coreAccountUrl();
  const key = settings.core_account_api_key || cfg.coreAccountApiKey();
  if (!url || !key) return { ok: false, skipped: true, reason: 'missing config' };

  const where = employeeDirectoryWhereSql('e');
  const [rows] = await pool
    .query(`${EMPLOYEE_SELECT_SQL} WHERE ${where} ORDER BY e.id ASC`, [fid])
    .catch(() => [[]]);

  const employees = (rows || []).map((row) => employeePayloadFromRow(row, 'upsert', fid));
  const body = {
    facility_id: fid,
    replace_all: opts.replaceAll !== false,
    employees,
  };

  const res = await postJson(`${url}/api/v1/integrations/employees/bulk`, body, await integrationHeaders(pool, fid));
  if (!res.ok) {
    return { ok: false, status: res.status, data: res.data, count: employees.length };
  }

  const status = 'sent';
  for (const row of rows || []) {
    const eid = parseInt(String(row.id), 10) || 0;
    if (eid < 1) continue;
    await pool
      .query(
        `UPDATE tbl_employee
            SET external_core_sync_status=?, external_core_sync_at=NOW()
          WHERE id=?`,
        [status, eid]
      )
      .catch(() => {});
  }

  return { ok: true, status: res.status, data: res.data, count: employees.length };
}

module.exports = {
  syncEmployeeToCoreAccount,
  syncAllEmployeesToCoreAccount,
  employeePayloadFromRow,
  isPayrollEmployeeRow,
  employeeDirectoryWhereSql,
};
