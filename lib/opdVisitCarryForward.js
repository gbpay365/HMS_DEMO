'use strict';

/**
 * Move active OPD visits that were never consulted to today's queue with renewed queue order (first in line).
 */

function toDateISO(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return x.toISOString().split('T')[0];
}

function addDaysISO(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toDateISO(d);
}

async function ensureCarryForwardColumn(pool) {
  await pool
    .query('ALTER TABLE tbl_opd_visit ADD COLUMN IF NOT EXISTS carried_forward_from DATE NULL')
    .catch(() => {});
}

/**
 * @returns {Promise<{ ok: boolean, error?: string, visit?: object }>}
 */
async function loadCarryForwardVisit(pool, visitId, facilityId) {
  const vid = parseInt(String(visitId || ''), 10) || 0;
  const fid = parseInt(String(facilityId || ''), 10) || 1;
  if (vid < 1) return { ok: false, error: 'Invalid visit.' };

  const [[row]] = await pool
    .query(
      `SELECT v.id, v.facility_id, v.patient_id, v.visit_date, v.queue_status, v.is_emergency,
              v.ticket_number, v.queue_started_at,
              (SELECT COUNT(*) FROM tbl_consultation c WHERE c.opd_visit_id = v.id) AS consult_count
         FROM tbl_opd_visit v
        WHERE v.id = ? AND v.facility_id = ?
        LIMIT 1`,
      [vid, fid]
    )
    .catch(() => [[null]]);

  if (!row) return { ok: false, error: 'Visit not found.' };
  return { ok: true, visit: row };
}

function assertEligibleForCarryForward(visit, todayISO) {
  const today = String(todayISO || '').trim();
  const vDate = toDateISO(visit.visit_date);
  if (!vDate || !today) return { ok: false, error: 'Invalid visit date.' };
  if (vDate >= today) return { ok: false, error: 'This visit is already on today’s queue.' };

  const qs = String(visit.queue_status || '').trim();
  if (qs === 'completed' || qs === 'cancelled') {
    return { ok: false, error: 'Completed or cancelled visits cannot be returned to the queue.' };
  }

  const consultCount = parseInt(String(visit.consult_count || ''), 10) || 0;
  if (consultCount > 0) {
    return { ok: false, error: 'This patient was already consulted on that visit. Register a new visit at the cashier if needed.' };
  }

  if (visit.is_emergency == 1 || visit.is_emergency === true || String(visit.is_emergency) === '1') {
    return { ok: false, error: 'Emergency visits use the emergency workflow; they are not carried forward from the OPD registry.' };
  }

  return { ok: true };
}

/**
 * Queue times before any existing today arrivals so carried patients are first.
 * @param {object[]} visitsSorted oldest queue_started_at first
 * @returns {Date[]}
 */
function computeRenewedQueueTimes(visitsSorted, todayISO, todayMinQueueStart) {
  const n = visitsSorted.length;
  if (n < 1) return [];

  let anchorMs;
  if (todayMinQueueStart) {
    const d = todayMinQueueStart instanceof Date ? todayMinQueueStart : new Date(todayMinQueueStart);
    if (!Number.isNaN(d.getTime())) anchorMs = d.getTime();
  }
  if (anchorMs == null) {
    anchorMs = new Date(todayISO + 'T07:00:00').getTime();
  }

  const stepMs = 60 * 1000;
  const times = [];
  for (let i = 0; i < n; i++) {
    times.push(new Date(anchorMs - (n - i) * stepMs));
  }
  return times;
}

/**
 * @param {object} opts
 * @param {string} [opts.onlyVisitDate] if set, only visits on this date (e.g. yesterday)
 * @returns {Promise<{ carried: number, visitIds: number[], fromDate?: string }>}
 */
async function carryForwardUnconsultedVisits(pool, facilityId, todayISO, opts = {}) {
  const fid = parseInt(String(facilityId || ''), 10) || 1;
  const today = String(todayISO || toDateISO(new Date()) || '').trim();
  if (!today) return { carried: 0, visitIds: [] };

  await ensureCarryForwardColumn(pool);

  const onlyDate = opts.onlyVisitDate ? String(opts.onlyVisitDate).trim() : null;
  const params = [fid];
  const dateClause = onlyDate ? 'v.visit_date = ?' : 'v.visit_date < ?';
  params.push(onlyDate || today);

  const [candidates] = await pool
    .query(
      `SELECT v.id, v.visit_date, v.queue_started_at, v.ticket_number
         FROM tbl_opd_visit v
        WHERE v.facility_id = ?
          AND ${dateClause}
          AND v.queue_status NOT IN ('completed', 'cancelled')
          AND COALESCE(v.is_emergency, 0) = 0
          AND NOT EXISTS (SELECT 1 FROM tbl_consultation c WHERE c.opd_visit_id = v.id)
        ORDER BY v.queue_started_at ASC, v.id ASC`,
      params
    )
    .catch(() => [[]]);

  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) return { carried: 0, visitIds: [], fromDate: onlyDate || null };

  const [[minRow]] = await pool
    .query(
      `SELECT MIN(queue_started_at) AS m
         FROM tbl_opd_visit
        WHERE facility_id = ? AND visit_date = ?
          AND queue_status NOT IN ('completed', 'cancelled')`,
      [fid, today]
    )
    .catch(() => [[{ m: null }]]);

  const times = computeRenewedQueueTimes(list, today, minRow && minRow.m);

  const visitIds = [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    const fromDate = toDateISO(v.visit_date);
    const started = times[i] || new Date(today + 'T00:00:01');
    await pool.query(
      `UPDATE tbl_opd_visit
          SET visit_date = ?,
              queue_started_at = ?,
              carried_forward_from = COALESCE(carried_forward_from, ?)
        WHERE id = ? AND facility_id = ?`,
      [today, started, fromDate, v.id, fid]
    );
    visitIds.push(v.id);
  }

  return { carried: visitIds.length, visitIds, fromDate: onlyDate || null };
}

/** Auto-run at start of day: yesterday's unconsulted OPD visits only. */
async function carryForwardYesterdayUnconsulted(pool, facilityId, todayISO) {
  const today = String(todayISO || toDateISO(new Date()) || '').trim();
  const yesterday = addDaysISO(today, -1);
  if (!yesterday) return { carried: 0, visitIds: [] };
  return carryForwardUnconsultedVisits(pool, facilityId, today, { onlyVisitDate: yesterday });
}

/**
 * Manual carry for a single visit (any past date).
 * @returns {Promise<{ ok: boolean, error?: string, ticketNumber?: string }>}
 */
async function carryForwardSingleVisit(pool, visitId, facilityId, todayISO) {
  const today = String(todayISO || toDateISO(new Date()) || '').trim();
  const fid = parseInt(String(facilityId || ''), 10) || 1;
  const vid = parseInt(String(visitId || ''), 10) || 0;
  await ensureCarryForwardColumn(pool);

  const loaded = await loadCarryForwardVisit(pool, vid, fid);
  if (!loaded.ok) return loaded;

  const check = assertEligibleForCarryForward(loaded.visit, today);
  if (!check.ok) return check;

  const [[minRow]] = await pool
    .query(
      `SELECT MIN(queue_started_at) AS m
         FROM tbl_opd_visit
        WHERE facility_id = ? AND visit_date = ?
          AND queue_status NOT IN ('completed', 'cancelled')
          AND id <> ?`,
      [fid, today, vid]
    )
    .catch(() => [[{ m: null }]]);

  const [renewed] = computeRenewedQueueTimes([loaded.visit], today, minRow && minRow.m);
  const started = renewed[0] || new Date(today + 'T00:00:01');
  const fromDate = toDateISO(loaded.visit.visit_date);

  await pool.query(
    `UPDATE tbl_opd_visit
        SET visit_date = ?,
            queue_started_at = ?,
            carried_forward_from = COALESCE(carried_forward_from, ?)
      WHERE id = ? AND facility_id = ?`,
    [today, started, fromDate, vid, fid]
  );

  return { ok: true, ticketNumber: loaded.visit.ticket_number || '' };
}

/** Active OPD row for patient (not completed/cancelled). */
async function findActiveOpdVisitForPatient(pool, patientId, opts = {}) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) return null;
  const excludeEmergency = !!opts.excludeEmergency;
  let sql = `
    SELECT v.id, v.ticket_number, v.queue_status, v.visit_date, v.is_emergency
      FROM tbl_opd_visit v
     WHERE v.patient_id = ?
       AND LOWER(TRIM(COALESCE(v.queue_status,''))) NOT IN ('completed','cancelled')
  `;
  const params = [pid];
  if (excludeEmergency) sql += ' AND COALESCE(v.is_emergency,0) = 0';
  sql += ' ORDER BY v.id DESC LIMIT 1';
  const [[row]] = await pool.query(sql, params).catch(() => [[null]]);
  return row || null;
}

module.exports = {
  toDateISO,
  addDaysISO,
  assertEligibleForCarryForward,
  carryForwardYesterdayUnconsulted,
  carryForwardUnconsultedVisits,
  carryForwardSingleVisit,
  loadCarryForwardVisit,
  findActiveOpdVisitForPatient,
};
