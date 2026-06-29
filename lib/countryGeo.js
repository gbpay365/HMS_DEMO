'use strict';

const fs = require('fs');
const path = require('path');
const catalog = require('./countryProfileCatalog');

const GEO_DIR = path.join(__dirname, 'data', 'geo');
const _cache = new Map();

function geoFilePath(code) {
  return path.join(GEO_DIR, `${String(code).toUpperCase()}.json`);
}

function hasGeoFile(code) {
  return fs.existsSync(geoFilePath(code));
}

function normalizePayload(raw, code) {
  const profile = catalog.getProfile(code);
  const geoSpec = profile?.geo || {};
  const regions = raw.regions || [];
  const subRegions = raw.subRegions || raw.districts || raw.lgas || raw.departments || {};
  const payload = {
    code: String(code).toUpperCase(),
    name: raw.name || profile?.name || code,
    regionLabel: raw.regionLabel || geoSpec.regionLabel || 'Region',
    subRegionLabel: raw.subRegionLabel || geoSpec.subRegionLabel || 'District',
    regions,
    subRegions,
    source: raw.source || 'lib/data/geo',
  };
  if (raw.zones) payload.zones = raw.zones;
  if (raw.communes) payload.communes = raw.communes;
  if (raw.villageDefaults) payload.villageDefaults = raw.villageDefaults;
  if (raw.villageHints) payload.villageHints = raw.villageHints;
  payload.states = regions;
  payload.lgas = subRegions;
  payload.districts = subRegions;
  payload.departments = subRegions;
  return payload;
}

function loadGeoFile(code) {
  const key = String(code).toUpperCase();
  if (_cache.has(key)) return _cache.get(key);
  const file = geoFilePath(key);
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const payload = normalizePayload(raw, key);
  _cache.set(key, payload);
  return payload;
}

function getCountryGeoPayload(code) {
  const key = String(code || '').trim().toUpperCase();
  if (!catalog.getProfile(key)) return null;

  if (key === 'NG') {
    const { getNigeriaGeoPayload } = require('./nigeriaGeo');
    const n = getNigeriaGeoPayload();
    return normalizePayload(
      {
        name: catalog.getProfile('NG').name,
        regionLabel: 'State',
        subRegionLabel: 'LGA (Local Government Area)',
        regions: n.states,
        subRegions: n.lgas,
        zones: n.zones,
        source: 'nigeria-lgas.json',
      },
      'NG'
    );
  }

  if (key === 'GH') {
    const { getGhanaGeoPayload } = require('./ghanaGeo');
    const g = getGhanaGeoPayload();
    return normalizePayload(
      {
        name: catalog.getProfile('GH').name,
        regionLabel: g.regionLabel,
        subRegionLabel: g.districtLabel,
        regions: g.regions,
        subRegions: g.districts,
        source: 'ghana-districts.json',
      },
      'GH'
    );
  }

  if (key === 'CM') {
    const { getCameroonGeoPayload } = require('./cameroonGeo');
    const c = getCameroonGeoPayload();
    return normalizePayload(
      {
        name: catalog.getProfile('CM').name,
        regionLabel: 'Region',
        subRegionLabel: 'Division',
        regions: c.regions,
        subRegions: c.departments,
        communes: c.communes,
        villageDefaults: c.villageDefaults,
        villageHints: c.villageHints,
        source: 'cameroonGeo.js',
      },
      'CM'
    );
  }

  return loadGeoFile(key);
}

function listAvailableGeoCodes() {
  if (!fs.existsSync(GEO_DIR)) return [];
  return fs
    .readdirSync(GEO_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/i, '').toUpperCase());
}

module.exports = {
  GEO_DIR,
  hasGeoFile,
  getCountryGeoPayload,
  listAvailableGeoCodes,
  normalizePayload,
};
