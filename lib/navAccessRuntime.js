'use strict';

const catalog = require('./navAccessCatalog');

/** @type {Map<string, Set<string>>} */
let _grantsByRole = new Map();
/** @type {Map<string, Set<string>>} */
let _denialsByRole = new Map();

function setRoleNavGrants(role, codes) {
  const r = String(role);
  _grantsByRole.set(r, new Set((codes || []).map(String)));
}

function setRoleNavDenials(role, codes) {
  const r = String(role);
  _denialsByRole.set(r, new Set((codes || []).map(String)));
}

function clearNavGrants() {
  _grantsByRole = new Map();
  _denialsByRole = new Map();
}

function roleUsesNavGrants(role) {
  const set = _grantsByRole.get(String(role));
  return !!(set && set.size);
}

function hasNavGrant(role, uiElementCode) {
  const r = String(role);
  const set = _grantsByRole.get(r);
  if (!set || !set.size) return null;

  const ui = String(uiElementCode || '');
  const directBundles = catalog.bundlesForUiCode(ui);
  const denials = _denialsByRole.get(r);

  for (const bc of directBundles) {
    if (set.has(bc)) return true;
  }

  // Explicit child revoke (granted=0) blocks parent-section cascade for this item.
  if (directBundles.some((bc) => denials && denials.has(bc))) return false;

  const parent = catalog.parentTopnavCode(ui);
  if (parent && set.has(parent)) return true;

  for (const code of set) {
    if (denials && denials.has(code)) continue;
    const uiCodes = catalog.uiCodesForBundle(code);
    if (uiCodes.includes(ui)) return true;
  }

  if (ui.startsWith('topnav.') && !ui.includes('.', 7)) {
    const root = catalog.parentTopnavCode(ui + '.x');
    if (root && set.has(root)) return true;
  }

  return false;
}

function allDescendantCodes(navCode) {
  const root = catalog.NAV_ACCESS_TREE.find((n) => n.code === navCode);
  if (!root) {
    const flat = catalog.flatBundles();
    const leaf = flat.find((b) => b.code === navCode);
    return leaf ? [leaf.code] : [];
  }
  const codes = [root.code];
  for (const ch of root.children || []) codes.push(ch.code);
  return codes;
}

module.exports = {
  setRoleNavGrants,
  setRoleNavDenials,
  clearNavGrants,
  roleUsesNavGrants,
  hasNavGrant,
  allDescendantCodes,
};
