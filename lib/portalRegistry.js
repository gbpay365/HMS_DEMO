'use strict';

const { BUILTIN_HOME_URLS, ensurePortalSchema } = require('./ensurePortalSchema');

let _byCode = new Map();

async function refresh(pool) {
  if (!pool) return;
  await ensurePortalSchema(pool).catch(() => {});
  try {
    const [rows] = await pool.query(
      `SELECT code, label, sort_order, home_url, icon, color, description, enabled, is_builtin
         FROM tbl_acl_portal
        ORDER BY sort_order, label`
    );
    const map = new Map();
    for (const r of rows || []) {
      map.set(String(r.code), r);
    }
    _byCode = map;
  } catch (_) {
    _byCode = new Map();
  }
}

function getPortal(code) {
  return _byCode.get(String(code || '').trim()) || null;
}

function listPortals() {
  return [..._byCode.values()];
}

function portalUrl(portalCode) {
  const key = String(portalCode || '').trim();
  if (!key) return '/portal/front-desk';
  const row = _byCode.get(key);
  if (row && row.enabled === 0) return '/profile?err=' + encodeURIComponent('This portal is disabled.');
  const url = row && row.home_url ? String(row.home_url).trim() : '';
  if (url) return url;
  if (BUILTIN_HOME_URLS[key]) return BUILTIN_HOME_URLS[key];
  if (row) return `/portal/hub/${key}`;
  return BUILTIN_HOME_URLS.front_desk || '/portal/front-desk';
}

const PORTAL_CODE_ALIASES = Object.freeze({
  doctors: 'doctor',
  nursing: 'nurse',
  laboratory: 'labtech',
  nurse_station: 'nurse',
  nursing_station: 'nurse',
  lab_tech: 'labtech',
});

function normalizePortalCode(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/** Map hub URL slugs (e.g. nurse-station) to tbl_acl_portal.code (e.g. nurse). */
function resolvePortalCode(raw) {
  const c = normalizePortalCode(raw);
  if (_byCode.has(c)) return c;
  return PORTAL_CODE_ALIASES[c] || c;
}

function defaultHomeUrl(code) {
  const c = normalizePortalCode(code);
  if (BUILTIN_HOME_URLS[c]) return BUILTIN_HOME_URLS[c];
  return `/portal/hub/${c}`;
}

module.exports = {
  refresh,
  getPortal,
  listPortals,
  portalUrl,
  normalizePortalCode,
  resolvePortalCode,
  PORTAL_CODE_ALIASES,
  defaultHomeUrl,
  BUILTIN_HOME_URLS,
};
