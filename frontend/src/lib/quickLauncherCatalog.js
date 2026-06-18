import catalog from '../../../data/hub-catalog.json';

/** Flat quick-launcher items from hub module cards + dashboard tiles. */
export function getQuickLauncherItems() {
  const seen = new Set();
  const out = [];

  function add(item) {
    const key = item.href;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  }

  (catalog.hubModuleCards || []).forEach((card) => {
    add({
      href: card.href,
      label: card.fallback,
      icon: card.icon,
      group: 'Modules',
    });
  });

  (catalog.dashboardSections || []).forEach((section) => {
    (section.tiles || []).forEach((tile) => {
      if (!tile.href) return;
      add({
        href: tile.href,
        label: tile.labelKey || tile.code,
        icon: tile.icon,
        group: section.id,
      });
    });
  });

  add({ href: '/dashboard', label: 'Dashboard', icon: 'fa-th-large', group: 'Home' });
  add({ href: '/hms', label: 'Medical Center', icon: 'fa-hospital-o', group: 'Home' });
  add({ href: '/wallet', label: 'Patient wallets', icon: 'fa-wallet', group: 'Finance' });
  add({ href: '/settings', label: 'Settings', icon: 'fa-cog', group: 'Admin' });

  return out;
}
