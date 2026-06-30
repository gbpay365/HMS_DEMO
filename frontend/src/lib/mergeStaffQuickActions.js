/** Normalize URL for deduplicating portal tiles and dashboard quick actions. */
export function normalizeActionUrl(url) {
  const raw = String(url || '').trim();
  if (!raw || raw === '#') return '';
  return raw.split('?')[0].replace(/\/$/, '') || '';
}

/** Merge ACL portal tiles with dashboard API quick actions (tiles win on duplicate URLs). */
export function mergeStaffQuickActions(portalTiles = [], apiActions = []) {
  const merged = [];
  const seen = new Set();

  const push = (item) => {
    if (!item) return;
    const url = normalizeActionUrl(item.url || item.href);
    if (!url || seen.has(url)) return;
    seen.add(url);
    merged.push({
      code: item.code || url,
      label: item.label,
      url: item.url || item.href || url,
      icon: item.icon,
      color: item.color,
    });
  };

  for (const tile of portalTiles) push(tile);
  for (const action of apiActions) push(action);
  return merged;
}
