'use strict';

const fs = require('fs');
const path = require('path');
const { buildCatalog } = require('../lib/aclI18nCatalog');

const { modulesEn, modulesFr, permsEn, permsFr } = buildCatalog();

function nestPermKeys(flat) {
  const out = {};
  for (const [code, label] of Object.entries(flat)) {
    out[code.replace(/\./g, '__')] = label;
  }
  return out;
}

for (const lang of ['en', 'fr']) {
  const file = path.join(__dirname, '..', 'locales', lang, 'access.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.acl_modules = lang === 'en' ? modulesEn : modulesFr;
  data.acl_perms = nestPermKeys(lang === 'en' ? permsEn : permsFr);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log('Updated', file, Object.keys(data.acl_modules).length, 'modules', Object.keys(data.acl_perms).length, 'perms');
}
