'use strict';

/** Icons & colors for tbl_role entries (Super Admin, access UI). */
const ROLE_META_BY_CODE = Object.freeze({
  '1': { icon: 'fa-cogs', color: '#475569', badge: 'System Admin' },
  '2': { icon: 'fa-stethoscope', color: '#1a6bd8' },
  '3': { icon: 'fa-desktop', color: '#0c8b8b' },
  '4': { icon: 'fa-flask', color: '#16a34a' },
  '5': { icon: 'fa-medkit', color: '#059669' },
  '6': { icon: 'fa-film', color: '#7c3aed' },
  '7': { icon: 'fa-heartbeat', color: '#ec4899' },
  '8': { icon: 'fa-user-md', color: '#db2777' },
  '9': { icon: 'fa-calculator', color: '#1e40af' },
  '10': { icon: 'fa-cubes', color: '#b45309' },
  '11': { icon: 'fa-money', color: '#10b981' },
  '99': { icon: 'fa-shield', color: '#7c3aed', badge: 'Super Admin' },
  '100': { icon: 'fa-briefcase', color: '#1e1b4b' },
  '101': { icon: 'fa-sitemap', color: '#312e81' },
  '102': { icon: 'fa-line-chart', color: '#334155' },
  '103': { icon: 'fa-users', color: '#64748b' },
});

const TITLE_HINTS = Object.freeze([
  { match: /doctor|physician|consultant/i, icon: 'fa-stethoscope', color: '#1a6bd8' },
  { match: /front desk|reception/i, icon: 'fa-desktop', color: '#0c8b8b' },
  { match: /lab/i, icon: 'fa-flask', color: '#16a34a' },
  { match: /pharmac/i, icon: 'fa-medkit', color: '#059669' },
  { match: /radiolog/i, icon: 'fa-film', color: '#7c3aed' },
  { match: /nursing aid|nurse aid/i, icon: 'fa-user-md', color: '#db2777' },
  { match: /nurse/i, icon: 'fa-heartbeat', color: '#ec4899' },
  { match: /accountant|accounting/i, icon: 'fa-calculator', color: '#1e40af' },
  { match: /inventory|store/i, icon: 'fa-cubes', color: '#b45309' },
  { match: /cashier/i, icon: 'fa-money', color: '#10b981' },
  { match: /assistant\s*director/i, icon: 'fa-sitemap', color: '#4338ca' },
  { match: /secretary/i, icon: 'fa-envelope-o', color: '#5b21b6' },
  { match: /director/i, icon: 'fa-briefcase', color: '#1e1b4b' },
  { match: /deputy/i, icon: 'fa-sitemap', color: '#312e81' },
  { match: /financial|finance/i, icon: 'fa-line-chart', color: '#334155' },
  { match: /personnel|hr|human resource/i, icon: 'fa-users', color: '#64748b' },
  { match: /admin/i, icon: 'fa-cogs', color: '#475569' },
  { match: /super admin/i, icon: 'fa-shield', color: '#7c3aed', badge: 'Super Admin' },
]);

function roleMeta(roleCode, title) {
  const code = String(roleCode ?? '').trim();
  if (ROLE_META_BY_CODE[code]) {
    return { ...ROLE_META_BY_CODE[code], code };
  }
  const t = String(title || '').trim();
  for (const hint of TITLE_HINTS) {
    if (hint.match.test(t)) {
      return { icon: hint.icon, color: hint.color, badge: hint.badge || null, code };
    }
  }
  return { icon: 'fa-id-badge', color: '#64748b', badge: null, code };
}

module.exports = { ROLE_META_BY_CODE, roleMeta };
