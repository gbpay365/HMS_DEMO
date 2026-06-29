'use strict';

/** Map legacy product slice keys → UI element code patterns (Phase 1 heuristic). */
const SLICE_RULES = Object.freeze({
  full: { mode: 'all' },
  hms: {
    mode: 'deny',
    codeRe: /^(sb\.(financials|tax_hub|payroll|attendance|wallet_admin|credit|insurance|insurance_claims|procurement|inventory|catalog|payment_validity)|fin\.nav\.|topnav\.hr(?:\.|$)|topnav\.cfg\.(financials|tax|payment_validity|access|super_admin|subscriptions)|topnav\.ops\.(wallet|procurement|inventory|catalog))/,
  },
  accounting: {
    mode: 'allow',
    codeRe: /^(sb\.(home|dashboard|financials|tax_hub|wallet|wallet_admin|credit|insurance|insurance_claims|payment_validity)|fin\.nav\.|topnav\.(configuration|cfg\.))/,
  },
  leave_attendance: {
    mode: 'allow',
    codeRe: /^(sb\.(home|dashboard|employees|hr_|attendance)|topnav\.(hr|hr\.))/,
  },
  payroll: {
    mode: 'allow',
    codeRe: /^(sb\.(home|dashboard|employees|payroll|attendance|hr_)|topnav\.(hr|hr\.))/,
  },
  inventory: {
    mode: 'allow',
    codeRe: /^(sb\.(home|dashboard|inventory|catalog)|topnav\.(operations|ops\.(inventory|catalog)))/,
  },
  procurement: {
    mode: 'allow',
    codeRe: /^(sb\.(home|dashboard|inventory|catalog|procurement)|topnav\.(operations|ops\.(inventory|catalog|procurement)))/,
  },
  assets: {
    mode: 'allow',
    codeRe: /^(sb\.assets|topnav\.ops\.assets)/,
  },
});

function parseSlicesJson(raw) {
  if (!raw) return ['full'];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) return arr.map(String);
  } catch (_) { /* ignore */ }
  return ['full'];
}

function elementAllowedBySlices(code, slices, moduleOverrides) {
  const c = String(code || '');
  if (!c) return true;
  if (c === 'topnav.cfg.country' || c === 'nav.cfg.country') return true;

  if (moduleOverrides && Object.prototype.hasOwnProperty.call(moduleOverrides, c)) {
    const v = moduleOverrides[c];
    if (v === 0 || v === false || v === '0') return false;
    if (v === 1 || v === true || v === '1') return true;
  }

  const list = Array.isArray(slices) ? slices : ['full'];
  if (list.includes('full')) return true;

  let allowed = false;
  for (const slice of list) {
    const rule = SLICE_RULES[slice];
    if (!rule) continue;
    if (rule.mode === 'all') {
      allowed = true;
      break;
    }
    if (rule.mode === 'deny' && rule.codeRe && !rule.codeRe.test(c)) {
      allowed = true;
    }
    if (rule.mode === 'allow' && rule.codeRe && rule.codeRe.test(c)) {
      allowed = true;
    }
  }
  return allowed;
}

/** True if any catalogue code tied to this URL is allowed under deployment slices. */
function urlAllowedBySlices(url, urlToCodes, slices, moduleOverrides) {
  const path = String(url || '').trim().split('?')[0];
  if (!path || path === '__home__') return true;
  const codes = urlToCodes.get(path);
  if (!codes || !codes.length) return true;
  return codes.some((code) => elementAllowedBySlices(code, slices, moduleOverrides));
}

module.exports = {
  parseSlicesJson,
  elementAllowedBySlices,
  urlAllowedBySlices,
  SLICE_RULES,
};
