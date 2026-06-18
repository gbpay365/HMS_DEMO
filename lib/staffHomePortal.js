'use strict';

/** Hub portal codes for general physicians (Pattern B default). */
const DOCTOR_HUB_CODES = Object.freeze(['doctor', 'doctors']);

const RADIOLOGY_PORTAL_CODE = 'radiology';

function normSpec(value) {
  return String(value || '').trim();
}

function isDoctorRole(role, doctorRoleIds) {
  const r = String(role != null ? role : '');
  if (!r) return false;
  return (doctorRoleIds || []).some((id) => String(id) === r);
}

/** Doctor whose clinical specialty is radiology / imaging. */
function isRadiologySpecialisation(specialisation) {
  const s = normSpec(specialisation).toLowerCase();
  if (!s) return false;
  return (
    s === 'radiology' ||
    s === 'radiologist' ||
    s.startsWith('radiolog') ||
    s === 'diagnostic imaging' ||
    s === 'imaging'
  );
}

function roleHasPortalCode(rolePortals, code) {
  const want = String(code || '').trim();
  if (!want) return false;
  return (rolePortals || []).some((p) => String(p.portal_code || '').trim() === want);
}

function pickDoctorPortalCode(rolePortals) {
  for (const code of DOCTOR_HUB_CODES) {
    if (roleHasPortalCode(rolePortals, code)) return code;
  }
  return null;
}

function roleDefaultHomePortalCode(rolePortals) {
  const list = rolePortals || [];
  const home = list.find((p) => p.is_home);
  if (home && home.portal_code) return String(home.portal_code);
  if (list[0] && list[0].portal_code) return String(list[0].portal_code);
  return null;
}

/**
 * Pattern B: doctor roles land on `doctor` hub unless specialisation is Radiology
 * and the role may open the radiology portal.
 * Returns null when the role is not a doctor role (caller uses role default).
 */
function resolveDoctorHomePortalCode({ role, specialisation, rolePortals, doctorRoleIds }) {
  const r = String(role != null ? role : '');
  if (!isDoctorRole(r, doctorRoleIds)) return null;

  if (
    isRadiologySpecialisation(specialisation) &&
    roleHasPortalCode(rolePortals, RADIOLOGY_PORTAL_CODE)
  ) {
    return RADIOLOGY_PORTAL_CODE;
  }

  const doctorHub = pickDoctorPortalCode(rolePortals);
  if (doctorHub) return doctorHub;

  return null;
}

/**
 * Effective home portal code for a staff member (doctor Pattern B + role default).
 */
function resolveEffectiveHomePortalCode(role, opts) {
  opts = opts || {};
  const rolePortals = opts.rolePortals || [];
  const doctorRoleIds = opts.doctorRoleIds || [];

  const doctorHome = resolveDoctorHomePortalCode({
    role,
    specialisation: opts.specialisation,
    rolePortals,
    doctorRoleIds,
  });
  if (doctorHome) return doctorHome;

  return roleDefaultHomePortalCode(rolePortals);
}

module.exports = {
  DOCTOR_HUB_CODES,
  RADIOLOGY_PORTAL_CODE,
  normSpec,
  isDoctorRole,
  isRadiologySpecialisation,
  roleHasPortalCode,
  pickDoctorPortalCode,
  roleDefaultHomePortalCode,
  resolveDoctorHomePortalCode,
  resolveEffectiveHomePortalCode,
};
