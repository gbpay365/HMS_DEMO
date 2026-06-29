'use strict';

/** Mirror frontend hubLayoutCatalog — grouped hub stats and module tiles. */
const HUB_STAT_GROUPS = [
  {
    id: 'flow',
    i18nKey: 'hub.groups.flow',
    fallback: 'Patient flow today',
    codes: ['hub.stat.opd_open', 'hub.stat.in_consult', 'hub.stat.appointments_today', 'hub.stat.pending_orders'],
  },
  {
    id: 'diagnostics',
    i18nKey: 'hub.groups.diagnostics',
    fallback: 'Diagnostics',
    codes: ['hub.stat.lab_open', 'hub.stat.rad_open'],
  },
  {
    id: 'census',
    i18nKey: 'hub.groups.census',
    fallback: 'Hospital census',
    codes: ['hub.stat.ipd_active', 'hub.stat.patients_total', 'hub.stat.doctors_active'],
  },
  {
    id: 'finance',
    i18nKey: 'hub.groups.finance',
    fallback: 'Finance',
    codes: ['hub.stat.revenue_today'],
  },
];

const HUB_MODULE_GROUPS = [
  {
    id: 'patient',
    i18nKey: 'hub.modules.patient',
    fallback: 'Patients & visits',
    codes: ['hub.card.patients', 'hub.card.appointments', 'hub.card.opd_queue', 'hub.card.hospitalization'],
  },
  {
    id: 'diagnostics',
    i18nKey: 'hub.modules.diagnostics',
    fallback: 'Diagnostics & pharmacy',
    codes: ['hub.card.laboratory', 'hub.card.radiology', 'hub.card.pharmacy'],
  },
  {
    id: 'facilities',
    i18nKey: 'hub.modules.facilities',
    fallback: 'Front office & facilities',
    codes: ['hub.card.cashier', 'hub.card.maternity', 'hub.card.waiting_screen', 'hub.card.appointment_slots', 'hub.card.reports'],
  },
];

function groupByCodes(items, groups, keyField = 'code') {
  const byCode = new Map((items || []).map((it) => [String(it[keyField]), it]));
  return groups
    .map((group) => ({
      ...group,
      items: group.codes.map((code) => byCode.get(code)).filter(Boolean),
    }))
    .filter((g) => g.items.length > 0);
}

function groupHubCatalogStats(statsCatalog, uiVisibleFn) {
  const visible = (statsCatalog || []).filter((s) => uiVisibleFn(s.code));
  return groupByCodes(visible, HUB_STAT_GROUPS);
}

function groupHubCatalogModules(modulesCatalog, uiVisibleFn) {
  const visible = (modulesCatalog || []).filter((m) => uiVisibleFn(m.code));
  return groupByCodes(visible, HUB_MODULE_GROUPS);
}

module.exports = {
  HUB_STAT_GROUPS,
  HUB_MODULE_GROUPS,
  groupHubCatalogStats,
  groupHubCatalogModules,
};
