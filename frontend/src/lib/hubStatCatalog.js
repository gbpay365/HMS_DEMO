/** Maps ACL hub.stat.* codes to getHubStats() payload keys. */
export const HUB_STAT_CATALOG = [
  { code: 'hub.stat.opd_open', key: 'opd_open', fmt: false, icon: 'fa-list-alt', color: '#00a09d' },
  { code: 'hub.stat.in_consult', key: 'in_consult', fmt: false, icon: 'fa-stethoscope', color: '#16a34a' },
  { code: 'hub.stat.appointments_today', key: 'appointments_today', fmt: false, icon: 'fa-calendar', color: '#875a7b' },
  { code: 'hub.stat.ipd_active', key: 'ipd_active', fmt: false, icon: 'fa-hospital-o', color: '#1e40af' },
  { code: 'hub.stat.lab_open', key: 'lab_open', fmt: false, icon: 'fa-flask', color: '#7c3aed' },
  { code: 'hub.stat.rad_open', key: 'rad_open', fmt: false, icon: 'fa-film', color: '#0369a1' },
  { code: 'hub.stat.pending_orders', key: 'pending_orders', fmt: false, icon: 'fa-clock-o', color: '#d97706' },
  { code: 'hub.stat.revenue_today', key: 'revenue_today', fmt: true, icon: 'fa-money', color: '#334155' },
  { code: 'hub.stat.patients_total', key: 'patients', fmt: false, icon: 'fa-users', color: '#017e84' },
  { code: 'hub.stat.doctors_active', key: 'doctors', fmt: false, icon: 'fa-user-md', color: '#1a6bd8' },
];

const catalogByCode = new Map(HUB_STAT_CATALOG.map((row) => [row.code, row]));

export function hubStatValue(stats, code) {
  const row = catalogByCode.get(String(code || ''));
  if (!row || !stats) return 0;
  const raw = stats[row.key];
  if (row.fmt) return Number(raw || 0).toLocaleString('fr-FR');
  return raw || 0;
}

export function enrichHubStats(aclStats = []) {
  return aclStats
    .map((item) => {
      const row = catalogByCode.get(item.code);
      if (!row) return null;
      return {
        ...item,
        statKey: row.key,
        fmt: row.fmt,
        icon: item.icon || row.icon,
        color: item.color || row.color};
    })
    .filter(Boolean);
}
