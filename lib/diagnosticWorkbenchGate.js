'use strict';

const { authorizeServiceCodeValidate } = require('./authorizeLabTest');

const NOT_DISCHARGED =
  "LOWER(TRIM(COALESCE(a.status,''))) NOT IN ('discharged','cancelled','closed')";

function normalizeContext(ctx) {
  return String(ctx || '')
    .trim()
    .toUpperCase();
}

/**
 * IPD / ER orders are billed to the stay — no cashier LAB/RAD code required.
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} alertId
 */
async function isIpdOrErAlert(pool, alertId) {
  const id = parseInt(String(alertId || ''), 10) || 0;
  if (id < 1) return false;
  const [[a]] = await pool
    .query(
      'SELECT context, admission_id, opd_visit_id FROM tbl_clinical_dept_alert WHERE id = ? LIMIT 1',
      [id]
    )
    .catch(() => [[null]]);
  if (!a) return false;
  const ctx = normalizeContext(a.context);
  if (ctx === 'OPD') return false;
  if (ctx === 'IPD' || ctx === 'ER') return true;
  if (a.admission_id) return true;
  if (a.opd_visit_id) {
    const [[v]] = await pool
      .query('SELECT COALESCE(is_emergency,0) AS is_emergency FROM tbl_opd_visit WHERE id = ? LIMIT 1', [
        a.opd_visit_id,
      ])
      .catch(() => [[null]]);
    if (v && Number(v.is_emergency) === 1) return true;
  }
  return false;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} opdOrderItemId
 */
async function isIpdOrErOrderItem(pool, opdOrderItemId) {
  const oid = parseInt(String(opdOrderItemId || ''), 10) || 0;
  if (oid < 1) return false;
  const [[oi]] = await pool
    .query(
      `SELECT oi.patient_id,
              COALESCE(v.is_emergency,0) AS is_emergency,
              adm.id AS admission_id
         FROM tbl_opd_order_item oi
         LEFT JOIN tbl_consultation c ON c.id = oi.consultation_id
         LEFT JOIN tbl_opd_visit v ON v.id = c.opd_visit_id
         LEFT JOIN tbl_admission adm ON adm.patient_id = oi.patient_id AND ${NOT_DISCHARGED}
        WHERE oi.id = ? LIMIT 1`,
      [oid]
    )
    .catch(() => [[null]]);
  if (!oi) return false;
  if (oi.admission_id) return true;
  if (Number(oi.is_emergency) === 1) return true;
  return false;
}

/**
 * Gate structured workbench + template APIs for outpatient paid orders.
 * @param {import('mysql2/promise').Pool} pool
 * @param {{
 *   dept?: string,
 *   code?: string,
 *   opdOrderItemId?: number|string,
 *   alertId?: number|string,
 *   fromAlert?: boolean,
 *   facilityId?: number,
 *   standalone?: boolean,
 * }} opts
 */
async function assertDiagnosticWorkbenchAccess(pool, opts) {
  const dept = String(opts.dept || 'laboratory').toLowerCase() === 'radiology' ? 'radiology' : 'laboratory';
  const prefix = dept === 'radiology' ? 'RAD' : 'LAB';
  const code = String(opts.code || '')
    .trim()
    .toUpperCase();
  const oiId = parseInt(String(opts.opdOrderItemId || ''), 10) || 0;
  const alertId = parseInt(String(opts.alertId || ''), 10) || 0;
  const fid = parseInt(String(opts.facilityId || 1), 10) || 1;
  const fromAlert = !!opts.fromAlert;

  if (opts.standalone) {
    return { ok: true, bypass: true, reason: 'standalone' };
  }

  if (alertId && (await isIpdOrErAlert(pool, alertId))) {
    return { ok: true, bypass: true, reason: 'ipd_er_alert' };
  }
  if (oiId && (await isIpdOrErOrderItem(pool, oiId))) {
    return { ok: true, bypass: true, reason: 'ipd_er_order' };
  }

  if (!code) {
    if (fromAlert || alertId || oiId) {
      return {
        ok: false,
        error: `Validate the ${prefix} service code from the cashier before opening this ${dept === 'radiology' ? 'imaging' : 'lab'} workbench.`,
        code: 'code_required',
        requireValidation: true,
      };
    }
    return { ok: true, bypass: true, reason: 'browse_only' };
  }

  if (!code.startsWith(prefix + '-')) {
    return {
      ok: false,
      error: `Expected ${prefix}-####-XXXXXXXX service code.`,
      code: 'bad_format',
      requireValidation: true,
    };
  }

  const auth = await authorizeServiceCodeValidate(pool, code, fid);
  if (!auth.ok) {
    return {
      ok: false,
      error: auth.error || 'Service code not valid.',
      code: auth.code || 'invalid_code',
      requireValidation: true,
    };
  }
  return { ok: true, bypass: false, code, meta: auth.meta || null };
}

function workbenchParamsFromQuery(query, dept) {
  const q = query || {};
  const code = (q.code || '').toString().trim();
  const oi = parseInt(String(q.oi || ''), 10) || 0;
  const alertId = parseInt(String(q.alert_id || q.alertId || ''), 10) || 0;
  const fromAlert = q.from === 'alert';
  const correction =
    parseInt(String(q.lab_result_id || q.radiology_result_id || ''), 10) || 0;
  const standalone =
    !code &&
    !oi &&
    !alertId &&
    !fromAlert &&
    !correction &&
    q.from !== 'correction';
  return {
    dept,
    code,
    opdOrderItemId: oi,
    alertId,
    fromAlert,
    standalone,
  };
}

module.exports = {
  assertDiagnosticWorkbenchAccess,
  isIpdOrErAlert,
  isIpdOrErOrderItem,
  workbenchParamsFromQuery,
};
