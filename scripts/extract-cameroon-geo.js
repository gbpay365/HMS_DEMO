'use strict';

/** Extract Cameroon geo objects from app.js into lib/cameroonGeo.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = appJs.indexOf('const regions = [', appJs.indexOf('/api/cameroon-geo'));
const end = appJs.indexOf('res.json({ regions, departments, communes', start);
const block = appJs.slice(start, end);

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${block}; this.payload = { regions, departments, communesDetailed };`, sandbox);

const { payload } = sandbox;
const regions = payload.regions;
const departments = payload.departments;
const communesDetailed = payload.communesDetailed;

const communes = {};
regions.forEach((reg) => {
  communes[reg] = {};
  (departments[reg] || []).forEach((div) => {
    const pick = communesDetailed[reg] && communesDetailed[reg][div];
    communes[reg][div] =
      pick && pick.length
        ? pick.slice()
        : [`${div} — Main centre`, `${div} — Other locality`, 'Other council…'];
  });
});

const villageDefaults = ['Other (specify)…'];
const villageHints = {
  'Centre|Mfoundi|Yaoundé I': ['Bastos', 'Tsinga', 'Nlongkak', 'Mokolo', 'Other (specify)…'],
  'Centre|Mfoundi|Yaoundé III': ['Efoulan', 'Nsimeyong', 'Mendong', 'Other (specify)…'],
  'Littoral|Wouri|Douala I': ['Akwa', 'Bonanjo', 'Deido', 'Bali', 'Other (specify)…'],
  'Littoral|Wouri|Douala V': ['Bonaberi', 'Makepe', 'Logpom', 'Other (specify)…'],
  'West|Mifi|Bafoussam I': ['Banengo', 'Tamdja', 'Houngang', 'Other (specify)…'],
};

const out = `'use strict';

/** Cameroon regions → divisions → communes (patient address cascading). */
const regions = ${JSON.stringify(regions, null, 1)};

const departments = ${JSON.stringify(departments, null, 1)};

const communesDetailed = ${JSON.stringify(communesDetailed, null, 1)};

const communes = ${JSON.stringify(communes, null, 1)};

const villageDefaults = ${JSON.stringify(villageDefaults, null, 1)};

const villageHints = ${JSON.stringify(villageHints, null, 1)};

function getCameroonGeoPayload() {
  return { regions, departments, communes, villageDefaults, villageHints };
}

module.exports = {
  getCameroonGeoPayload,
};
`;

fs.writeFileSync(path.join(__dirname, '..', 'lib', 'cameroonGeo.js'), out);
fs.writeFileSync(
  path.join(__dirname, '..', 'lib', 'data', 'cameroon-geo.json'),
  `${JSON.stringify({ regions, departments, communes, villageDefaults, villageHints }, null, 2)}\n`
);
console.log('Wrote lib/cameroonGeo.js and lib/data/cameroon-geo.json');
