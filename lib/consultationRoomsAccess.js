'use strict';

/** Roles that may configure consultation rooms without extra ACL grants. */
const MANAGE_ROLES = new Set(['1', '99', '101', '106']);

const MANAGE_PERMS = Object.freeze([
  'access_control.manage',
  'opd.write',
  'nursing.write',
  'scheduling.read',
]);

/**
 * @param {string|number|null|undefined} role
 * @param {string[]} [perms]
 */
function canManageConsultationRooms(role, perms) {
  const r = String(role ?? '').trim();
  if (MANAGE_ROLES.has(r)) return true;
  const p = Array.isArray(perms) ? perms : [];
  if (p.includes('*')) return true;
  return MANAGE_PERMS.some((code) => p.includes(code));
}

module.exports = {
  MANAGE_ROLES,
  MANAGE_PERMS,
  canManageConsultationRooms,
};
