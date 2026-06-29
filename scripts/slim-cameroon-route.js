'use strict';
const fs = require('fs');
const p = require('path').join(__dirname, '..', 'app.js');
let s = fs.readFileSync(p, 'utf8');
const markerStart = "app.get('/api/cameroon-geo', requireAuth, (req, res) => {";
const markerEnd = '// INSURANCE carriers for registration dropdowns';
const start = s.indexOf(markerStart);
const end = s.indexOf(markerEnd, start);
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}
const replacement = `app.get('/api/cameroon-geo', requireAuth, (req, res) => {
 const hmsCountry = require('./lib/hmsCountry');
 if (hmsCountry.code !== 'CM') {
  return res.status(404).json({ error: 'Cameroon geo is disabled for this deployment.' });
 }
 const { getCountryGeoPayload } = require('./lib/countryGeo');
 res.json(getCountryGeoPayload('CM'));
});

`;
s = s.slice(0, start) + replacement + s.slice(end);
fs.writeFileSync(p, s);
console.log('OK: slim cameroon-geo route');
