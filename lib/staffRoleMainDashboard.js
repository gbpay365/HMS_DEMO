'use strict';

const { getHubStats } = require('./hmsClinicalHub');
const {
  loadLowStockDrugs,
  loadExpiringSoonDrugs,
  countMedicineReturns,
} = require('./pharmacyDashboard');

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function permWithFallback(perm, shared) {
  return `${perm}|${shared}`;
}

function buildCatalogFromSpec(spec) {
  const TAB_DEFS = [spec.tab];
  const KPI_DEFS = spec.kpis;
  const KPI_BY_CODE = new Map(KPI_DEFS.map((r) => [r.code, r]));

  function aclUiElements() {
    const rows = [
      [
        spec.sectionCode,
        spec.aclPortal,
        'section',
        spec.sectionLabel,
        null,
        null,
        null,
        spec.sharedPerm,
        1,
        null,
      ],
      [
        spec.tab.code,
        spec.aclPortal,
        'section',
        spec.tab.label,
        null,
        null,
        null,
        permWithFallback(spec.tab.perm, spec.sharedPerm),
        spec.tab.sort,
        spec.sectionCode,
      ],
    ];
    for (const kpi of KPI_DEFS) {
      rows.push([
        kpi.code,
        spec.aclPortal,
        'stat',
        kpi.label,
        null,
        kpi.icon,
        kpi.color,
        permWithFallback(kpi.perm, spec.sharedPerm),
        kpi.sort,
        spec.tab.code,
      ]);
    }
    return rows;
  }

  function codesForWidgets(visible) {
    const codes = new Set();
    for (const item of visible || []) {
      if (item?.code) codes.add(String(item.code));
    }
    return codes;
  }

  function buildVisibleDashboardModel(aclPack) {
    const sections = aclPack.sections || [];
    const stats = aclPack.stats || [];
    const allCodes = codesForWidgets([...sections, ...stats]);
    const hasShell = allCodes.has(spec.sectionCode) || KPI_DEFS.some((k) => allCodes.has(k.code));
    const kpis = KPI_DEFS.filter((def) => allCodes.has(def.code)).map((k) => ({
      ...k,
      label: k.label || stats.find((s) => s.code === k.code)?.label,
    }));
    if (hasShell) {
      const seen = new Set(kpis.map((k) => k.code));
      for (const def of KPI_DEFS) {
        if (!seen.has(def.code)) {
          kpis.push({ ...def });
          seen.add(def.code);
        }
      }
      kpis.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    }
    return {
      hasShell,
      tabs: hasShell ? [{ id: spec.tab.id, label: spec.tab.label }] : [],
      kpis: hasShell ? kpis : [],
      panels: [],
      allCodes,
    };
  }

  const ALL_PERMISSIONS = [
    [spec.readPerm, `${spec.sectionLabel} (all widgets)`, spec.module],
    [spec.tab.perm, `${spec.profile} tab — ${spec.tab.label}`, spec.module],
    ...KPI_DEFS.map((k) => [k.perm, `${spec.profile} KPI — ${k.id}`, spec.module]),
  ];

  return {
    TAB_DEFS,
    KPI_DEFS,
    KPI_BY_CODE,
    aclUiElements,
    buildVisibleDashboardModel,
    ALL_PERMISSIONS,
    widgetPrefix: spec.widgetPrefix,
  };
}

const DOCTOR_SPEC = {
  profile: 'doctor',
  aclPortal: 'doctors',
  module: 'doctor',
  sectionCode: 'doc.section.dashboard',
  sectionLabel: 'Doctor dashboard',
  readPerm: 'doctor.dashboard.read',
  sharedPerm: 'doctor.dashboard.read|clinical.read|clinical.write|dashboard.read',
  widgetPrefix: 'doc.',
  tab: { id: 'today', code: 'doc.tab.today', perm: 'doctor.dashboard.tab.today', label: 'Today', sort: 10 },
  kpis: [
    { id: 'appts_today', code: 'doc.kpi.appts_today', perm: 'doctor.dashboard.kpi.appts', label: 'Appointments today', tab: 'today', dataKey: 'apptsToday', format: 'number', icon: 'fa-calendar-check-o', color: '#4338ca', sort: 10 },
    { id: 'in_consultation', code: 'doc.kpi.in_consultation', perm: 'doctor.dashboard.kpi.consultation', label: 'In consultation', tab: 'today', dataKey: 'inConsultation', format: 'number', icon: 'fa-stethoscope', color: '#0c8b8b', sort: 20 },
    { id: 'waiting_patients', code: 'doc.kpi.waiting_patients', perm: 'doctor.dashboard.kpi.waiting', label: 'Waiting for doctor', tab: 'today', dataKey: 'waitingPatients', format: 'number', icon: 'fa-clock-o', color: '#f59e0b', sort: 30 },
    { id: 'pending_orders', code: 'doc.kpi.pending_orders', perm: 'doctor.dashboard.kpi.orders', label: 'Pending orders', tab: 'today', dataKey: 'pendingOrders', format: 'number', icon: 'fa-list-alt', color: '#dc2626', sort: 40 },
    { id: 'lab_pending', code: 'doc.kpi.lab_pending', perm: 'doctor.dashboard.kpi.lab', label: 'Lab pending', tab: 'today', dataKey: 'labPending', format: 'number', icon: 'fa-flask', color: '#7c3aed', sort: 50 },
    { id: 'ipd_active', code: 'doc.kpi.ipd_active', perm: 'doctor.dashboard.kpi.ipd', label: 'Active inpatients', tab: 'today', dataKey: 'ipdActive', format: 'number', icon: 'fa-bed', color: '#0891b2', sort: 60 },
  ],
};

const NURSE_SPEC = {
  profile: 'nurse',
  aclPortal: 'nursing',
  module: 'nursing',
  sectionCode: 'nur.section.dashboard',
  sectionLabel: 'Nursing dashboard',
  readPerm: 'nurse.dashboard.read',
  sharedPerm: 'nurse.dashboard.read|nursing.read|nursing.write|dashboard.read',
  widgetPrefix: 'nur.',
  tab: { id: 'today', code: 'nur.tab.today', perm: 'nurse.dashboard.tab.today', label: 'Today', sort: 10 },
  kpis: [
    { id: 'vitals_pending', code: 'nur.kpi.vitals_pending', perm: 'nurse.dashboard.kpi.vitals', label: 'Vitals pending', tab: 'today', dataKey: 'vitalsPending', format: 'number', icon: 'fa-heartbeat', color: '#ec4899', sort: 10 },
    { id: 'opd_waiting', code: 'nur.kpi.opd_waiting', perm: 'nurse.dashboard.kpi.opd', label: 'OPD waiting', tab: 'today', dataKey: 'opdWaiting', format: 'number', icon: 'fa-users', color: '#1a6bd8', sort: 20 },
    { id: 'ipd_active', code: 'nur.kpi.ipd_active', perm: 'nurse.dashboard.kpi.ipd', label: 'Active inpatients', tab: 'today', dataKey: 'ipdActive', format: 'number', icon: 'fa-bed', color: '#0891b2', sort: 30 },
    { id: 'er_active', code: 'nur.kpi.er_active', perm: 'nurse.dashboard.kpi.er', label: 'Emergency active', tab: 'today', dataKey: 'erActive', format: 'number', icon: 'fa-ambulance', color: '#dc2626', sort: 40 },
    { id: 'appointments_today', code: 'nur.kpi.appointments_today', perm: 'nurse.dashboard.kpi.appts', label: 'Appointments today', tab: 'today', dataKey: 'appointmentsToday', format: 'number', icon: 'fa-calendar', color: '#f59e0b', sort: 50 },
    { id: 'lab_pending', code: 'nur.kpi.lab_pending', perm: 'nurse.dashboard.kpi.lab', label: 'Lab pending', tab: 'today', dataKey: 'labPending', format: 'number', icon: 'fa-flask', color: '#8b5cf6', sort: 60 },
  ],
};

const LAB_SPEC = {
  profile: 'laboratory',
  aclPortal: 'laboratory',
  module: 'lab',
  sectionCode: 'lab.section.dashboard',
  sectionLabel: 'Laboratory dashboard',
  readPerm: 'lab.dashboard.read',
  sharedPerm: 'lab.dashboard.read|lab.read|lab.write|dashboard.read',
  widgetPrefix: 'lab.',
  tab: { id: 'today', code: 'lab.tab.today', perm: 'lab.dashboard.tab.today', label: 'Today', sort: 10 },
  kpis: [
    { id: 'pending', code: 'lab.kpi.pending', perm: 'lab.dashboard.kpi.pending', label: 'Pending requests', tab: 'today', dataKey: 'pending', format: 'number', icon: 'fa-clock-o', color: '#f59e0b', sort: 10 },
    { id: 'in_progress', code: 'lab.kpi.in_progress', perm: 'lab.dashboard.kpi.progress', label: 'In progress', tab: 'today', dataKey: 'inProgress', format: 'number', icon: 'fa-spinner', color: '#0ea5e9', sort: 20 },
    { id: 'completed_today', code: 'lab.kpi.completed_today', perm: 'lab.dashboard.kpi.completed', label: 'Completed today', tab: 'today', dataKey: 'completedToday', format: 'number', icon: 'fa-check-circle', color: '#16a34a', sort: 30 },
    { id: 'opd_orders', code: 'lab.kpi.opd_orders', perm: 'lab.dashboard.kpi.opd', label: 'OPD lab orders', tab: 'today', dataKey: 'opdOrders', format: 'number', icon: 'fa-list-alt', color: '#7c3aed', sort: 40 },
    { id: 'validate_queue', code: 'lab.kpi.validate_queue', perm: 'lab.dashboard.kpi.validate', label: 'Awaiting validation', tab: 'today', dataKey: 'validateQueue', format: 'number', icon: 'fa-qrcode', color: '#dc2626', sort: 50 },
  ],
};

const PHARMACY_SPEC = {
  profile: 'pharmacy',
  aclPortal: 'pharmacy',
  module: 'pharmacy',
  sectionCode: 'pha.section.dashboard',
  sectionLabel: 'Pharmacy dashboard',
  readPerm: 'pharmacy.dashboard.read',
  sharedPerm: 'pharmacy.dashboard.read|pharmacy.read|pharmacy.write|dashboard.read',
  widgetPrefix: 'pha.',
  tab: { id: 'today', code: 'pha.tab.today', perm: 'pharmacy.dashboard.tab.today', label: 'Today', sort: 10 },
  kpis: [
    { id: 'queue_pending', code: 'pha.kpi.queue_pending', perm: 'pharmacy.dashboard.kpi.queue', label: 'Dispense queue', tab: 'today', dataKey: 'queuePending', format: 'number', icon: 'fa-medkit', color: '#16a34a', sort: 10 },
    { id: 'rx_pending', code: 'pha.kpi.rx_pending', perm: 'pharmacy.dashboard.kpi.rx', label: 'Prescriptions pending', tab: 'today', dataKey: 'rxPending', format: 'number', icon: 'fa-file-text-o', color: '#0ea5e9', sort: 20 },
    { id: 'low_stock', code: 'pha.kpi.low_stock', perm: 'pharmacy.dashboard.kpi.stock', label: 'Low stock items', tab: 'today', dataKey: 'lowStock', format: 'number', icon: 'fa-exclamation-triangle', color: '#f59e0b', sort: 30 },
    { id: 'expiring_soon', code: 'pha.kpi.expiring_soon', perm: 'pharmacy.dashboard.kpi.expiry', label: 'Expiring soon', tab: 'today', dataKey: 'expiringSoon', format: 'number', icon: 'fa-calendar-times-o', color: '#dc2626', sort: 40 },
    { id: 'returns', code: 'pha.kpi.returns', perm: 'pharmacy.dashboard.kpi.returns', label: 'Medicine returns', tab: 'today', dataKey: 'returns', format: 'number', icon: 'fa-undo', color: '#475569', sort: 50 },
  ],
};

const RADIOLOGY_SPEC = {
  profile: 'radiology',
  aclPortal: 'radiology',
  module: 'radiology',
  sectionCode: 'rad.section.dashboard',
  sectionLabel: 'Radiology dashboard',
  readPerm: 'radiology.dashboard.read',
  sharedPerm: 'radiology.dashboard.read|radiology.read|radiology.write|dashboard.read',
  widgetPrefix: 'rad.',
  tab: { id: 'today', code: 'rad.tab.today', perm: 'radiology.dashboard.tab.today', label: 'Today', sort: 10 },
  kpis: [
    { id: 'pending', code: 'rad.kpi.pending', perm: 'radiology.dashboard.kpi.pending', label: 'Pending exams', tab: 'today', dataKey: 'pending', format: 'number', icon: 'fa-clock-o', color: '#f59e0b', sort: 10 },
    { id: 'in_progress', code: 'rad.kpi.in_progress', perm: 'radiology.dashboard.kpi.progress', label: 'In progress', tab: 'today', dataKey: 'inProgress', format: 'number', icon: 'fa-spinner', color: '#0ea5e9', sort: 20 },
    { id: 'completed_today', code: 'rad.kpi.completed_today', perm: 'radiology.dashboard.kpi.completed', label: 'Completed today', tab: 'today', dataKey: 'completedToday', format: 'number', icon: 'fa-check-circle', color: '#16a34a', sort: 30 },
    { id: 'awaiting_report', code: 'rad.kpi.awaiting_report', perm: 'radiology.dashboard.kpi.report', label: 'Awaiting report', tab: 'today', dataKey: 'awaitingReport', format: 'number', icon: 'fa-file-text-o', color: '#8b5cf6', sort: 40 },
    { id: 'validate_queue', code: 'rad.kpi.validate_queue', perm: 'radiology.dashboard.kpi.validate', label: 'Awaiting validation', tab: 'today', dataKey: 'validateQueue', format: 'number', icon: 'fa-qrcode', color: '#dc2626', sort: 50 },
  ],
};

const PROFILE_SPECS = {
  doctor: DOCTOR_SPEC,
  nurse: NURSE_SPEC,
  laboratory: LAB_SPEC,
  pharmacy: PHARMACY_SPEC,
  radiology: RADIOLOGY_SPEC,
};

const CATALOGS = Object.fromEntries(
  Object.entries(PROFILE_SPECS).map(([key, spec]) => [key, buildCatalogFromSpec(spec)])
);

const HOME_PORTAL_ALIASES = Object.freeze({
  doctor: 'doctor',
  doctors: 'doctor',
  nurse: 'nurse',
  nursing: 'nurse',
  labtech: 'laboratory',
  laboratory: 'laboratory',
  pharmacy: 'pharmacy',
  radiology: 'radiology',
});

const ROLE_HOME_FALLBACK = Object.freeze({
  2: 'doctor',
  4: 'laboratory',
  5: 'pharmacy',
  6: 'radiology',
  7: 'nurse',
  8: 'nurse',
  103: 'nurse',
  105: 'pharmacy',
});

const PROFILE_HOME_URLS = Object.freeze({
  doctor: '/portal/doctor',
  nurse: '/portal/nurse',
  laboratory: '/portal/lab',
  pharmacy: '/portal/pharmacy',
  radiology: '/portal/radiology',
  cashier: '/cashier?page=dashboard',
  secretary: '/portal/hub/secretary',
  director: '/portal/hub/director',
  front_desk: '/portal/front-desk',
  assistant_director: '/portal/hub/assistant_director',
});

async function q1(pool, sql, params = []) {
  const [[row]] = await pool.query(sql, params).catch(() => [[{ c: 0 }]]);
  return row || {};
}

async function fetchDoctorDashboard(pool) {
  const today = todayIso();
  const hub = await getHubStats(pool);
  const waiting = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_visit
      WHERE visit_date = ?
        AND queue_status IN ('registered','triage','waiting_doctor','orders_pending')`,
    [today]
  );
  return {
    kpi: {
      apptsToday: { value: n(hub.appointments_today) },
      inConsultation: { value: n(hub.in_consult) },
      waitingPatients: { value: n(waiting.c) },
      pendingOrders: { value: n(hub.pending_orders) },
      labPending: { value: n(hub.lab_open) },
      ipdActive: { value: n(hub.ipd_active) },
    },
  };
}

async function fetchNurseDashboard(pool) {
  const today = todayIso();
  const hub = await getHubStats(pool);
  const vitals = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_visit
      WHERE visit_date = ? AND queue_status IN ('registered','triage')`,
    [today]
  );
  const er = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_visit
      WHERE visit_date = ?
        AND (department LIKE '%Emergency%' OR department LIKE '%A&E%')
        AND queue_status NOT IN ('completed','cancelled')`,
    [today]
  );
  const opdWaiting = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_visit
      WHERE visit_date = ?
        AND queue_status NOT IN ('completed','cancelled','in_consultation')`,
    [today]
  );
  return {
    kpi: {
      vitalsPending: { value: n(vitals.c) },
      opdWaiting: { value: n(opdWaiting.c) },
      ipdActive: { value: n(hub.ipd_active) },
      erActive: { value: n(er.c) },
      appointmentsToday: { value: n(hub.appointments_today) },
      labPending: { value: n(hub.lab_open) },
    },
  };
}

async function fetchLaboratoryDashboard(pool) {
  const today = todayIso();
  const pending = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_order_item
      WHERE LOWER(TRIM(item_type)) = 'laboratory'
        AND status IN ('pending','paid')`
  );
  const inProgress = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_order_item
      WHERE LOWER(TRIM(item_type)) = 'laboratory'
        AND status = 'in_progress'`
  );
  const completed = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_lab_result WHERE DATE(COALESCE(validated_at, created_at)) = ?`,
    [today]
  );
  const opdOrders = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_order_item oi
      JOIN tbl_opd_visit v ON v.id = oi.visit_id
     WHERE v.visit_date = ?
       AND LOWER(TRIM(oi.item_type)) = 'laboratory'
       AND oi.status NOT IN ('completed','cancelled','refunded')`,
    [today]
  );
  const validate = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_order_item
      WHERE LOWER(TRIM(item_type)) = 'laboratory'
        AND status IN ('pending','paid')`
  );
  let pendingVal = n(pending.c);
  if (!pendingVal) {
    const labReq = await q1(
      pool,
      `SELECT COUNT(*) AS c FROM tbl_lab_request WHERE status IN ('submitted','accepted','in_progress')`
    );
    pendingVal = n(labReq.c);
  }
  return {
    kpi: {
      pending: { value: pendingVal },
      inProgress: { value: n(inProgress.c) },
      completedToday: { value: n(completed.c) },
      opdOrders: { value: n(opdOrders.c) },
      validateQueue: { value: n(validate.c) || pendingVal },
    },
  };
}

async function fetchPharmacyDashboard(pool) {
  const queue = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_order_item
      WHERE LOWER(TRIM(item_type)) = 'pharmacy'
        AND status IN ('pending','paid','in_progress')`
  );
  const rx = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_prescription
      WHERE LOWER(TRIM(COALESCE(status,''))) IN ('pending','active','submitted')`
  );
  const [lowStock, expiring, returns] = await Promise.all([
    loadLowStockDrugs(pool, 200),
    loadExpiringSoonDrugs(pool, 30, 200),
    countMedicineReturns(pool),
  ]);
  return {
    kpi: {
      queuePending: { value: n(queue.c) },
      rxPending: { value: n(rx.c) },
      lowStock: { value: (lowStock || []).length },
      expiringSoon: { value: (expiring || []).length },
      returns: { value: n(returns) },
    },
  };
}

async function fetchRadiologyDashboard(pool) {
  const today = todayIso();
  const hub = await getHubStats(pool);
  const inProgress = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_radiology_result
      WHERE LOWER(TRIM(COALESCE(status,''))) IN ('pending','in_progress','received')`
  );
  const completed = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_radiology_result
      WHERE DATE(COALESCE(completed_at, updated_at, created_at)) = ?
        AND LOWER(TRIM(COALESCE(status,''))) IN ('done','completed','reported')`,
    [today]
  );
  const awaitingReport = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_radiology_result
      WHERE LOWER(TRIM(COALESCE(status,''))) IN ('received','pending','in_progress')`
  );
  const validate = await q1(
    pool,
    `SELECT COUNT(*) AS c FROM tbl_opd_order_item
      WHERE LOWER(TRIM(item_type)) = 'radiology'
        AND status IN ('pending','paid')`
  );
  return {
    kpi: {
      pending: { value: n(hub.rad_open) },
      inProgress: { value: n(inProgress.c) },
      completedToday: { value: n(completed.c) },
      awaitingReport: { value: n(awaitingReport.c) },
      validateQueue: { value: n(validate.c) || n(hub.rad_open) },
    },
  };
}

const FETCHERS = {
  doctor: fetchDoctorDashboard,
  nurse: fetchNurseDashboard,
  laboratory: fetchLaboratoryDashboard,
  pharmacy: fetchPharmacyDashboard,
  radiology: fetchRadiologyDashboard,
};

function resolveStaffRoleProfile(homePortalCode, role) {
  const home = String(homePortalCode || '').trim();
  if (home && HOME_PORTAL_ALIASES[home]) return HOME_PORTAL_ALIASES[home];
  if (ROLE_HOME_FALLBACK[String(role || '')]) return ROLE_HOME_FALLBACK[String(role || '')];
  return null;
}

function getCatalog(profile) {
  return CATALOGS[profile] || null;
}

function aclPortalForProfile(profile) {
  return PROFILE_SPECS[profile]?.aclPortal || null;
}

function aclUiElements() {
  return Object.values(CATALOGS).flatMap((c) => c.aclUiElements());
}

const ALL_STAFF_ROLE_DASHBOARD_PERMISSIONS = Object.values(CATALOGS).flatMap((c) => c.ALL_PERMISSIONS);

const REPAIR_ROLE_IDS = Object.freeze({
  doctor: ['2', '100'],
  nurse: ['7', '8', '103'],
  laboratory: ['4'],
  pharmacy: ['5', '105'],
  radiology: ['6'],
});

async function fetchStaffRoleDashboard(pool, profile) {
  const fn = FETCHERS[profile];
  if (!fn) return { kpi: {} };
  return fn(pool);
}

module.exports = {
  PROFILE_SPECS,
  HOME_PORTAL_ALIASES,
  ROLE_HOME_FALLBACK,
  PROFILE_HOME_URLS,
  resolveStaffRoleProfile,
  getCatalog,
  aclPortalForProfile,
  aclUiElements,
  ALL_STAFF_ROLE_DASHBOARD_PERMISSIONS,
  REPAIR_ROLE_IDS,
  fetchStaffRoleDashboard,
};
