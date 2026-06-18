'use strict';

/**
 * Download third-party assets for offline use (icons, select2, sweetalert2).
 * Run: node scripts/download-vendor-assets.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

const FILES = [
  // Font Awesome 4.7.0 — icon font files
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.woff2',
    dest: 'fonts/fontawesome-webfont.woff2',
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.woff',
    dest: 'fonts/fontawesome-webfont.woff',
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.ttf',
    dest: 'fonts/fontawesome-webfont.ttf',
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.eot',
    dest: 'fonts/fontawesome-webfont.eot',
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.svg',
    dest: 'fonts/fontawesome-webfont.svg',
  },
  // Select2
  {
    url: 'https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css',
    dest: 'vendor/select2/select2.min.css',
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js',
    dest: 'vendor/select2/select2.min.js',
  },
  // SweetAlert2
  {
    url: 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css',
    dest: 'vendor/sweetalert2/sweetalert2.min.css',
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js',
    dest: 'vendor/sweetalert2/sweetalert2.all.min.js',
  },
  // QR code generator (cashier BetterPay settle page)
  {
    url: 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js',
    dest: 'vendor/qrcode/qrcode.min.js',
  },
];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, { headers: { 'User-Agent': 'HMS-vendor-download/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return fetchUrl(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

async function main() {
  for (const f of FILES) {
    const dest = path.join(PUBLIC, f.dest);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    process.stdout.write(`Downloading ${f.dest}… `);
    const buf = await fetchUrl(f.url);
    fs.writeFileSync(dest, buf);
    console.log(`OK (${buf.length} bytes)`);
  }

  // Patch Font Awesome CSS to use local fonts
  const faCssPath = path.join(PUBLIC, 'css', 'font-awesome.min.css');
  let faCss = fs.readFileSync(faCssPath, 'utf8');
  const cdnPrefix = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/';
  if (!faCss.includes(cdnPrefix)) {
    console.log('font-awesome.min.css already uses local paths.');
  } else {
    faCss = faCss.split(cdnPrefix).join('/fonts/');
    fs.writeFileSync(faCssPath, faCss);
    console.log('Patched public/css/font-awesome.min.css → /fonts/');
  }

  // Mirror for legacy /assets/css/ paths
  const assetsCssDir = path.join(PUBLIC, 'assets', 'css');
  fs.mkdirSync(assetsCssDir, { recursive: true });
  fs.copyFileSync(faCssPath, path.join(assetsCssDir, 'font-awesome.min.css'));
  const bootstrapSrc = path.join(PUBLIC, 'css', 'bootstrap.min.css');
  if (fs.existsSync(bootstrapSrc)) {
    fs.copyFileSync(bootstrapSrc, path.join(assetsCssDir, 'bootstrap.min.css'));
  }
  console.log('Copied font-awesome + bootstrap → public/assets/css/');

  console.log('\nDone. Icons and vendor scripts are available offline.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
