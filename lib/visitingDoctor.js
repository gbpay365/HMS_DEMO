'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const ACCOUNT_COUNT = 20;
const DEFAULT_PASSWORD = '12345';
const VISITING_DOCTOR_ROLE_NUM = 110;
const VISITING_DOCTOR_ROLE_TITLE = 'Visiting Doctor';

/** @type {readonly string[]} */
const VISITING_DOCTOR_USERNAMES = Object.freeze(
  Array.from({ length: ACCOUNT_COUNT }, (_, i) => `VD${i + 1}`)
);

const USERNAME_SET = new Set(VISITING_DOCTOR_USERNAMES.map((u) => u.toUpperCase()));

function isVisitingDoctorUsername(username) {
  return USERNAME_SET.has(String(username || '').trim().toUpperCase());
}

function normalizeUsername(username) {
  const u = String(username || '').trim().toUpperCase();
  return VISITING_DOCTOR_USERNAMES.find((v) => v.toUpperCase() === u) || null;
}

function placeholderNameForSlot(slot) {
  const n = String(slot).padStart(2, '0');
  return { first: 'Visiting', last: `Doctor ${n}` };
}

function displayDoctorName(row) {
  if (!row) return '';
  const fn = String(row.first_name || '').trim();
  const ln = String(row.last_name || '').trim();
  if (fn === 'Visiting' && /^Doctor\s+\d+$/i.test(ln)) return '';
  return `${fn} ${ln}`.trim();
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntilVisitEnd(endDate) {
  if (!endDate) return null;
  const end = String(endDate).slice(0, 10);
  const today = todayDateOnly();
  const d0 = new Date(`${today}T00:00:00`);
  const d1 = new Date(`${end}T00:00:00`);
  if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) return null;
  return Math.round((d1 - d0) / 86400000);
}

function isAccountInUse(row) {
  if (!row) return false;
  const status = String(row.visiting_account_status || 'idle').toLowerCase();
  if (status === 'idle' || status === 'expired') return false;
  const end = row.visit_end_date ? String(row.visit_end_date).slice(0, 10) : null;
  if (end && end < todayDateOnly()) return false;
  return status === 'claiming' || status === 'active';
}

function accountStatusPayload(row) {
  const username = row?.username || '';
  const inUse = isAccountInUse(row);
  const doctorName = inUse ? displayDoctorName(row) : '';
  const end = row?.visit_end_date ? String(row.visit_end_date).slice(0, 10) : null;
  const daysRemaining = inUse && end ? daysUntilVisitEnd(end) : null;
  return {
    username,
    slot: parseInt(String(username).replace(/^VD/i, ''), 10) || 0,
    status: String(row?.visiting_account_status || 'idle'),
    available: !inUse,
    inUse,
    doctorName: doctorName || null,
    visitEndDate: inUse && end ? end : null,
    visitStartDate: inUse && row?.visit_start_date ? String(row.visit_start_date).slice(0, 10) : null,
    daysRemaining,
    expiringSoon: daysRemaining !== null && daysRemaining <= 1 && daysRemaining >= 0,
    setupInProgress: String(row?.visiting_account_status || '') === 'claiming',
  };
}

function adminAccountPayload(row) {
  const base = accountStatusPayload(row);
  const roomLabel =
    row?.room_code || row?.room_name
      ? [row.room_code, row.room_name].filter(Boolean).join(' — ')
      : null;
  return {
    ...base,
    id: row?.id || null,
    phone: row?.phone || null,
    email: row?.emailid || null,
    department: row?.primary_department || null,
    specialisation: row?.specialisation || null,
    claimedAt: row?.claimed_at || null,
    lastResetAt: row?.last_reset_at || null,
    room: roomLabel,
    roomId: row?.preferred_consultation_room_id || null,
    profileSetupComplete: !!row?.profile_setup_complete,
  };
}

function buildVisitSummary(row, roomRow) {
  if (!row) return null;
  const end = row.visit_end_date ? String(row.visit_end_date).slice(0, 10) : null;
  const daysRemaining = end ? daysUntilVisitEnd(end) : null;
  const room =
    roomRow?.code || roomRow?.name
      ? [roomRow.code, roomRow.name].filter(Boolean).join(' — ')
      : null;
  return {
    username: row.username,
    visitStartDate: row.visit_start_date ? String(row.visit_start_date).slice(0, 10) : null,
    visitEndDate: end,
    daysRemaining,
    expiringSoon: daysRemaining !== null && daysRemaining <= 1 && daysRemaining >= 0,
    department: row.primary_department || null,
    specialisation: row.specialisation || null,
    room,
    status: String(row.visiting_account_status || 'idle'),
  };
}

async function hashDefaultPassword() {
  return bcrypt.hash(DEFAULT_PASSWORD, 10);
}

async function verifyPassword(plain, storedHash) {
  const hash = String(storedHash || '');
  if (!hash) return false;
  if (hash.startsWith('$2y$')) {
    return bcrypt.compare(plain, '$2a$' + hash.slice(4));
  }
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
    return bcrypt.compare(plain, hash);
  }
  return plain === hash;
}

async function resolveVisitingDoctorRoleId(pool) {
  try {
    const [[row]] = await pool.query(
      `SELECT CAST(role AS CHAR) AS role_key FROM tbl_role
        WHERE LOWER(title) = LOWER(?) OR CAST(role AS UNSIGNED) = ?
        ORDER BY role LIMIT 1`,
      [VISITING_DOCTOR_ROLE_TITLE, VISITING_DOCTOR_ROLE_NUM]
    );
    if (row?.role_key != null) return String(row.role_key);
  } catch (_) {
    /* optional */
  }
  return String(VISITING_DOCTOR_ROLE_NUM);
}

async function loadVisitingDoctorByUsername(pool, username) {
  const code = normalizeUsername(username);
  if (!code) return null;
  const [rows] = await pool
    .query(
      `SELECT id, first_name, last_name, username, password, emailid, phone, role, status,
              primary_department, specialisation, visiting_account_status, profile_setup_complete,
              password_must_change, visit_start_date, visit_end_date, claimed_at, last_reset_at,
              preferred_consultation_room_id
         FROM tbl_employee
        WHERE UPPER(username) = UPPER(?) AND status = 1
        LIMIT 1`,
      [code]
    )
    .catch(() => [[]]);
  return rows?.[0] || null;
}

async function listAdminPoolDetails(pool) {
  await resetExpiredAccounts(pool);
  const placeholders = VISITING_DOCTOR_USERNAMES.map(() => '?').join(',');
  const [rows] = await pool
    .query(
      `SELECT e.id, e.first_name, e.last_name, e.username, e.phone, e.emailid,
              e.primary_department, e.specialisation, e.visiting_account_status,
              e.profile_setup_complete, e.password_must_change,
              e.visit_start_date, e.visit_end_date, e.claimed_at, e.last_reset_at,
              e.preferred_consultation_room_id,
              cr.code AS room_code, cr.name AS room_name
         FROM tbl_employee e
         LEFT JOIN tbl_consultation_room cr ON cr.id = e.preferred_consultation_room_id
        WHERE UPPER(e.username) IN (${placeholders}) AND e.status = 1
        ORDER BY CAST(REPLACE(UPPER(e.username), 'VD', '') AS UNSIGNED)`,
      VISITING_DOCTOR_USERNAMES
    )
    .catch(() => [[]]);
  const byUser = new Map((rows || []).map((r) => [String(r.username).toUpperCase(), r]));
  return VISITING_DOCTOR_USERNAMES.map((code) => {
    const row = byUser.get(code.toUpperCase()) || { username: code, visiting_account_status: 'idle' };
    return adminAccountPayload(row);
  });
}

async function listRecentSessionLog(pool, limit = 50) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const [rows] = await pool
    .query(
      `SELECT l.id, l.employee_id, l.username, l.doctor_display_name, l.phone, l.email,
              l.department_name, l.specialisation, l.visit_start_date, l.visit_end_date,
              l.claimed_at, l.released_at,
              cr.code AS room_code, cr.name AS room_name
         FROM tbl_visiting_doctor_session_log l
         LEFT JOIN tbl_consultation_room cr ON cr.id = l.consultation_room_id
        ORDER BY l.id DESC
        LIMIT ?`,
      [lim]
    )
    .catch(() => [[]]);
  return (rows || []).map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    username: row.username,
    doctorName: row.doctor_display_name || null,
    phone: row.phone || null,
    email: row.email || null,
    department: row.department_name || null,
    specialisation: row.specialisation || null,
    visitStartDate: row.visit_start_date ? String(row.visit_start_date).slice(0, 10) : null,
    visitEndDate: row.visit_end_date ? String(row.visit_end_date).slice(0, 10) : null,
    claimedAt: row.claimed_at || null,
    releasedAt: row.released_at || null,
    room:
      row.room_code || row.room_name
        ? [row.room_code, row.room_name].filter(Boolean).join(' — ')
        : null,
  }));
}

async function loadVisitSummaryForEmployee(pool, employeeId) {
  const id = parseInt(employeeId, 10) || 0;
  if (id < 1) return null;
  const [[row]] = await pool
    .query(
      `SELECT id, username, primary_department, specialisation, visiting_account_status,
              visit_start_date, visit_end_date, preferred_consultation_room_id
         FROM tbl_employee WHERE id=? LIMIT 1`,
      [id]
    )
    .catch(() => [[null]]);
  if (!row || !isVisitingDoctorUsername(row.username)) return null;
  let roomRow = null;
  if (row.preferred_consultation_room_id) {
    const [[room]] = await pool
      .query('SELECT code, name FROM tbl_consultation_room WHERE id=? LIMIT 1', [
        row.preferred_consultation_room_id,
      ])
      .catch(() => [[null]]);
    roomRow = room || null;
  }
  return buildVisitSummary(row, roomRow);
}

async function extendVisitEndDate(pool, employeeId, newEndDate) {
  const id = parseInt(employeeId, 10) || 0;
  if (id < 1) throw new Error('Invalid account.');

  const [[row]] = await pool.query('SELECT * FROM tbl_employee WHERE id=? LIMIT 1', [id]).catch(() => [[null]]);
  if (!row || !isVisitingDoctorUsername(row.username)) {
    throw new Error('Not a visiting doctor account.');
  }
  const status = String(row.visiting_account_status || '').toLowerCase();
  if (status !== 'active' || !row.profile_setup_complete) {
    throw new Error('Only active visiting doctors can extend their stay.');
  }

  const end = String(newEndDate || '').slice(0, 10);
  const today = todayDateOnly();
  if (!end || end < today) throw new Error('End date must be today or later.');
  const start = row.visit_start_date ? String(row.visit_start_date).slice(0, 10) : null;
  if (start && end < start) throw new Error('End date cannot be before visit start.');
  const currentEnd = row.visit_end_date ? String(row.visit_end_date).slice(0, 10) : null;
  if (currentEnd && end < currentEnd) {
    throw new Error('New end date must be on or after your current end date.');
  }

  await pool.query('UPDATE tbl_employee SET visit_end_date=? WHERE id=?', [end, id]);
  await pool
    .query(
      `UPDATE tbl_visiting_doctor_session_log
          SET visit_end_date=?
        WHERE employee_id=? AND released_at IS NULL
        ORDER BY id DESC LIMIT 1`,
      [end, id]
    )
    .catch(() => {});

  return { visit_end_date: end, daysRemaining: daysUntilVisitEnd(end) };
}

async function forceReleaseVisitingDoctorAccount(pool, employeeId) {
  const id = parseInt(employeeId, 10) || 0;
  if (id < 1) throw new Error('Invalid account.');
  const [[row]] = await pool
    .query('SELECT id, username, visiting_account_status FROM tbl_employee WHERE id=? LIMIT 1', [id])
    .catch(() => [[null]]);
  if (!row || !isVisitingDoctorUsername(row.username)) {
    throw new Error('Not a visiting doctor account.');
  }
  const status = String(row.visiting_account_status || 'idle').toLowerCase();
  if (status === 'idle') throw new Error('This account is already available.');
  const ok = await resetVisitingDoctorAccount(pool, id);
  if (!ok) throw new Error('Could not release account.');
  return { username: row.username };
}

async function listAccountStatuses(pool) {
  const placeholders = VISITING_DOCTOR_USERNAMES.map(() => '?').join(',');
  const [rows] = await pool
    .query(
      `SELECT id, first_name, last_name, username, visiting_account_status, profile_setup_complete,
              visit_end_date, claimed_at
         FROM tbl_employee
        WHERE UPPER(username) IN (${placeholders}) AND status = 1
        ORDER BY CAST(REPLACE(UPPER(username), 'VD', '') AS UNSIGNED)`,
      VISITING_DOCTOR_USERNAMES
    )
    .catch(() => [[]]);
  const byUser = new Map((rows || []).map((r) => [String(r.username).toUpperCase(), r]));
  return VISITING_DOCTOR_USERNAMES.map((code) => {
    const row = byUser.get(code.toUpperCase()) || { username: code, visiting_account_status: 'idle' };
    return accountStatusPayload(row);
  });
}

async function resetVisitingDoctorAccount(pool, employeeId, { conn } = {}) {
  const q = conn ? conn.query.bind(conn) : pool.query.bind(pool);
  const id = parseInt(employeeId, 10) || 0;
  if (id < 1) return false;

  const [[row]] = await q(
    'SELECT id, username FROM tbl_employee WHERE id=? LIMIT 1',
    [id]
  ).catch(() => [[null]]);
  if (!row || !isVisitingDoctorUsername(row.username)) return false;

  const slot = parseInt(String(row.username).replace(/^VD/i, ''), 10) || 0;
  const placeholder = placeholderNameForSlot(slot);
  const defaultHash = await hashDefaultPassword();

  await q(
    `UPDATE tbl_employee SET
       first_name=?, last_name=?, emailid='', phone='', address='', bio='',
       primary_department=NULL, specialisation=NULL, profile_emoji=NULL,
       password=?, password_must_change=1, profile_setup_complete=0,
       visiting_account_status='idle', visit_start_date=NULL, visit_end_date=NULL,
       claimed_at=NULL, preferred_consultation_room_id=NULL, last_reset_at=NOW()
     WHERE id=?`,
    [placeholder.first, placeholder.last, defaultHash, id]
  );

  await q('DELETE FROM tbl_employee_department WHERE employee_id=?', [id]).catch(() => {});
  await q('DELETE FROM tbl_employee_doctor_specialisation WHERE employee_id=?', [id]).catch(() => {});
  await q('DELETE FROM tbl_consultation_room_doctor WHERE doctor_id=?', [id]).catch(() => {});

  await q(
    `UPDATE tbl_visiting_doctor_session_log
        SET released_at=NOW()
      WHERE employee_id=? AND released_at IS NULL`,
    [id]
  ).catch(() => {});

  return true;
}

async function resetExpiredAccounts(pool) {
  const today = todayDateOnly();
  const [rows] = await pool
    .query(
      `SELECT id FROM tbl_employee
        WHERE UPPER(username) IN (${VISITING_DOCTOR_USERNAMES.map(() => '?').join(',')})
          AND status = 1
          AND visiting_account_status IN ('active', 'claiming', 'expired')
          AND visit_end_date IS NOT NULL
          AND visit_end_date < ?`,
      [...VISITING_DOCTOR_USERNAMES, today]
    )
    .catch(() => [[]]);

  let count = 0;
  for (const row of rows || []) {
    const ok = await resetVisitingDoctorAccount(pool, row.id);
    if (ok) count += 1;
  }
  return count;
}

async function claimAccountOnLogin(pool, employeeId) {
  const tempHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
  const [result] = await pool.query(
    `UPDATE tbl_employee SET
       visiting_account_status='claiming',
       claimed_at=NOW(),
       password=?,
       password_must_change=1
     WHERE id=? AND visiting_account_status='idle'`,
    [tempHash, employeeId]
  );
  return (result?.affectedRows || 0) > 0;
}

async function linkDoctorToConsultationRoom(pool, doctorId, roomId) {
  const did = parseInt(doctorId, 10) || 0;
  const rid = parseInt(roomId, 10) || 0;
  if (did < 1 || rid < 1) return;
  await pool
    .query('INSERT IGNORE INTO tbl_consultation_room_doctor (room_id, doctor_id) VALUES (?, ?)', [rid, did])
    .catch(() => {});
  await pool
    .query(
      `UPDATE tbl_consultation_room SET assigned_doctor_id=?
        WHERE id=? AND (assigned_doctor_id IS NULL OR assigned_doctor_id=0)`,
      [did, rid]
    )
    .catch(() => {});
}

async function completeProfileSetup(pool, employeeId, payload) {
  const id = parseInt(employeeId, 10) || 0;
  if (id < 1) throw new Error('Invalid account');

  const {
    first_name,
    last_name,
    phone,
    emailid,
    primary_department,
    specialisation,
    consultation_room_id,
    visit_start_date,
    visit_end_date,
  } = payload;

  const start = String(visit_start_date || todayDateOnly()).slice(0, 10);
  const end = String(visit_end_date || '').slice(0, 10);
  if (!end || end < todayDateOnly()) {
    throw new Error('Visit end date must be today or later.');
  }

  const {
    syncEmployeeDepartments,
    syncEmployeeSpecialisations,
    ensureEmployeeClinicalLinksSchema,
  } = require('./hmsEmployeeClinicalLinks');
  const { registerDoctorSpecialisation } = require('./hmsDoctorSpecialisations');

  await ensureEmployeeClinicalLinksSchema(pool);
  await registerDoctorSpecialisation(pool, specialisation);

  await pool.query(
    `UPDATE tbl_employee SET
       first_name=?, last_name=?, phone=?, emailid=?,
       primary_department=?, specialisation=?,
       visit_start_date=?, visit_end_date=?,
       visiting_account_status='active',
       profile_setup_complete=1,
       password_must_change=0,
       preferred_consultation_room_id=?
     WHERE id=?`,
    [
      first_name,
      last_name,
      phone,
      emailid,
      primary_department,
      specialisation,
      start,
      end,
      parseInt(consultation_room_id, 10) || null,
      id,
    ]
  );

  await syncEmployeeDepartments(pool, id, [primary_department]);
  await syncEmployeeSpecialisations(pool, id, [specialisation]);
  await linkDoctorToConsultationRoom(pool, id, consultation_room_id);

  await pool
    .query(
      `INSERT INTO tbl_visiting_doctor_session_log
        (employee_id, username, doctor_display_name, phone, email, department_name,
         specialisation, consultation_room_id, visit_start_date, visit_end_date, claimed_at)
       VALUES (?, (SELECT username FROM tbl_employee WHERE id=? LIMIT 1),
               ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        id,
        `${first_name} ${last_name}`.trim(),
        phone,
        emailid,
        primary_department,
        specialisation,
        parseInt(consultation_room_id, 10) || null,
        start,
        end,
      ]
    )
    .catch(() => {});

  return { visit_start_date: start, visit_end_date: end };
}

async function changePassword(pool, employeeId, newPassword) {
  const pwd = String(newPassword || '').trim();
  if (pwd.length < 6) throw new Error('Password must be at least 6 characters.');
  if (pwd === DEFAULT_PASSWORD) throw new Error('You cannot use the default password.');
  const hash = await bcrypt.hash(pwd, 10);
  await pool.query(
    `UPDATE tbl_employee SET password=?, password_must_change=0 WHERE id=?`,
    [hash, employeeId]
  );
}

/**
 * Authenticate a VD account. Returns { ok, error, user, nextPath }.
 */
async function authenticateVisitingDoctor(pool, username, password) {
  await resetExpiredAccounts(pool);

  const row = await loadVisitingDoctorByUsername(pool, username);
  if (!row) {
    return { ok: false, error: 'Invalid username or password.' };
  }

  const inUse = isAccountInUse(row);
  const status = String(row.visiting_account_status || 'idle').toLowerCase();

  if (status === 'idle') {
    const valid = await verifyPassword(password, row.password);
    if (!valid || String(password) !== DEFAULT_PASSWORD) {
      return { ok: false, error: 'Invalid username or password.' };
    }
    const claimed = await claimAccountOnLogin(pool, row.id);
    if (!claimed) {
      const freshRow = await loadVisitingDoctorByUsername(pool, row.username);
      if (freshRow && isAccountInUse(freshRow)) {
        const info = accountStatusPayload(freshRow);
        return {
          ok: false,
          error: `${row.username} is already in use${info.doctorName ? ` by ${info.doctorName}` : ''}${info.visitEndDate ? ` until ${info.visitEndDate}` : ''}.`,
        };
      }
      return { ok: false, error: 'This account is not available. Please choose another.' };
    }
    const [[fresh]] = await pool.query('SELECT * FROM tbl_employee WHERE id=? LIMIT 1', [row.id]);
    return {
      ok: true,
      user: fresh || row,
      nextPath: '/visiting-doctor/setup',
      mustChangePassword: true,
    };
  }

  if (inUse) {
    const valid = await verifyPassword(password, row.password);
    if (!valid) {
      const info = accountStatusPayload(row);
      if (info.inUse && info.doctorName) {
        return {
          ok: false,
          error: `${row.username} is in use by ${info.doctorName}${info.visitEndDate ? ` until ${info.visitEndDate}` : ''}.`,
        };
      }
      return { ok: false, error: 'Invalid username or password.' };
    }

    let nextPath = '/portal/hub/doctor';
    if (row.password_must_change) nextPath = '/visiting-doctor/setup';
    else if (!row.profile_setup_complete) nextPath = '/visiting-doctor/setup';

    return {
      ok: true,
      user: row,
      nextPath,
      mustChangePassword: !!row.password_must_change,
    };
  }

  return { ok: false, error: 'This account is not available. Please choose another.' };
}

function buildSessionUser(user) {
  return {
    id: user.id,
    name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
    username: user.username,
    role: user.role,
    photo: user.photo_path || null,
    specialisation: user.specialisation || null,
    profile_emoji: user.profile_emoji || null,
    gender: user.gender || null,
    isVisitingDoctor: true,
  };
}

function staffDirectoryExcludeSql(alias = 'e') {
  const list = VISITING_DOCTOR_USERNAMES.map((u) => `'${u}'`).join(',');
  return `UPPER(${alias}.username) NOT IN (${list})`;
}

module.exports = {
  ACCOUNT_COUNT,
  DEFAULT_PASSWORD,
  VISITING_DOCTOR_ROLE_NUM,
  VISITING_DOCTOR_ROLE_TITLE,
  VISITING_DOCTOR_USERNAMES,
  isVisitingDoctorUsername,
  normalizeUsername,
  displayDoctorName,
  isAccountInUse,
  accountStatusPayload,
  adminAccountPayload,
  buildVisitSummary,
  daysUntilVisitEnd,
  resolveVisitingDoctorRoleId,
  loadVisitingDoctorByUsername,
  listAccountStatuses,
  listAdminPoolDetails,
  listRecentSessionLog,
  loadVisitSummaryForEmployee,
  extendVisitEndDate,
  forceReleaseVisitingDoctorAccount,
  resetVisitingDoctorAccount,
  resetExpiredAccounts,
  completeProfileSetup,
  changePassword,
  authenticateVisitingDoctor,
  buildSessionUser,
  staffDirectoryExcludeSql,
  linkDoctorToConsultationRoom,
  hashDefaultPassword,
};
