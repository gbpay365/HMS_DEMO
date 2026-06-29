'use strict';

const bcrypt = require('bcryptjs');
const { toIsoDatePart } = require('./hmsFormatDate');
const { resolveProfileEmoji } = require('./hmsEmployeeProfile');
const { uploadedStaffPhotoPath } = require('./staffProfilePhotoUpload');

function resolveSessionUserId(req) {
  const raw = req?.session?.userId ?? req?.session?.user?.id ?? null;
  const uid = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(uid) && uid > 0 ? uid : 0;
}

const PROFILE_SELECT_SQL =
  'SELECT id, first_name, last_name, emailid, phone, bio, username, employee_id, role, gender, dob, address, primary_department, profile_emoji, photo_path FROM tbl_employee WHERE id=? LIMIT 1';

function shapeProfileRow(row, roleTitle = '') {
  if (!row) return null;
  return {
    id: row.id,
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    emailid: row.emailid || '',
    phone: row.phone || '',
    bio: row.bio || '',
    username: row.username || '',
    employee_id: row.employee_id || '',
    role: row.role != null ? String(row.role) : '',
    role_title: roleTitle || '',
    gender: row.gender || '',
    dob: row.dob ? toIsoDatePart(row.dob) : '',
    address: row.address || '',
    primary_department: row.primary_department || '',
    profile_emoji: row.profile_emoji || '',
    photo_path: row.photo_path || '',
  };
}

async function loadDepartments(pool) {
  const seen = new Map();
  const add = (label) => {
    const name = String(label || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, { name });
  };

  try {
    const { listDepartments } = require('./hmsOrgClinicalCatalog');
    const rows = await listDepartments(pool);
    for (const row of rows || []) {
      if (row.status === undefined || Number(row.status) === 1) {
        add(row.name || row.department_name);
      }
    }
  } catch (_) {
    /* fall through */
  }

  if (!seen.size) {
    const [rows] = await pool
      .query('SELECT department_name AS name FROM tbl_department WHERE status=1 ORDER BY department_name')
      .catch(() => [[], []]);
    for (const row of rows || []) add(row.name);
  }

  const [linked] = await pool
    .query(
      `SELECT DISTINCT department_name AS name FROM tbl_employee_department
       WHERE department_name IS NOT NULL AND TRIM(department_name) <> ''
       UNION
       SELECT DISTINCT primary_department AS name FROM tbl_employee
       WHERE primary_department IS NOT NULL AND TRIM(primary_department) <> ''`
    )
    .catch(() => [[], []]);
  for (const row of linked || []) add(row.name);

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

async function loadRoleTitle(pool, roleId) {
  const rid = String(roleId ?? '').trim();
  if (!rid) return '';
  const [rows] = await pool
    .query('SELECT title FROM tbl_role WHERE role=? LIMIT 1', [rid])
    .catch(() => [[], []]);
  return rows?.[0]?.title || '';
}

async function loadSelfProfile(pool, req) {
  const uid = resolveSessionUserId(req);
  if (!uid || !pool) return null;
  try {
    const [rows] = await pool.query(PROFILE_SELECT_SQL, [uid]);
    const emp = rows?.[0];
    if (!emp) return null;
    const roleTitle = await loadRoleTitle(pool, emp.role);
    return shapeProfileRow(emp, roleTitle);
  } catch (_) {
    return null;
  }
}

async function loadSelfProfilePayload(pool, req) {
  const uid = resolveSessionUserId(req);
  if (!uid || !pool) return { ok: false, status: 401, error: 'Your session has expired. Please sign in again.' };
  try {
    const [rows] = await pool.query(PROFILE_SELECT_SQL, [uid]);
    const emp = rows?.[0];
    if (!emp) return { ok: false, status: 404, error: 'Profile not found.' };
    const roleTitle = await loadRoleTitle(pool, emp.role);
    const departments = await loadDepartments(pool);
    return {
      ok: true,
      profile: shapeProfileRow(emp, roleTitle),
      form: { departments },
    };
  } catch (e) {
    return { ok: false, status: 500, error: e.message || 'Failed to load profile.' };
  }
}

async function updateSelfProfile(pool, req) {
  const uid = resolveSessionUserId(req);
  if (!uid || !pool) return { ok: false, status: 401, error: 'Your session has expired. Please sign in again.' };

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const [rows] = await pool.query('SELECT * FROM tbl_employee WHERE id=? LIMIT 1', [uid]).catch(() => [[], []]);
  const emp = rows?.[0];
  if (!emp) return { ok: false, status: 404, error: 'Profile not found.' };

  const {
    first_name,
    last_name,
    emailid,
    phone,
    bio,
    pwd,
    gender,
    dob,
    address,
    primary_department,
  } = body;

  const wantsPassword = !!(pwd && String(pwd).trim());
  const wantsProfile =
    first_name !== undefined ||
    last_name !== undefined ||
    emailid !== undefined ||
    phone !== undefined ||
    bio !== undefined ||
    gender !== undefined ||
    dob !== undefined ||
    address !== undefined ||
    primary_department !== undefined ||
    body.profile_emoji !== undefined ||
    req.file ||
    String(body.remove_profile_photo || '') === '1';

  if (!wantsPassword && !wantsProfile) {
    return { ok: false, status: 400, error: 'No changes submitted.' };
  }

  try {
    let passSql = '';
    let passParams = [];
    if (wantsPassword) {
      const hash = await bcrypt.hash(String(pwd).trim(), 10);
      passSql = 'password=?,';
      passParams = [hash];
    }

    const fn = String(first_name != null ? first_name : emp.first_name || '').trim();
    const ln = String(last_name != null ? last_name : emp.last_name || '').trim();
    if (wantsProfile && (!fn || !ln)) {
      return { ok: false, status: 400, error: 'First and last name are required.' };
    }

    const em = emailid !== undefined ? String(emailid || '').trim() : emp.emailid || '';
    const ph = phone !== undefined ? String(phone || '').trim() : emp.phone || '';
    const bi = bio !== undefined ? String(bio || '') : emp.bio || '';
    const gen = gender !== undefined ? String(gender || '').trim() : emp.gender || '';
    const dobVal = dob !== undefined ? (String(dob || '').trim() || null) : emp.dob || null;
    const addr = address !== undefined ? String(address || '') : emp.address || '';
    const dept =
      primary_department !== undefined
        ? String(primary_department || '').trim() || emp.primary_department || ''
        : emp.primary_department || '';

    const profileEmoji = resolveProfileEmoji(
      body.profile_emoji !== undefined ? body.profile_emoji : emp.profile_emoji,
      gen || emp.gender
    );
    const uploadedPhotoPath = uploadedStaffPhotoPath(req.file);
    const removePhoto = String(body.remove_profile_photo || '') === '1';
    const photoSql = uploadedPhotoPath ? ',photo_path=?' : removePhoto ? ',photo_path=NULL' : '';
    const photoParams = uploadedPhotoPath ? [uploadedPhotoPath] : [];

    if (wantsProfile) {
      await pool.query(
        `UPDATE tbl_employee SET first_name=?,last_name=?,emailid=?,phone=?,bio=?,gender=?,dob=?,address=?,primary_department=?,profile_emoji=?${photoSql} WHERE id=?`,
        [fn, ln, em, ph, bi, gen || null, dobVal, addr, dept || null, profileEmoji, ...photoParams, uid]
      );
      req.session.user.name = `${fn} ${ln}`.trim();
      req.session.user.profile_emoji = profileEmoji;
      if (uploadedPhotoPath) req.session.user.photo = uploadedPhotoPath;
      if (removePhoto) req.session.user.photo = null;
      req.session.user.gender = gen || null;
    }

    if (wantsPassword) {
      await pool.query(`UPDATE tbl_employee SET ${passSql.replace(/,$/, '')} WHERE id=?`, [...passParams, uid]);
    }

    const payload = await loadSelfProfilePayload(pool, req);
    if (!payload.ok) return payload;
    return { ok: true, profile: payload.profile, form: payload.form };
  } catch (e) {
    return { ok: false, status: 500, error: e.message || 'Failed to save profile.' };
  }
}

module.exports = {
  PROFILE_SELECT_SQL,
  resolveSessionUserId,
  loadSelfProfile,
  loadSelfProfilePayload,
  updateSelfProfile,
  loadDepartments,
};
