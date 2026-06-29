'use strict';

const aclLayout = require('./aclLayout');
const {
  resolveStaffRoleProfile,
  getCatalog,
  aclPortalForProfile,
  fetchStaffRoleDashboard,
  PROFILE_HOME_URLS,
} = require('./staffRoleMainDashboard');

const PROFILE_PORTALS = new Set([
  'cashier',
  'front_desk',
  'secretary',
  'assistant_director',
  'director',
  'doctor',
  'nurse',
  'laboratory',
  'pharmacy',
  'radiology',
]);

const ROLE_FALLBACK = {
  2: 'doctor',
  4: 'laboratory',
  5: 'pharmacy',
  6: 'radiology',
  7: 'nurse',
  8: 'nurse',
  11: 'cashier',
  3: 'front_desk',
  10: 'front_desk',
  101: 'front_desk',
  103: 'nurse',
  105: 'pharmacy',
};

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function resolveMainDashboardProfile(role, session) {
  const r = String(role || '');
  const home = aclLayout.homePortal(r, aclLayout.homePortalOptsFromSession(session));
  const staffRole = resolveStaffRoleProfile(home, r);
  if (staffRole && PROFILE_PORTALS.has(staffRole)) return staffRole;
  if (home && PROFILE_PORTALS.has(home)) return home;
  if (ROLE_FALLBACK[r]) return ROLE_FALLBACK[r];
  return 'default';
}

function normalizeIcon(icon) {
  const raw = String(icon || 'fa-bar-chart').trim();
  if (!raw) return 'fa-bar-chart';
  return raw.startsWith('fa-') ? raw : `fa-${raw}`;
}

function inferFormat(kpi, profile) {
  if (kpi.format) return kpi.format;
  if (profile === 'cashier') return 'money';
  if (String(kpi.dataKey || '').toLowerCase().includes('revenue')) return 'money';
  return 'number';
}

function defaultHeroKpis(stats) {
  return [
    { id: 'patients', labelKey: 'tiles.patients', value: stats.patients ?? 0, format: 'number', icon: 'fa-users', tone: 'emerald' },
    { id: 'appointments', labelKey: 'tiles.appointments', value: stats.appointments ?? 0, format: 'number', icon: 'fa-calendar-check-o', tone: 'sky' },
    { id: 'inpatients', labelKey: 'tiles.inpatients', value: stats.inpatients ?? 0, format: 'number', icon: 'fa-hospital-o', tone: 'violet' },
    { id: 'doctors', labelKey: 'tiles.doctors', value: stats.doctors ?? 0, format: 'number', icon: 'fa-user-md', tone: 'amber' },
  ];
}

const PROFILE_CONFIG = {
  cashier: {
    portal: 'cashier',
    catalog: () => require('./cashierDashboardCatalog'),
    fetch: async (pool, ctx) => {
      const { fetchCashierDashboard, resolveCashierScope } = require('./cashierDashboard');
      const scope = resolveCashierScope(ctx.req, ctx.res);
      return fetchCashierDashboard(pool, { aclPack: ctx.pack, scope });
    },
  },
  front_desk: {
    portal: 'front_desk',
    catalog: () => require('./frontDeskDashboardCatalog'),
    fetch: async (pool, ctx) => {
      const { fetchFrontDeskDashboard } = require('./frontDeskDashboard');
      return fetchFrontDeskDashboard(pool, { aclPack: ctx.pack });
    },
  },
  secretary: {
    portal: 'secretary',
    catalog: () => require('./secretaryDashboardCatalog'),
    fetch: async (pool, ctx) => {
      const { fetchSecretaryDashboard } = require('./secretaryDashboard');
      return fetchSecretaryDashboard(pool, { aclPack: ctx.pack });
    },
  },
  assistant_director: {
    portal: 'assistant_director',
    catalog: () => require('./assistantDirectorDashboardCatalog'),
    fetch: async (pool, ctx) => {
      const { fetchAssistantDirectorDashboard } = require('./assistantDirectorDashboard');
      const today = todayIso();
      return fetchAssistantDirectorDashboard(pool, { start: today, end: today, period: 'day' }, { aclPack: ctx.pack });
    },
  },
  director: {
    portal: 'director',
    catalog: () => require('./directorDashboardCatalog'),
    fetch: async (pool, ctx) => {
      const { fetchDirectorDailyDashboard } = require('./directorDailyDashboard');
      const today = todayIso();
      return fetchDirectorDailyDashboard(pool, { start: today, end: today, period: 'day' }, { aclPack: ctx.pack });
    },
  },
  doctor: {
    portal: () => aclPortalForProfile('doctor'),
    catalog: () => getCatalog('doctor'),
    fetch: async (pool) => fetchStaffRoleDashboard(pool, 'doctor'),
  },
  nurse: {
    portal: () => aclPortalForProfile('nurse'),
    catalog: () => getCatalog('nurse'),
    fetch: async (pool) => fetchStaffRoleDashboard(pool, 'nurse'),
  },
  laboratory: {
    portal: () => aclPortalForProfile('laboratory'),
    catalog: () => getCatalog('laboratory'),
    fetch: async (pool) => fetchStaffRoleDashboard(pool, 'laboratory'),
  },
  pharmacy: {
    portal: () => aclPortalForProfile('pharmacy'),
    catalog: () => getCatalog('pharmacy'),
    fetch: async (pool) => fetchStaffRoleDashboard(pool, 'pharmacy'),
  },
  radiology: {
    portal: () => aclPortalForProfile('radiology'),
    catalog: () => getCatalog('radiology'),
    fetch: async (pool) => fetchStaffRoleDashboard(pool, 'radiology'),
  },
};

function kpiValueFromData(data, dataKey) {
  const row = data?.kpi?.[dataKey];
  if (row == null) return 0;
  if (typeof row === 'object' && 'value' in row) return row.value;
  return row;
}

function resolvePortalCode(cfg) {
  const portal = cfg.portal;
  return typeof portal === 'function' ? portal() : portal;
}

async function buildMainDashboardHero(pool, req, res, defaultStats) {
  const role = String(req.session?.user?.role || '');
  const perms = res.locals.userPerms || [];
  const profile = resolveMainDashboardProfile(role, req.session);

  if (profile === 'default') {
    return { profile: 'default', heroKpis: defaultHeroKpis(defaultStats), homeUrl: null };
  }

  const cfg = PROFILE_CONFIG[profile];
  if (!cfg) {
    return { profile: 'default', heroKpis: defaultHeroKpis(defaultStats), homeUrl: null };
  }

  const catalogMod = cfg.catalog();
  if (!catalogMod?.buildVisibleDashboardModel) {
    return { profile: 'default', heroKpis: defaultHeroKpis(defaultStats), homeUrl: null };
  }

  const portalCode = resolvePortalCode(cfg);
  const pack = aclLayout.forPortal(portalCode, perms, role) || {};
  const model = catalogMod.buildVisibleDashboardModel(pack);

  if (!model.kpis?.length) {
    return { profile: 'default', heroKpis: defaultHeroKpis(defaultStats), homeUrl: null };
  }

  let data;
  try {
    data = await cfg.fetch(pool, { req, res, pack });
  } catch (e) {
    console.warn('[mainDashboardHero]', profile, e.message);
    return { profile: 'default', heroKpis: defaultHeroKpis(defaultStats), homeUrl: null };
  }

  const heroKpis = model.kpis.map((k) => ({
    id: k.id,
    label: k.label,
    value: kpiValueFromData(data, k.dataKey),
    format: inferFormat(k, profile),
    icon: normalizeIcon(k.icon),
    color: k.color || null,
  }));

  return {
    profile,
    heroKpis,
    homeUrl: PROFILE_HOME_URLS[profile] || null,
  };
}

module.exports = {
  resolveMainDashboardProfile,
  buildMainDashboardHero,
  defaultHeroKpis,
  PROFILE_HOME_URLS,
};
