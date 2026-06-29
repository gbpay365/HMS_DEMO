/** Grouped layout for HMS clinical hub stats and module shortcuts. */
export const HUB_STAT_GROUPS = [
  {
    id: 'flow',
    labelKey: 'hub.groups.flow',
    fallback: 'Patient flow today',
    codes: [
      'hub.stat.opd_open',
      'hub.stat.in_consult',
      'hub.stat.appointments_today',
      'hub.stat.pending_orders',
    ],
  },
  {
    id: 'diagnostics',
    labelKey: 'hub.groups.diagnostics',
    fallback: 'Diagnostics',
    codes: ['hub.stat.lab_open', 'hub.stat.rad_open'],
  },
  {
    id: 'census',
    labelKey: 'hub.groups.census',
    fallback: 'Hospital census',
    codes: ['hub.stat.ipd_active', 'hub.stat.patients_total', 'hub.stat.doctors_active'],
  },
  {
    id: 'finance',
    labelKey: 'hub.groups.finance',
    fallback: 'Finance',
    codes: ['hub.stat.revenue_today'],
  },
];

export const HUB_MODULE_GROUPS = [
  {
    id: 'patient',
    labelKey: 'hub.modules.patient',
    fallback: 'Patients & visits',
    codes: [
      'hub.card.patients',
      'hub.card.appointments',
      'hub.card.opd_queue',
      'hub.card.hospitalization',
    ],
  },
  {
    id: 'diagnostics',
    labelKey: 'hub.modules.diagnostics',
    fallback: 'Diagnostics & pharmacy',
    codes: ['hub.card.laboratory', 'hub.card.radiology', 'hub.card.pharmacy'],
  },
  {
    id: 'facilities',
    labelKey: 'hub.modules.facilities',
    fallback: 'Front office & facilities',
    codes: [
      'hub.card.cashier',
      'hub.card.maternity',
      'hub.card.waiting_screen',
      'hub.card.appointment_slots',
      'hub.card.reports',
    ],
  },
];

export function groupHubStats(statItems = []) {
  const byCode = new Map(statItems.map((s) => [s.code, s]));
  return HUB_STAT_GROUPS.map((group) => ({
    ...group,
    items: group.codes.map((code) => byCode.get(code)).filter(Boolean),
  })).filter((g) => g.items.length > 0);
}

export function groupHubModules(cards = []) {
  const byCode = new Map(cards.map((c) => [c.code, c]));
  return HUB_MODULE_GROUPS.map((group) => ({
    ...group,
    items: group.codes.map((code) => byCode.get(code)).filter(Boolean),
  })).filter((g) => g.items.length > 0);
}
