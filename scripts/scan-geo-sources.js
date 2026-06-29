'use strict';
const fs = require('fs');
const codes = ['NG','GH','SN','CI','BJ','BF','ML','NE','TG','GW','GN','GM','LR','SL','CV','MR','CM','TD','CF','CG','CD','GA','GQ','ST'];
const DR5HN = 'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master';

(async () => {
  const countries = await fetch(`${DR5HN}/json/countries.json`).then((r) => r.json());
  const states = await fetch(`${DR5HN}/json/states.json`).then((r) => r.json());
  const byIso = Object.fromEntries(countries.map((c) => [c.iso2, c]));
  const lines = [];
  for (const code of codes) {
    const c = byIso[code];
    const st = c ? states.filter((s) => s.country_id === c.id) : [];
    const r = await fetch(`${DR5HN}/contributions/cities/${code}.json`);
    lines.push(`${code}\tstates=${st.length}\tcities=${r.ok ? 'yes' : 'no'}`);
  }
  fs.writeFileSync('tmp/geo-scan.txt', lines.join('\n'));
  console.log(lines.join('\n'));
})();
