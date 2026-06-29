'use strict';

const bcrypt = require('bcryptjs');
const ensureEmployeeHrSchema = require('./ensureEmployeeHrSchema');
const hmsStaffAccountGuard = require('./hmsStaffAccountGuard');
const {
  listDoctorSpecialisations,
  resolveDoctorRoleIds,
  requireDoctorSpecialisations,
  requireDoctorDepartments,
  registerDoctorSpecialisation,
  isDoctorRoleId,
} = require('./hmsDoctorSpecialisations');
const {
  ensureEmployeeClinicalLinksSchema,
  parseDepartmentsFromBody,
  parseSpecialisationsFromBody,
  primaryLegacyFields,
  syncEmployeeDepartments,
  syncEmployeeSpecialisations,
} = require('./hmsEmployeeClinicalLinks');
const { resolveProfileEmoji } = require('./hmsEmployeeProfile');
const { uploadedStaffPhotoPath } = require('./staffProfilePhotoUpload');

async function replicateEmployeeOut(pool, employeeId, event = 'upsert') {
  try {
    const { syncEmployeeToCoreAccount } = require('./coreAccountEmployeeSync');
    await syncEmployeeToCoreAccount(pool, employeeId, event);
  } catch (_) {
    /* non-blocking */
  }
  try {
    const { syncEmployeeToZaizensPayroll } = require('./zaizensEmployeeSync');
    await syncEmployeeToZaizensPayroll(pool, employeeId, event);
  } catch (_) {
    /* non-blocking */
  }
}

/**
 * Persist employee profile edits (shared by HTML form POST and JSON/multipart API).
 * @returns {Promise<{ ok: true, employeeId: number } | { ok: false, status: number, error: string }>}
 */
async function updateEmployeeProfile(pool, req, employeeId, userPerms = []) {
  const id = parseInt(String(employeeId), 10);
  if (!id) return { ok: false, status: 400, error: 'Invalid employee.' };

  const actorRole = String(req.session.user?.role ?? '');
  const perms = Array.isArray(userPerms) ? userPerms : [];
  const [targetRows] = await pool.query('SELECT id, role FROM tbl_employee WHERE id=? LIMIT 1', [id]).catch(() => [[], []]);
  if (!targetRows?.[0]) return { ok: false, status: 404, error: 'Employee not found.' };

  const targetRole = targetRows[0].role;
  if (hmsStaffAccountGuard.isSystemUserRole(targetRole)) {
    return { ok: false, status: 403, error: 'Manage Admin and Super Admin accounts under System Users.' };
  }
  if (!hmsStaffAccountGuard.canManageEmployeeAccount(actorRole, targetRole)) {
    return { ok: false, status: 403, error: hmsStaffAccountGuard.manageDeniedMessage(actorRole, targetRole) };
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const {
    first_name,
    last_name,
    username,
    emailid,
    pwd,
    dob,
    employee_id,
    joining_date,
    gender,
    phone,
    address,
    bio,
    primary_department,
    role,
    status,
  } = body;

  if (!hmsStaffAccountGuard.canAssignEmployeeRole(actorRole, role)) {
    return { ok: false, status: 403, error: hmsStaffAccountGuard.assignDeniedMessage(actorRole, role) };
  }
  if (hmsStaffAccountGuard.isSystemUserRole(role)) {
    return { ok: false, status: 403, error: 'Admin and Super Admin roles must be managed under System Users.' };
  }

  const hr = { job_title: '', cnps_number: '', tax_niu: '', nic_number: '', bank_name: '', bank_account_no: '' };

  try {
    const doctorRoleIds = await resolveDoctorRoleIds(pool);
    const isDoc = isDoctorRoleId(role, doctorRoleIds);
    let doctorDepartments = [];
    let staffSpecialisations = parseSpecialisationsFromBody(body);
    if (isDoc) {
      doctorDepartments = requireDoctorDepartments(role, body, doctorRoleIds);
      staffSpecialisations = requireDoctorSpecialisations(role, body, doctorRoleIds);
    }
    for (const spec of staffSpecialisations) {
      await registerDoctorSpecialisation(pool, spec);
    }
    const legacyClinical = primaryLegacyFields(
      isDoc && doctorDepartments.length ? doctorDepartments : parseDepartmentsFromBody(body),
      staffSpecialisations
    );
    const specialisation = legacyClinical.specialisation;
    const resolvedPrimaryDepartment = legacyClinical.primary_department || primary_department || '';
    await ensureEmployeeHrSchema(pool);
    await ensureEmployeeClinicalLinksSchema(pool);

    let passField = '';
    let passParam = [];
    const allowPwd = hmsStaffAccountGuard.canManageEmployeePassword(actorRole, targetRole, perms);
    if (allowPwd && pwd && String(pwd).trim()) {
      const hash = await bcrypt.hash(String(pwd).trim(), 10);
      passField = 'password=?,';
      passParam = [hash];
    }

    const profileEmoji = resolveProfileEmoji(body.profile_emoji, gender);
    const uploadedPhotoPath = uploadedStaffPhotoPath(req.file);
    const removePhoto = String(body.remove_profile_photo || '') === '1';
    const photoSql = uploadedPhotoPath ? ',photo_path=?' : removePhoto ? ',photo_path=NULL' : '';
    const photoParams = uploadedPhotoPath ? [uploadedPhotoPath] : [];

    await pool.query(
      `UPDATE tbl_employee SET first_name=?,last_name=?,username=?,emailid=?,${passField}
       dob=?,employee_id=?,joining_date=?,gender=?,address=?,phone=?,bio=?,
       job_title=?,cnps_number=?,tax_niu=?,nic_number=?,bank_name=?,bank_account_no=?,
       primary_department=?,specialisation=?,profile_emoji=?${photoSql},role=?,status=? WHERE id=?`,
      [
        first_name,
        last_name,
        username,
        emailid,
        ...passParam,
        dob || null,
        employee_id,
        joining_date || null,
        gender,
        address || '',
        phone,
        bio || '',
        hr.job_title,
        hr.cnps_number,
        hr.tax_niu,
        hr.nic_number,
        hr.bank_name,
        hr.bank_account_no,
        resolvedPrimaryDepartment,
        specialisation || null,
        profileEmoji,
        ...photoParams,
        parseInt(role, 10) || 2,
        parseInt(status ?? 1, 10),
        id,
      ]
    );

    if (isDoc) {
      await syncEmployeeDepartments(pool, id, doctorDepartments);
    } else {
      await pool.query('DELETE FROM tbl_employee_department WHERE employee_id=?', [id]).catch(() => {});
    }
    if (staffSpecialisations.length) {
      await syncEmployeeSpecialisations(pool, id, staffSpecialisations);
    } else {
      await pool.query('DELETE FROM tbl_employee_doctor_specialisation WHERE employee_id=?', [id]).catch(() => {});
    }

    if (String(req.session.userId || req.session.user?.id || '') === String(id)) {
      req.session.user.profile_emoji = profileEmoji;
      if (uploadedPhotoPath) req.session.user.photo = uploadedPhotoPath;
      if (removePhoto) req.session.user.photo = null;
      req.session.user.gender = gender || null;
      req.session.user.name = `${first_name} ${last_name}`.trim();
    }

    try {
      const { ensureCashierOnEmployeeSave, attachCashierToSession } = require('./cashierIdentity');
      await ensureCashierOnEmployeeSave(pool, id, role, {
        status: parseInt(status ?? 1, 10),
        facilityId: parseInt(req.session.facilityId, 10) || 1,
      });
      if (String(req.session.userId || req.session.user?.id || '') === String(id)) {
        await attachCashierToSession(pool, req, { forceAssign: true });
      }
    } catch (_) {
      /* non-blocking */
    }

    try {
      await replicateEmployeeOut(pool, id, 'upsert');
    } catch (_) {
      /* non-blocking */
    }

    return { ok: true, employeeId: id };
  } catch (e) {
    return { ok: false, status: 400, error: e.message || 'Could not save employee.' };
  }
}

module.exports = {
  updateEmployeeProfile,
};
