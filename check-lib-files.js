// check-lib-files.js — run locally to see which lib/ files are missing on server
// Just shows you the full list to upload
'use strict';
const fs = require('fs');
const path = require('path');

const libDir = path.join(__dirname, 'lib');
const files = fs.readdirSync(libDir).filter(f => f.endsWith('.js'));

console.log('\nAll lib/ files that need to be on the server:');
files.forEach(f => {
  const stat = fs.statSync(path.join(libDir, f));
  console.log(`  lib/${f}  (${stat.size} bytes)`);
});
console.log('\nTotal:', files.length, 'files');
