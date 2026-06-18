'use strict';

const { elementAllowedBySlices, parseSlicesJson } = require('./aclNavSlices');
const { groupSidebarItems } = require('./aclNavGroups');
const { TOPNAV_PARENT_ORDER, TOPBAR_PRIMARY_CODES } = require('./aclLayout');

const NAV_KINDS = new Set(['sidebar', 'topnav', 'topnav_item']);

/**
 * Load global nav catalogue rows for the module override editor.
 */
async function loadNavCatalogue(pool) {
  const [rows] = await pool.query(
    `SELECT code, kind, parent_code, label, url, icon, sort_order, required_perm
       FROM tbl_acl_ui_element
      WHERE portal_code = 'global' AND enabled = 1
        AND kind IN ('sidebar','topnav','topnav_item')
      ORDER BY sort_order, label`
  );
  return rows || [];
}

function sliceDefaultVisible(code, slices) {
  return elementAllowedBySlices(code, slices, {});
}

function effectiveVisible(code, slices, overrides) {
  return elementAllowedBySlices(code, slices, overrides || {});
}

/** Build editor row for one catalogue entry. */
function rowForItem(item, slices, overrides) {
  const code = String(item.code);
  const sliceOn = sliceDefaultVisible(code, slices);
  let override = null;
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, code)) {
    const v = overrides[code];
    override = v === 0 || v === false || v === '0' ? 0 : 1;
  }
  const effective = effectiveVisible(code, slices, overrides);
  let inheritValue = '';
  if (override === 1) inheritValue = '1';
  else if (override === 0) inheritValue = '0';

  return {
    code,
    kind: item.kind,
    parent_code: item.parent_code,
    label: item.label,
    url: item.url,
    icon: item.icon,
    required_perm: item.required_perm,
    sliceDefault: sliceOn,
    override,
    inheritValue,
    effective,
  };
}

/**
 * Grouped structure for the editor view.
 */
function buildEditorModel(catalogue, slices, overrides) {
  const byCode = new Map();
  for (const item of catalogue) {
    if (!NAV_KINDS.has(item.kind)) continue;
    byCode.set(item.code, rowForItem(item, slices, overrides));
  }

  const sidebarItems = catalogue
    .filter((it) => it.kind === 'sidebar' && it.code !== 'sb.home')
    .map((it) => rowForItem(it, slices, overrides));

  const sidebarSections = groupSidebarItems(
    catalogue.filter((it) => it.kind === 'sidebar' && it.code !== 'sb.home')
  ).map((sec) => ({
    key: sec.key,
    label: sec.label,
    items: sec.items.map((it) => rowForItem(it, slices, overrides)),
  }));

  const topnavMenus = [];
  for (const pcode of TOPNAV_PARENT_ORDER) {
    const parent = catalogue.find((it) => it.code === pcode && it.kind === 'topnav');
    if (!parent) continue;
    const children = catalogue
      .filter((it) => it.kind === 'topnav_item' && it.parent_code === pcode)
      .map((it) => rowForItem(it, slices, overrides));
    topnavMenus.push({
      parent: rowForItem(parent, slices, overrides),
      children,
    });
  }

  const topbarPrimary = TOPBAR_PRIMARY_CODES.map((code) => byCode.get(code)).filter(Boolean);

  return {
    sidebarSections,
    topnavMenus,
    topbarPrimary,
    allRows: Array.from(byCode.values()).sort((a, b) => String(a.code).localeCompare(b.code)),
  };
}

/** Parse POST body fields mod_<code> → { code: 0|1 }. */
function parseOverridesFromBody(body) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const [key, val] of Object.entries(body)) {
    if (!key.startsWith('mod_')) continue;
    const code = key.slice(4);
    const s = String(val).trim();
    if (s === '1') out[code] = 1;
    else if (s === '0') out[code] = 0;
  }
  return out;
}

/** Keep only overrides that change behaviour vs slice-only. */
function pruneOverrides(slices, overrides) {
  const pruned = {};
  for (const [code, val] of Object.entries(overrides || {})) {
    const sliceOn = sliceDefaultVisible(code, slices);
    if (val === 1 && !sliceOn) pruned[code] = 1;
    else if (val === 0 && sliceOn) pruned[code] = 0;
  }
  return pruned;
}

function countOverrides(overrides) {
  return Object.keys(overrides || {}).length;
}

module.exports = {
  loadNavCatalogue,
  buildEditorModel,
  parseOverridesFromBody,
  pruneOverrides,
  sliceDefaultVisible,
  effectiveVisible,
  countOverrides,
};
