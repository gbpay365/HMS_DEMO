'use strict';

const hmsDoctorStaff = require('./hmsDoctorStaff');

/**
 * Lobby launcher links: full board, simple board, per-room, per-doctor (on duty today).
 */
async function loadCallQueueLauncherData(pool, facilityId = 1) {
  const today = new Date().toISOString().split('T')[0];
  const fid = parseInt(facilityId, 10) || 1;

  const [rooms] = await pool
    .query(
      `SELECT id, code, name FROM tbl_consultation_room
        WHERE facility_id = ? AND status = 1
        ORDER BY sort_order ASC, id ASC`,
      [fid]
    )
    .catch(() => [[]]);

  const docWhere = hmsDoctorStaff.doctorEmployeeWhereSql();
  const [dutyRows] = await pool
    .query(
      `SELECT d.employee_id AS id, d.duty_type,
              e.first_name, e.last_name,
              cr.name AS room_name, cr.code AS room_code
         FROM tbl_doctor_duty_schedule d
         JOIN tbl_employee e ON e.id = d.employee_id
         LEFT JOIN tbl_consultation_room cr ON cr.id = d.consultation_room_id
        WHERE d.facility_id = ?
          AND d.duty_date = ?
          AND d.duty_type IN ('on_duty', 'night')
          AND ${docWhere}
        ORDER BY e.first_name, e.last_name`,
      [fid, today, ...hmsDoctorStaff.doctorEmployeeWhereParams()]
    )
    .catch(() => [[]]);

  const doctors = (dutyRows || []).map((d) => ({
    id: d.id,
    name: `Dr. ${d.first_name || ''} ${d.last_name || ''}`.trim(),
    duty_type: d.duty_type,
    room_label: d.room_name || d.room_code || null,
    href: `/portal/call-queue/enter?mode=focus&doctor_id=${d.id}`,
  }));

  return {
    today,
    presets: [
      { key: 'full', label: 'Full OPD queue board', href: '/portal/call-queue/enter' },
      { key: 'simple', label: 'Waiting room (simple)', href: '/portal/call-queue/enter?mode=simple' },
    ],
    rooms: (rooms || []).map((r) => ({
      id: r.id,
      label: r.name || r.code || `Room ${r.id}`,
      href: `/portal/call-queue/enter?mode=focus&room_id=${r.id}`,
    })),
    doctors,
  };
}

module.exports = { loadCallQueueLauncherData };
