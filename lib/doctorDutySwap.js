'use strict';

const { ensureDoctorDutySchema } = require('./ensureDoctorDutySchema');

function notifyLobby() {
  try {
    require('./opdCallQueueLive').notifyOpdQueueChanged();
  } catch (_) {}
}

async function getDutyRow(db, facilityId, employeeId, dutyDate) {
  const [[row]] = await db
    .query(
      `SELECT * FROM tbl_doctor_duty_schedule
        WHERE facility_id = ? AND employee_id = ? AND duty_date = ?
        LIMIT 1`,
      [facilityId, employeeId, dutyDate]
    )
    .catch(() => [[null]]);
  return row || null;
}

async function upsertDutySnapshot(db, facilityId, employeeId, dutyDate, snapshot) {
  const existing = await getDutyRow(db, facilityId, employeeId, dutyDate);
  const type = snapshot.duty_type || 'off';
  if (existing) {
    await db.query(
      `UPDATE tbl_doctor_duty_schedule
          SET duty_type = ?, start_time = ?, end_time = ?, consultation_room_id = ?, department = ?
        WHERE id = ?`,
      [
        type,
        snapshot.start_time || null,
        snapshot.end_time || null,
        snapshot.consultation_room_id || null,
        snapshot.department || null,
        existing.id,
      ]
    );
    return existing.id;
  }
  const [r] = await db.query(
    `INSERT INTO tbl_doctor_duty_schedule
      (facility_id, employee_id, duty_date, duty_type, start_time, end_time, consultation_room_id, department)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      facilityId,
      employeeId,
      dutyDate,
      type,
      snapshot.start_time || null,
      snapshot.end_time || null,
      snapshot.consultation_room_id || null,
      snapshot.department || null,
    ]
  );
  return r.insertId;
}

function snapshotFromRow(row) {
  if (!row) return { duty_type: 'off', start_time: null, end_time: null, consultation_room_id: null, department: null };
  return {
    duty_type: row.duty_type || 'off',
    start_time: row.start_time || null,
    end_time: row.end_time || null,
    consultation_room_id: row.consultation_room_id || null,
    department: row.department || null,
  };
}

/**
 * Swap duty between requester (from_date) and partner (to_date).
 */
async function applyDutySwap(db, facilityId, requesterId, partnerId, fromDate, toDate) {
  const reqRow = await getDutyRow(db, facilityId, requesterId, fromDate);
  const partnerRow = await getDutyRow(db, facilityId, partnerId, toDate);
  const reqSnap = snapshotFromRow(reqRow);
  const partnerSnap = snapshotFromRow(partnerRow);

  await upsertDutySnapshot(db, facilityId, requesterId, fromDate, partnerSnap);
  await upsertDutySnapshot(db, facilityId, partnerId, toDate, reqSnap);
}

async function createSwapRequest(pool, opts) {
  await ensureDoctorDutySchema(pool);
  const facilityId = parseInt(opts.facilityId, 10) || 1;
  const requesterId = parseInt(opts.requesterId, 10) || 0;
  const partnerId = parseInt(opts.partnerId, 10) || 0;
  const fromDate = String(opts.fromDate || '').slice(0, 10);
  const toDate = String(opts.toDate || '').slice(0, 10);
  const note = String(opts.note || '').slice(0, 500);

  if (requesterId < 1 || partnerId < 1) return { ok: false, error: 'invalid_doctors' };
  if (requesterId === partnerId) return { ok: false, error: 'same_doctor' };
  if (!fromDate || !toDate) return { ok: false, error: 'dates_required' };

  const [[dup]] = await pool
    .query(
      `SELECT id FROM tbl_doctor_duty_swap_request
        WHERE status = 'pending'
          AND requester_id = ? AND partner_id = ? AND from_date = ? AND to_date = ?
        LIMIT 1`,
      [requesterId, partnerId, fromDate, toDate]
    )
    .catch(() => [[null]]);
  if (dup) return { ok: false, error: 'duplicate_request' };

  const [r] = await pool.query(
    `INSERT INTO tbl_doctor_duty_swap_request
      (facility_id, requester_id, partner_id, from_date, to_date, note, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [facilityId, requesterId, partnerId, fromDate, toDate, note || null]
  );
  return { ok: true, id: r.insertId };
}

async function listSwapRequestsForDoctor(pool, doctorId, opts = {}) {
  await ensureDoctorDutySchema(pool);
  const did = parseInt(doctorId, 10) || 0;
  const status = String(opts.status || 'pending');
  const [rows] = await pool
    .query(
      `SELECT s.*,
              req.first_name AS req_fn, req.last_name AS req_ln,
              par.first_name AS par_fn, par.last_name AS par_ln,
              rev.first_name AS rev_fn, rev.last_name AS rev_ln
         FROM tbl_doctor_duty_swap_request s
         JOIN tbl_employee req ON req.id = s.requester_id
         JOIN tbl_employee par ON par.id = s.partner_id
         LEFT JOIN tbl_employee rev ON rev.id = s.reviewed_by
        WHERE (s.requester_id = ? OR s.partner_id = ?)
          AND s.status = ?
        ORDER BY s.created_at DESC
        LIMIT 40`,
      [did, did, status]
    )
    .catch(() => [[]]);
  return (rows || []).map(mapSwapRow);
}

async function listPendingSwapRequests(pool, facilityId) {
  await ensureDoctorDutySchema(pool);
  const fid = parseInt(facilityId, 10) || 1;
  const [rows] = await pool
    .query(
      `SELECT s.*,
              req.first_name AS req_fn, req.last_name AS req_ln,
              par.first_name AS par_fn, par.last_name AS par_ln
         FROM tbl_doctor_duty_swap_request s
         JOIN tbl_employee req ON req.id = s.requester_id
         JOIN tbl_employee par ON par.id = s.partner_id
        WHERE s.facility_id = ? AND s.status = 'pending'
        ORDER BY s.created_at ASC
        LIMIT 80`,
      [fid]
    )
    .catch(() => [[]]);
  return (rows || []).map(mapSwapRow);
}

function mapSwapRow(r) {
  return {
    id: r.id,
    facility_id: r.facility_id,
    requester_id: r.requester_id,
    partner_id: r.partner_id,
    requester_name: `Dr. ${r.req_fn || ''} ${r.req_ln || ''}`.trim(),
    partner_name: `Dr. ${r.par_fn || ''} ${r.par_ln || ''}`.trim(),
    from_date: String(r.from_date || '').slice(0, 10),
    to_date: String(r.to_date || '').slice(0, 10),
    note: r.note || '',
    status: r.status,
    reviewed_by: r.reviewed_by || null,
    reviewer_name: r.rev_fn ? `Dr. ${r.rev_fn} ${r.rev_ln || ''}`.trim() : null,
    reviewed_at: r.reviewed_at || null,
    created_at: r.created_at,
  };
}

async function cancelSwapRequest(pool, id, doctorId) {
  await ensureDoctorDutySchema(pool);
  const rid = parseInt(id, 10) || 0;
  const did = parseInt(doctorId, 10) || 0;
  const [[row]] = await pool
    .query('SELECT * FROM tbl_doctor_duty_swap_request WHERE id = ? LIMIT 1', [rid])
    .catch(() => [[null]]);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status !== 'pending') return { ok: false, error: 'not_pending' };
  if (row.requester_id !== did && row.partner_id !== did) return { ok: false, error: 'forbidden' };
  await pool.query(
    `UPDATE tbl_doctor_duty_swap_request SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
    [rid]
  );
  return { ok: true };
}

async function reviewSwapRequest(pool, id, reviewerId, action) {
  await ensureDoctorDutySchema(pool);
  const rid = parseInt(id, 10) || 0;
  const revId = parseInt(reviewerId, 10) || 0;
  const act = String(action || '').toLowerCase();
  if (!['approve', 'reject'].includes(act)) return { ok: false, error: 'invalid_action' };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      'SELECT * FROM tbl_doctor_duty_swap_request WHERE id = ? FOR UPDATE',
      [rid]
    );
    if (!row) {
      await conn.rollback();
      return { ok: false, error: 'not_found' };
    }
    if (row.status !== 'pending') {
      await conn.rollback();
      return { ok: false, error: 'not_pending' };
    }

    const newStatus = act === 'approve' ? 'approved' : 'rejected';
    await conn.query(
      `UPDATE tbl_doctor_duty_swap_request
          SET status = ?, reviewed_by = ?, reviewed_at = NOW()
        WHERE id = ?`,
      [newStatus, revId, rid]
    );

    if (act === 'approve') {
      await applyDutySwap(
        conn,
        row.facility_id,
        row.requester_id,
        row.partner_id,
        String(row.from_date).slice(0, 10),
        String(row.to_date).slice(0, 10)
      );
    }

    await conn.commit();
    return { ok: true, status: newStatus };
  } catch (e) {
    await conn.rollback().catch(() => {});
    return { ok: false, error: e.message || 'review_failed' };
  } finally {
    conn.release();
  }
}

module.exports = {
  createSwapRequest,
  listSwapRequestsForDoctor,
  listPendingSwapRequests,
  cancelSwapRequest,
  reviewSwapRequest,
  applyDutySwap,
};
