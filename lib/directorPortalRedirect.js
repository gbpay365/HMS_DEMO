'use strict';

/** Map legacy management-reports tab/view query to Director portal report id. */
const TAB_TO_REPORT = {
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
};

const EXEC_TABS = new Set(['daily', 'weekly', 'monthly']);

function normalizeTab(req) {
  return String(req.query?.tab || req.query?.view || '')
    .trim()
    .toLowerCase();
}

function hasLegacyForce(req) {
  return String(req.query?.legacy || '') === '1';
}

/** True when GET /management-reports should redirect to the React Director portal. */
function shouldRedirectManagementReportsToPortal(req, options = {}) {
  if (hasLegacyForce(req)) return false;
  const tab = normalizeTab(req);
  if (tab === 'financial') return false;
  if (String(req.query?.report || '').trim()) return false;

  const sections = options.sections;
  if (Array.isArray(sections)) {
    const hasExec = sections.some((s) => EXEC_TABS.has(s.key));
    if (!hasExec) return false;
  }

  if (!tab) return true;
  return EXEC_TABS.has(tab);
}

/** Build /portal/hub/director URL from legacy management-reports query params. */
function directorPortalUrlFromLegacyQuery(req, extraQuery = {}) {
  const tab = normalizeTab(req);
  let report = String(req.query?.report || extraQuery.report || '')
    .trim()
    .toLowerCase();
  if (!report && tab && TAB_TO_REPORT[tab]) report = TAB_TO_REPORT[tab];

  const qs = new URLSearchParams();
  if (report && report !== 'daily') qs.set('report', report);
  const merged = { ...(req.query || {}), ...extraQuery };
  for (const [k, v] of Object.entries(merged)) {
    if (['tab', 'view', 'report', 'legacy'].includes(k)) continue;
    if (v != null && String(v) !== '') qs.set(k, v);
  }
  const q = qs.toString();
  return `/portal/hub/director${q ? `?${q}` : ''}`;
}

/** Landing URL after print / errors — portal for executive tabs, legacy financial catalog otherwise. */
function managementReportsLandingUrl(req, extraQuery = {}) {
  const probe = { query: { ...(req.query || {}), ...extraQuery } };
  if (shouldRedirectManagementReportsToPortal(probe)) {
    return directorPortalUrlFromLegacyQuery(probe, extraQuery);
  }
  const qs = new URLSearchParams({ tab: 'financial', legacy: '1', ...extraQuery });
  return `/management-reports?${qs}`;
}

/** Back link from print view for a given active tab key. */
function managementReportsBackUrl(activeTab) {
  const tab = String(activeTab || '').toLowerCase();
  if (tab === 'financial') return '/management-reports?tab=financial&legacy=1';
  if (EXEC_TABS.has(tab)) {
    const qs = new URLSearchParams();
    if (tab !== 'daily') qs.set('report', tab);
    const q = qs.toString();
    return `/portal/hub/director${q ? `?${q}` : ''}`;
  }
  return '/portal/hub/director';
}

module.exports = {
  shouldRedirectManagementReportsToPortal,
  directorPortalUrlFromLegacyQuery,
  managementReportsLandingUrl,
  managementReportsBackUrl,
};
