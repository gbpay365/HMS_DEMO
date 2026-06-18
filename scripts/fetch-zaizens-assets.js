'use strict';
const fs = require('fs');
const path = require('path');

async function main() {
  const url = 'https://www.zaizens.com/?i=1';
  const r = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  const html = await r.text();
  console.log('status', r.status, 'bytes', html.length);
  const assets = new Set();
  const re = /(?:src|href)=["']([^"']+\.(?:png|svg|webp|jpg|jpeg|ico)(?:\?[^"']*)?)["']/gi;
  let m;
  while ((m = re.exec(html))) assets.add(m[1]);
  const og = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  console.log('og:image', og && og[1]);
  console.log('assets', [...assets].slice(0, 30));
  const outDir = path.join(__dirname, '..', 'public', 'img');
  for (const rel of assets) {
    if (!/logo|brand|favicon|icon/i.test(rel)) continue;
    const abs = rel.startsWith('http') ? rel : new URL(rel, url).href;
    try {
      const img = await fetch(abs, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!img.ok) continue;
      const buf = Buffer.from(await img.arrayBuffer());
      const name = path.basename(new URL(abs).pathname) || 'zaizens-asset.png';
      const dest = path.join(outDir, name.replace(/[^a-zA-Z0-9._-]/g, '_'));
      fs.writeFileSync(dest, buf);
      console.log('saved', dest, buf.length);
    } catch (e) {
      console.log('skip', abs, e.message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
