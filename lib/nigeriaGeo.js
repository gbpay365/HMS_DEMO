'use strict';

const fs = require('fs');
const path = require('path');

/** Six geopolitical zones → member states (for optional filtering). */
const GEO_POLITICAL_ZONES = {
  'North Central': [
    'Benue',
    'Federal Capital Territory',
    'Kogi',
    'Kwara',
    'Nasarawa',
    'Niger',
    'Plateau',
  ],
  'North East': ['Adamawa', 'Bauchi', 'Borno', 'Gombe', 'Taraba', 'Yobe'],
  'North West': ['Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Sokoto', 'Zamfara'],
  'South East': ['Abia', 'Anambra', 'Ebonyi', 'Enugu', 'Imo'],
  'South South': ['Akwa Ibom', 'Bayelsa', 'Cross River', 'Delta', 'Edo', 'Rivers'],
  'South West': ['Ekiti', 'Lagos', 'Ogun', 'Ondo', 'Osun', 'Oyo'],
};

let _cache = null;

function loadLgasByState() {
  if (_cache) return _cache;
  const file = path.join(__dirname, 'data', 'nigeria-lgas.json');
  _cache = JSON.parse(fs.readFileSync(file, 'utf8'));
  return _cache;
}

function getNigeriaGeoPayload() {
  const lgas = loadLgasByState();
  const states = Object.keys(lgas).sort((a, b) => a.localeCompare(b));
  return {
    states,
    lgas,
    zones: GEO_POLITICAL_ZONES,
    lgaOtherLabel: 'Other LGA…',
  };
}

module.exports = {
  GEO_POLITICAL_ZONES,
  getNigeriaGeoPayload,
};
