'use strict';

const fs = require('fs');
const path = require('path');

let _cache = null;

function loadDistrictsByRegion() {
  if (_cache) return _cache;
  const file = path.join(__dirname, 'data', 'ghana-districts.json');
  _cache = JSON.parse(fs.readFileSync(file, 'utf8'));
  return _cache;
}

function getGhanaGeoPayload() {
  const data = loadDistrictsByRegion();
  return {
    regions: data.regions || [],
    districts: data.districts || {},
    regionLabel: 'Region',
    districtLabel: 'District',
  };
}

module.exports = {
  getGhanaGeoPayload,
};
