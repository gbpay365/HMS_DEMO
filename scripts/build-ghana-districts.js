'use strict';

const fs = require('fs');
const path = require('path');

async function main() {
  const [regions, districts] = await Promise.all([
    fetch('https://raw.githubusercontent.com/blingyplus/ghana-location-api/main/data/regions.json').then((r) =>
      r.json()
    ),
    fetch('https://raw.githubusercontent.com/blingyplus/ghana-location-api/main/data/districts.json').then((r) =>
      r.json()
    ),
  ]);

  const slugToName = Object.fromEntries(regions.map((r) => [r.slug, r.name]));
  const byRegion = Object.fromEntries(regions.map((r) => [r.name, []]));

  for (const d of districts) {
    const regionName = slugToName[d.region_slug];
    if (!regionName) continue;
    byRegion[regionName].push(d.name);
  }

  for (const list of Object.values(byRegion)) {
    list.sort((a, b) => a.localeCompare(b));
  }

  const out = {
    regions: regions.map((r) => r.name).sort((a, b) => a.localeCompare(b)),
    districts: byRegion,
  };

  const target = path.join(__dirname, '..', 'lib', 'data', 'ghana-districts.json');
  fs.writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${target} — ${out.regions.length} regions, ${districts.length} districts`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
