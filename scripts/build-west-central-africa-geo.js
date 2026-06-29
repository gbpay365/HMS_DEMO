'use strict';

/**
 * Build lib/data/geo/{CODE}.json for all West & Central Africa profiles.
 * Sources: dr5hn/countries-states-cities-database (ODbL — attribution in lib/data/geo/ATTRIBUTION.txt)
 * Overrides: NG (LGA), GH (districts), CM (regions/divisions/communes from app export)
 */

const fs = require('fs');
const path = require('path');
const catalog = require('../lib/countryProfileCatalog');

const DR5HN = 'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master';
const { getCameroonGeoPayload } = require('../lib/cameroonGeo');
const OUT_DIR = path.join(__dirname, '..', 'lib', 'data', 'geo');

const WEST_CENTRAL_CODES = catalog
  .listProfiles()
  .filter((p) => p.regionGroup === 'West Africa' || p.regionGroup === 'Central Africa')
  .map((p) => p.code);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function uniqSorted(arr) {
  return [...new Set(arr.map((x) => String(x || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function writeGeo(code, payload) {
  const file = path.join(OUT_DIR, `${code}.json`);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  const regionCount = payload.regions?.length || 0;
  const subCount = Object.values(payload.subRegions || {}).reduce((n, list) => n + list.length, 0);
  console.log(`  ${code}: ${regionCount} regions, ${subCount} sub-regions`);
}

function loadNigeria() {
  const lgas = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'lib', 'data', 'nigeria-lgas.json'), 'utf8')
  );
  const profile = catalog.getProfile('NG');
  return {
    code: 'NG',
    name: profile.name,
    regionLabel: profile.geo.regionLabel,
    subRegionLabel: profile.geo.subRegionLabel,
    regions: Object.keys(lgas).sort((a, b) => a.localeCompare(b)),
    subRegions: lgas,
    source: 'nigeria-lgas.json',
  };
}

function loadGhana() {
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'lib', 'data', 'ghana-districts.json'), 'utf8')
  );
  const profile = catalog.getProfile('GH');
  return {
    code: 'GH',
    name: profile.name,
    regionLabel: profile.geo.regionLabel,
    subRegionLabel: profile.geo.subRegionLabel,
    regions: data.regions,
    subRegions: data.districts,
    source: 'ghana-districts.json',
  };
}

/** Cameroon communes export — from lib/cameroonGeo.js */
function loadCameroon() {
  const data = getCameroonGeoPayload();
  const profile = catalog.getProfile('CM');
  return {
    code: 'CM',
    name: profile.name,
    regionLabel: profile.geo.regionLabel,
    subRegionLabel: profile.geo.subRegionLabel,
    regions: data.regions || [],
    subRegions: data.departments || {},
    communes: data.communes,
    villageDefaults: data.villageDefaults,
    villageHints: data.villageHints,
    source: 'cameroonGeo.js',
  };
}

async function buildFromDr5hn(code, profile, countries, states, citiesByState) {
  const country = countries.find((c) => c.iso2 === code);
  if (!country) throw new Error(`Country ${code} not in dr5hn dataset`);

  const countryStates = states
    .filter((s) => s.country_id === country.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  const stateIdToName = Object.fromEntries(countryStates.map((s) => [s.id, s.name]));
  const subRegions = {};

  for (const st of countryStates) {
    subRegions[st.name] = [];
  }

  for (const city of citiesByState) {
    const stateName = stateIdToName[city.state_id];
    if (!stateName) continue;
    if (!subRegions[stateName]) subRegions[stateName] = [];
    subRegions[stateName].push(city.name);
  }

  for (const key of Object.keys(subRegions)) {
    subRegions[key] = uniqSorted(subRegions[key]);
    if (subRegions[key].length === 0) delete subRegions[key];
  }

  const regions = countryStates.map((s) => s.name);
  const hasSub = Object.keys(subRegions).length > 0;

  return {
    code,
    name: profile.name,
    regionLabel: profile.geo.regionLabel,
    subRegionLabel: profile.geo.subRegionLabel,
    regions,
    subRegions: hasSub ? subRegions : {},
    source: 'dr5hn/countries-states-cities-database',
  };
}

async function fetchCitiesForCountry(code) {
  const url = `${DR5HN}/contributions/cities/${code}.json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Fetching dr5hn reference data…');
  const [countries, states] = await Promise.all([
    fetchJson(`${DR5HN}/json/countries.json`),
    fetchJson(`${DR5HN}/json/states.json`),
  ]);

  console.log(`Building geo for ${WEST_CENTRAL_CODES.length} countries…`);

  for (const code of WEST_CENTRAL_CODES) {
    const profile = catalog.getProfile(code);

    if (code === 'NG') {
      writeGeo('NG', loadNigeria());
      continue;
    }
    if (code === 'GH') {
      writeGeo('GH', loadGhana());
      continue;
    }
    if (code === 'CM') {
      writeGeo('CM', loadCameroon());
      continue;
    }

    const cities = await fetchCitiesForCountry(code);
    const payload = await buildFromDr5hn(code, profile, countries, states, cities);
    writeGeo(code, payload);
  }

  const attribution = `Administrative division data for West & Central Africa patient registration.

Primary source: dr5hn/countries-states-cities-database
https://github.com/dr5hn/countries-states-cities-database
License: Open Database License (ODbL) — attribution required.

Country-specific overrides:
- NG: lib/data/nigeria-lgas.json (states + LGAs)
- GH: lib/data/ghana-districts.json (regions + districts, from ghana-location-api data)
- CM: lib/data/cameroon-geo.json (regions + divisions)

Generated by: scripts/build-west-central-africa-geo.js
Generated at: ${new Date().toISOString()}
`;
  fs.writeFileSync(path.join(OUT_DIR, 'ATTRIBUTION.txt'), attribution);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
