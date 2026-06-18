/** Maps ACL dir.stat.revenue_* codes to API payload keys. */
export const DIRECTOR_REVENUE_CATALOG = [
  { code: 'dir.stat.revenue_total', key: 'total', icon: 'fa-money', color: '#0f766e', primary: true },
  { code: 'dir.stat.revenue_consultation', key: 'consultation', icon: 'fa-stethoscope', color: '#16a34a', primary: true },
  { code: 'dir.stat.revenue_laboratory', key: 'laboratory', icon: 'fa-flask', color: '#7c3aed', primary: true },
  { code: 'dir.stat.revenue_radiology', key: 'radiology', icon: 'fa-film', color: '#0369a1', primary: true },
  { code: 'dir.stat.revenue_pharmacy', key: 'pharmacy', icon: 'fa-medkit', color: '#059669', primary: true },
  { code: 'dir.stat.revenue_maternity', key: 'maternity', icon: 'fa-female', color: '#9d174d', primary: false },
  { code: 'dir.stat.revenue_surgery', key: 'surgery', icon: 'fa-scissors', color: '#b45309', primary: false },
  { code: 'dir.stat.revenue_nursing', key: 'nursing', icon: 'fa-heartbeat', color: '#db2777', primary: false },
  { code: 'dir.stat.revenue_material', key: 'material', icon: 'fa-cubes', color: '#64748b', primary: false },
  { code: 'dir.stat.revenue_service', key: 'service', icon: 'fa-cog', color: '#475569', primary: false },
  { code: 'dir.stat.revenue_other', key: 'other', icon: 'fa-ellipsis-h', color: '#94a3b8', primary: false },
];

const byCode = new Map(DIRECTOR_REVENUE_CATALOG.map((row) => [row.code, row]));

export function enrichDirectorRevenueStats(aclStats = []) {
  return aclStats
    .map((item) => {
      const row = byCode.get(item.code);
      if (!row) return null;
      return {
        ...item,
        statKey: row.key,
        icon: item.icon || row.icon,
        color: item.color || row.color,
        primary: row.primary};
    })
    .filter(Boolean);
}

export function formatRevenueAmount(value) {
  return Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0});
}
