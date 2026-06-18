'use strict';

/** Resolve tbl_acl_ui_element.url for rendering (home placeholder, paths). */
function resolveNavItemUrl(item, homeUrl) {
  const url = String(item?.url || '').trim();
  if (!url || url === '__home__') return homeUrl || '/hms';
  return url;
}

/** Active class for nav link from current path. */
function navActiveClass(currentPath, itemUrl, prefixes) {
  const path = String(currentPath || '');
  const url = String(itemUrl || '');
  if (!url || url === '__home__') {
    if (path === '/' || path === '/hms' || path === '/dashboard') return ' active';
    return '';
  }
  if (path === url || path.indexOf(url + '/') === 0) return ' active';
  if (Array.isArray(prefixes)) {
    for (const p of prefixes) {
      if (p && (path === p || path.indexOf(p + '/') === 0)) return ' active';
    }
  }
  return '';
}

/** Prefix list for a topnav dropdown active state. */
function topnavDropPrefixes(menu) {
  const out = [];
  for (const ch of menu.children || []) {
    const u = String(ch.url || '').trim();
    if (u && u !== '__home__') out.push(u.split('?')[0]);
  }
  return out;
}

module.exports = { resolveNavItemUrl, navActiveClass, topnavDropPrefixes };
