'use strict';
/**
 * Static audit: compare referenced internal paths vs registered Express routes.
 * Run: node scripts/audit-routes.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function walk(dir, extRe, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (['node_modules', 'dist', 'Update', '.git', 'license-generator'].includes(ent.name)) continue;
      walk(p, extRe, out);
    } else if (extRe.test(ent.name)) out.push(p);
  }
  return out;
}

function extractRoutes() {
  const routes = new Map(); // method+path -> file
  const files = [
    path.join(ROOT, 'app.js'),
    ...walk(path.join(ROOT, 'routes'), /\.js$/),
  ];
  const re = /app\.(get|post|put|delete|patch|all)\(\s*['"`]([^'"`]+)['"`]/g;
  const routerRe = /router\.(get|post|put|delete|patch|all)\(\s*['"`]([^'"`]+)['"`]/g;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(src))) {
      const key = `${m[1].toUpperCase()} ${m[2]}`;
      routes.set(key, path.relative(ROOT, file));
    }
    while ((m = routerRe.exec(src))) {
      const key = `${m[1].toUpperCase()} ${m[2]}`;
      routes.set(key, path.relative(ROOT, file));
    }
  }

  // Router mounts with prefixes
  const mountRe = /app\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)/g;
  const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const mounts = [];
  let mm;
  while ((mm = mountRe.exec(appSrc))) mounts.push({ prefix: mm[1], var: mm[2] });

  return { routes, mounts };
}

function normalizeRef(raw) {
  let p = raw.trim();
  if (!p.startsWith('/')) return null;
  if (p.startsWith('//')) return null;
  // strip query/hash
  p = p.split('?')[0].split('#')[0];
  // strip EJS/JS template tails
  p = p.replace(/\$\{[^}]+\}/g, ':param');
  p = p.replace(/<%[^%]+%>/g, ':param');
  p = p.replace(/:\w+/g, ':param');
  // collapse trailing slash (except root)
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function extractRefs() {
  const refs = new Map(); // path -> Set<sources>
  const add = (raw, src) => {
    const p = normalizeRef(raw);
    if (!p) return;
    if (/^\/(css|js|img|dist|vendor|uploads|assets|favicon|public)\//.test(p)) return;
    if (/\.(css|js|png|jpg|jpeg|gif|svg|woff|ico|map|pdf)(\?|$)/i.test(p)) return;
    if (!refs.has(p)) refs.set(p, new Set());
    refs.get(p).add(src);
  };

  const patterns = [
    /(?:href|action|formaction|src)\s*=\s*['"`](\/[^'"`\s>]+)['"`]/gi,
    /(?:fetch|postForm|axios\.(?:get|post|put|delete))\(\s*['"`](\/[^'"`\s?]+)/gi,
    /res\.redirect\(\s*['"`](\/[^'"`\s?]+)/gi,
    /['"`](\/(?:api|portal|hms|cashier|ipd|emergency|pharmacy|financials|tax|docs|admin|hr|payroll|maternity|vaccination|lims|laboratory|radiology|wards|patients|appointments|consultation|billing|wallet|inventory|procurement|catalog|prescriptions|death-registry|nursing|clinical|verify|visiting-doctor|management-reports|super-admin|facilities|employees|users|staff|access-control|workflow-guides|user-manual|telemedicine|patient-portal|credit-receivables|insurance|assets|doctor-roster|nurse-roster|payment-validity|front-desk|opd|internal)[^'"`\s]*?)['"`]/gi,
  ];

  const scanDirs = [
    { dir: path.join(ROOT, 'frontend', 'src'), ext: /\.(jsx?|tsx?)$/ },
    { dir: path.join(ROOT, 'views'), ext: /\.ejs$/ },
    { dir: path.join(ROOT, 'lib'), ext: /\.js$/ },
  ];

  for (const { dir, ext } of scanDirs) {
    for (const file of walk(dir, ext)) {
      const rel = path.relative(ROOT, file);
      const src = fs.readFileSync(file, 'utf8');
      for (const re of patterns) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src))) add(m[1], rel);
      }
    }
  }

  // ACL seed URLs
  const acl = fs.readFileSync(path.join(ROOT, 'lib', 'ensureAclSchema.js'), 'utf8');
  const urlRe = /['"`](\/[^'"`\s]+)['"`]/g;
  let m;
  while ((m = urlRe.exec(acl))) {
    if (m[1].includes('?')) add(m[1].split('?')[0], 'lib/ensureAclSchema.js');
    else add(m[1], 'lib/ensureAclSchema.js');
  }

  return refs;
}

function routePatterns(routes) {
  const byMethod = {};
  for (const [key, file] of routes) {
    const sp = key.indexOf(' ');
    const method = key.slice(0, sp);
    const p = key.slice(sp + 1);
    if (!byMethod[method]) byMethod[method] = [];
    byMethod[method].push({ pattern: p, file });
  }
  return byMethod;
}

function pathToRegex(p) {
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reStr = '^' + esc.replace(/\\:param/g, '[^/]+').replace(/:[^/]+/g, '[^/]+') + '$';
  return new RegExp(reStr);
}

function matchesAny(method, refPath, byMethod) {
  const methods = method === 'GET' ? ['GET', 'ALL'] : [method, 'ALL'];
  for (const meth of methods) {
    const list = byMethod[meth] || [];
    for (const { pattern } of list) {
      if (pathToRegex(pattern).test(refPath)) return true;
      // Also try matching with :param segments in pattern against literal ref
      const parts = refPath.split('/');
      const patParts = pattern.split('/');
      if (parts.length === patParts.length) {
        let ok = true;
        for (let i = 0; i < patParts.length; i++) {
          if (patParts[i].startsWith(':')) continue;
          if (patParts[i] !== parts[i]) {
            ok = false;
            break;
          }
        }
        if (ok) return true;
      }
    }
  }
  return false;
}

function main() {
  const { routes } = extractRoutes();
  const byMethod = routePatterns(routes);
  const refs = extractRefs();

  const getRoutes = new Set(
    [...routes.keys()]
      .filter((k) => k.startsWith('GET '))
      .map((k) => k.slice(4))
  );

  const missing = [];
  const suspicious = [];

  // Known intentional non-GET (forms) — check POST too
  for (const [refPath, sources] of refs) {
    const srcList = [...sources].slice(0, 3);
    const hasGet = matchesAny('GET', refPath, byMethod);
    const hasPost = matchesAny('POST', refPath, byMethod);
    if (!hasGet && !hasPost) {
      // wildcard reporting routes like /pharmacy/reporting/:reportId may match
      const maybeWildcard = [...getRoutes].some((r) => {
        if (!r.includes(':')) return false;
        return pathToRegex(r).test(refPath);
      });
      if (!maybeWildcard) {
        missing.push({ path: refPath, sources: srcList, methods: 'GET/POST' });
      }
    } else if (!hasGet && refPath.match(/^[a-z/-]+$/i)) {
      // likely a page link with only POST route
      const looksLikePage = !refPath.startsWith('/api/') && !refPath.includes('/save') && !refPath.includes('/add') && !refPath.includes('/delete') && !refPath.includes('/update') && !refPath.includes('/confirm') && !refPath.includes('/cancel') && !refPath.includes('/ack') && !refPath.includes('/status') && !refPath.includes('/import') && !refPath.includes('/sync') && !refPath.includes('/collect') && !refPath.includes('/settle') && !refPath.includes('/topup') && !refPath.includes('/create') && !refPath.includes('/receive') && !refPath.includes('/adjust') && !refPath.includes('/process') && !refPath.includes('/mark') && !refPath.includes('/seed') && !refPath.includes('/login') && !refPath.includes('/logout') && !refPath.includes('/action');
      if (looksLikePage) {
        suspicious.push({ path: refPath, sources: srcList, note: 'linked as page but no GET route (POST only?)' });
      }
    }
  }

  // Boot failures
  const bootPath = path.join(ROOT, 'tmp', 'last-boot.json');
  const bootFails = [];
  if (fs.existsSync(bootPath)) {
    const boot = JSON.parse(fs.readFileSync(bootPath, 'utf8'));
    for (const step of boot) {
      if (step.status === 'fail') bootFails.push(step);
    }
  }

  // Manual high-confidence issues
  const manual = [
    { path: '/tax/statutory-reports', issue: 'served by routes/statutoryReports.js', severity: 'ok' },
    { path: '/hms-reports', issue: 'legacy alias — redirects to /hms/reports', severity: 'fixed' },
    { path: '/pharmacy/reporting/expiry', issue: 'served by GET /pharmacy/reporting/:reportId (reportId=expiry)', severity: 'ok' },
    { path: '/patient-insurance', issue: 'legacy alias — redirects to /patients/:id/insurance', severity: 'fixed' },
    { path: '/docs/user-guide', issue: 'served by GET /docs/:slug via routes/hmsDocs.js', severity: 'ok' },
  ];

  missing.sort((a, b) => a.path.localeCompare(b.path));
  suspicious.sort((a, b) => a.path.localeCompare(b.path));

  console.log('=== HMS Route Audit ===\n');
  console.log(`Registered routes: ${routes.size}`);
  console.log(`Referenced paths scanned: ${refs.size}\n`);

  console.log('--- BOOT FAILURES ---');
  if (bootFails.length) bootFails.forEach((f) => console.log(`  [${f.step}] ${f.detail}`));
  else console.log('  (none recorded)');

  console.log('\n--- CONFIRMED HIGH-PRIORITY 404s ---');
  manual.forEach((m) => console.log(`  ${m.severity.toUpperCase()}  ${m.path}\n    ${m.issue}`));

  console.log('\n--- STATIC SCAN: UNMATCHED REFERENCES (likely 404) ---');
  const shown = new Set(manual.map((m) => m.path));
  let count = 0;
  for (const item of missing) {
    if (shown.has(item.path)) continue;
    // skip partial/template noise
    if (item.path.includes('${') || item.path.includes('<%')) continue;
    console.log(`  ${item.path}`);
    console.log(`    refs: ${item.sources.join(', ')}`);
    count++;
    if (count >= 40) {
      console.log(`  ... and ${missing.length - count - shown.size} more`);
      break;
    }
  }

  console.log('\n--- PAGE LINKS WITH NO GET ROUTE (possible 404 on navigation) ---');
  count = 0;
  for (const item of suspicious) {
    console.log(`  ${item.path} — ${item.note}`);
    console.log(`    refs: ${item.sources.join(', ')}`);
    count++;
    if (count >= 25) break;
  }

  console.log('\n--- NOTE ---');
  console.log('HTTP 505 (Version Not Supported) was not found in code; you likely mean 500 (server error).');
  console.log('500 errors need runtime/DB testing — static scan cannot detect them all.');
}

main();
