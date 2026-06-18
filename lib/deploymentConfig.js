'use strict';

const { parseSlicesJson } = require('./aclNavSlices');
const {
  loadAppSettings,
  legacyModeFromSlices,
  productSlicesForMode,
  isValidProductMode,
} = require('./appProductMode');

let _deployment = {
  source: 'legacy',
  profileId: null,
  profileIds: [],
  profileName: 'full',
  profileNames: [],
  productMode: 'full',
  slices: ['full'],
  moduleOverrides: {},
};

function parseModulesJson(raw) {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === 'object' && !Array.isArray(o)) return o;
  } catch (_) { /* ignore */ }
  return {};
}

function parseProfileIdsJson(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return [...new Set(arr.map((x) => parseInt(x, 10)).filter((n) => n > 0))];
  } catch (_) {
    return [];
  }
}

function mergeSlicesFromProfiles(profiles) {
  const set = new Set();
  for (const p of profiles || []) {
    const slices = p.slices || parseSlicesJson(p.slices_json);
    for (const s of slices) set.add(String(s));
  }
  if (set.has('full')) return ['full'];
  if (!set.size) return ['full'];
  return [...set];
}

function mergeModulesFromProfiles(profiles) {
  const out = {};
  for (const p of profiles || []) {
    const mods = p.moduleOverrides || parseModulesJson(p.modules_json);
    Object.assign(out, mods);
  }
  return out;
}

async function loadProfilesByIds(pool, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT id, name, slices_json, modules_json, updated_at
       FROM tbl_hms_deployment_profile
      WHERE id IN (${placeholders})`,
    ids
  );
  const byId = new Map((rows || []).map((r) => [Number(r.id), r]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

async function loadDeployment(pool) {
  try {
    const settings = await loadAppSettings(pool);
    const profileIds = parseProfileIdsJson(settings.active_deployment_profile_ids);

    if (profileIds.length) {
      const profiles = await loadProfilesByIds(pool, profileIds);
      if (profiles.length) {
        const mergedSlices = mergeSlicesFromProfiles(profiles);
        const names = profiles.map((p) => p.name);
        _deployment = {
          source: 'profiles',
          profileId: profiles[0].id,
          profileIds: profiles.map((p) => p.id),
          profileName: names.join(' + '),
          profileNames: names,
          productMode: legacyModeFromSlices(mergedSlices),
          slices: mergedSlices,
          moduleOverrides: mergeModulesFromProfiles(profiles),
        };
        return _deployment;
      }
    }

    const singleId = settings.active_deployment_profile_id;
    if (singleId && !profileIds.length) {
      const [rows] = await pool.query(
        'SELECT id, name, slices_json, modules_json FROM tbl_hms_deployment_profile WHERE id=? LIMIT 1',
        [singleId]
      );
      if (rows && rows[0]) {
        const r = rows[0];
        _deployment = {
          source: 'profile',
          profileId: r.id,
          profileIds: [r.id],
          profileName: r.name,
          profileNames: [r.name],
          productMode: settings.product_mode || 'full',
          slices: parseSlicesJson(r.slices_json),
          moduleOverrides: parseModulesJson(r.modules_json),
        };
        return _deployment;
      }
    }

    const legacySlices = parseSlicesJson(settings.product_slices);
    const legacyMode = legacyModeFromSlices(legacySlices);
    _deployment = {
      source: 'legacy',
      profileId: null,
      profileIds: [],
      profileName: legacyMode,
      profileNames: [],
      productMode: legacyMode,
      slices: legacySlices,
      moduleOverrides: parseModulesJson(settings.legacy_modules_json),
    };
    return _deployment;
  } catch (_) {
    _deployment = {
      source: 'legacy',
      profileId: null,
      profileIds: [],
      profileName: 'full',
      profileNames: [],
      productMode: 'full',
      slices: ['full'],
      moduleOverrides: {},
    };
    return _deployment;
  }
}

function getDeployment() {
  return _deployment;
}

function getSlices() {
  return _deployment.slices.slice();
}

function getModuleOverrides() {
  return { ..._deployment.moduleOverrides };
}

function getActiveProfileIds(pool) {
  return loadAppSettings(pool).then((s) => parseProfileIdsJson(s.active_deployment_profile_ids));
}

/** Activate one or more named profiles (merged slices for end users). */
async function activateProfiles(pool, profileIdsInput) {
  const ids = [...new Set((profileIdsInput || []).map((x) => parseInt(x, 10)).filter((n) => n > 0))];
  if (!ids.length) throw new Error('Select at least one deployment profile.');

  const profiles = await loadProfilesByIds(pool, ids);
  if (profiles.length !== ids.length) {
    throw new Error('One or more selected profiles were not found.');
  }

  const mergedSlices = mergeSlicesFromProfiles(profiles);
  const slicesJson = JSON.stringify(mergedSlices);
  const idsJson = JSON.stringify(ids);
  const legacyMode = legacyModeFromSlices(mergedSlices);

  await pool.query(
    `INSERT INTO tbl_app_settings (id, product_mode, product_slices, active_deployment_profile_id, active_deployment_profile_ids)
     VALUES (1, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       product_mode = VALUES(product_mode),
       product_slices = VALUES(product_slices),
       active_deployment_profile_id = VALUES(active_deployment_profile_id),
       active_deployment_profile_ids = VALUES(active_deployment_profile_ids)`,
    [legacyMode, slicesJson, ids[0], idsJson]
  );

  await loadDeployment(pool);
  return { profiles, mergedSlices, ids };
}

/** @deprecated Use activateProfiles — kept for old forms */
async function activateProfile(pool, profileId) {
  return activateProfiles(pool, [profileId]).then((r) => r.profiles[0]);
}

/** Set legacy global deployment (clears named profiles). Used by Super Admin Apply. */
async function applyLegacyDeploymentMode(pool, mode) {
  const productMode = String(mode || '').trim();
  if (!isValidProductMode(productMode)) throw new Error('Invalid deployment mode');
  const slicesJson = JSON.stringify(productSlicesForMode(productMode));
  await activateLegacyMode(pool, productMode, slicesJson);
  return { productMode, slicesJson };
}

async function activateLegacyMode(pool, productMode, slicesJson) {
  await pool.query(
    `INSERT INTO tbl_app_settings (id, product_mode, product_slices, active_deployment_profile_id, active_deployment_profile_ids)
     VALUES (1, ?, ?, NULL, NULL)
     ON DUPLICATE KEY UPDATE
       product_mode = VALUES(product_mode),
       product_slices = VALUES(product_slices),
       active_deployment_profile_id = NULL,
       active_deployment_profile_ids = NULL`,
    [productMode, slicesJson]
  );
  await loadDeployment(pool);
}

async function listProfiles(pool) {
  const [rows] = await pool.query(
    'SELECT id, name, slices_json, modules_json, updated_at FROM tbl_hms_deployment_profile ORDER BY name'
  );
  return rows || [];
}

async function getProfile(pool, profileId) {
  const id = parseInt(profileId, 10);
  if (!id) return null;
  const [rows] = await pool.query(
    'SELECT id, name, slices_json, modules_json, updated_at FROM tbl_hms_deployment_profile WHERE id=? LIMIT 1',
    [id]
  );
  if (!rows || !rows[0]) return null;
  const r = rows[0];
  return {
    ...r,
    slices: parseSlicesJson(r.slices_json),
    moduleOverrides: parseModulesJson(r.modules_json),
  };
}

async function getLegacyEditorContext(pool) {
  const settings = await loadAppSettings(pool);
  const slices = parseSlicesJson(settings.product_slices);
  const profileIds = parseProfileIdsJson(settings.active_deployment_profile_ids);
  return {
    productMode: settings.product_mode || 'full',
    slices,
    slices_json: settings.product_slices || JSON.stringify(slices),
    moduleOverrides: parseModulesJson(settings.legacy_modules_json),
    activeProfileId: settings.active_deployment_profile_id || null,
    activeProfileIds: profileIds,
    legacyActive: !profileIds.length && !settings.active_deployment_profile_id,
  };
}

async function saveLegacyModules(pool, modulesObj) {
  const keys = Object.keys(modulesObj || {});
  const json = keys.length ? JSON.stringify(modulesObj) : null;
  await pool.query('UPDATE tbl_app_settings SET legacy_modules_json=? WHERE id=1', [json]);
  const settings = await loadAppSettings(pool);
  const profileIds = parseProfileIdsJson(settings.active_deployment_profile_ids);
  if (!profileIds.length && !settings.active_deployment_profile_id) {
    await loadDeployment(pool);
  }
  return { keys: keys.length, json };
}

async function saveProfileModules(pool, profileId, modulesObj) {
  const id = parseInt(profileId, 10);
  if (!id) throw new Error('Invalid profile id');
  const keys = Object.keys(modulesObj || {});
  const json = keys.length ? JSON.stringify(modulesObj) : null;
  const [r] = await pool.query(
    'UPDATE tbl_hms_deployment_profile SET modules_json=? WHERE id=?',
    [json, id]
  );
  if (!r.affectedRows) throw new Error('Profile not found');
  const settings = await loadAppSettings(pool);
  const activeIds = parseProfileIdsJson(settings.active_deployment_profile_ids);
  if (activeIds.includes(id) || Number(settings.active_deployment_profile_id) === id) {
    await loadDeployment(pool);
  }
  return { keys: keys.length, json };
}

module.exports = {
  loadDeployment,
  getDeployment,
  getSlices,
  getModuleOverrides,
  getActiveProfileIds,
  applyLegacyDeploymentMode,
  activateProfile,
  activateProfiles,
  activateLegacyMode,
  listProfiles,
  getProfile,
  getLegacyEditorContext,
  saveLegacyModules,
  saveProfileModules,
  parseModulesJson,
  parseProfileIdsJson,
  mergeSlicesFromProfiles,
};
