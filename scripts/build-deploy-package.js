'use strict';

/**
 * Build a hospital deployment folder with development sources excluded.
 * Usage:
 *   node scripts/build-deploy-package.js
 *   node scripts/build-deploy-package.js --obfuscate
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const outRoot = path.join(root, 'dist', 'hms-deploy');
const obfuscate = process.argv.includes('--obfuscate');

const EXCLUDE_DIRS = new Set([
  '.git',
  'frontend',
  'license-generator',
  'node_modules',
  'dist',
  'Update',
  'tmp',
  'uploads',
  'docs',
  'scripts',
  'migrations',
  'database',
  'prisma',
  'tests',
  'test',
  '__tests__',
]);

const EXCLUDE_FILES = new Set([
  '.env',
  '.env.production',
  'env.example',
  '.gitignore',
  'hms_export.sql',
]);

const EXCLUDE_PREFIXES = ['diagnostic', 'tmp/'];

function shouldSkip(rel) {
  const norm = rel.replace(/\\/g, '/');
  const parts = norm.split('/');
  // Exclude top-level dist/ (deploy scratch) but keep public/dist/ UI bundles.
  if (parts[0] === 'dist') return true;
  if (parts.some((p) => EXCLUDE_DIRS.has(p) && p !== 'dist')) return true;
  const base = parts[parts.length - 1];
  if (EXCLUDE_FILES.has(base)) return true;
  if (EXCLUDE_PREFIXES.some((p) => norm.startsWith(p))) return true;
  if (/\.(md|log|sql)$/i.test(base) && !norm.startsWith('locales/')) return true;
  return false;
}

function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyTree(srcDir, destDir, relBase, manifest) {
  for (const name of fs.readdirSync(srcDir)) {
    const rel = relBase ? `${relBase}/${name}` : name;
    if (shouldSkip(rel)) continue;
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copyTree(src, dest, rel, manifest);
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      manifest.push(rel.replace(/\\/g, '/'));
    }
  }
}

function installProductionDeps() {
  execSync('npm ci --omit=dev', { cwd: outRoot, stdio: 'inherit', shell: true });
}

function loadObfuscator() {
  try {
    return require(path.join(root, 'node_modules', 'javascript-obfuscator'));
  } catch {
    // fall through
  }
  console.error('');
  console.error('javascript-obfuscator is not installed locally (devDependency).');
  console.error('Run once from the project root:');
  console.error('  npm install --include=dev');
  console.error('');
  console.error('Or build without obfuscation:');
  console.error('  npm run build:deploy');
  console.error('');
  process.exit(1);
}

function maybeObfuscate() {
  if (!obfuscate) return;
  const JavaScriptObfuscator = loadObfuscator();

  const targets = [path.join(outRoot, 'lib'), path.join(outRoot, 'routes')];
  let count = 0;
  for (const dir of targets) {
    if (!fs.existsSync(dir)) continue;
    const walk = (d) => {
      for (const name of fs.readdirSync(d)) {
        const p = path.join(d, name);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.js')) {
          const code = fs.readFileSync(p, 'utf8');
          const result = JavaScriptObfuscator.obfuscate(code, {
            compact: true,
            controlFlowFlattening: false,
            deadCodeInjection: false,
            stringArray: true,
            stringArrayThreshold: 0.5,
            renameGlobals: false,
          });
          fs.writeFileSync(p, result.getObfuscatedCode(), 'utf8');
          count += 1;
        }
      }
    };
    walk(dir);
  }
  console.log(`Obfuscated ${count} files under lib/ and routes/`);
}

function copyBackupScripts() {
  const scriptsOut = path.join(outRoot, 'scripts');
  const docsScriptsOut = path.join(outRoot, 'docs', 'scripts');
  const docsScripts = path.join(root, 'docs', 'scripts');
  fs.mkdirSync(scriptsOut, { recursive: true });
  if (fs.existsSync(docsScripts)) {
    fs.mkdirSync(docsScriptsOut, { recursive: true });
    for (const name of fs.readdirSync(docsScripts)) {
      const src = path.join(docsScripts, name);
      if (!fs.statSync(src).isFile()) continue;
      fs.copyFileSync(src, path.join(scriptsOut, name));
      manifest.push('scripts/' + name);
      if (!name.endsWith('.example')) {
        fs.copyFileSync(src, path.join(docsScriptsOut, name));
        manifest.push('docs/scripts/' + name);
      }
    }
  }
  const files = [
    'zaizens-hms-backup.ps1',
    'mysql-backup.cnf.example',
    'setup-hms-license-env.js',
    'setup-hms-license-env.ps1',
    '06b-install-nssm.ps1',
    '07-install-hms-service.ps1',
    'apply-deploy-update.ps1',
    'export-deploy-data.js',
    'export-pharmacy-deploy-data.js',
    'import-deploy-data.js',
    'import-pharmacy-deploy-data.js',
    'push-dev-pharmacy-to-target.js',
    'sync-local-railway.js',
    'railway-sync-core.js',
    'db-sync.env.example',
  ];
  for (const name of files) {
    const src = path.join(root, 'scripts', name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(scriptsOut, name));
      manifest.push('scripts/' + name);
    }
  }
}

function writeReadme() {
  const text = [
    'ZAIZENS HMS — deployment package',
    '================================',
    '',
    '1. Copy this entire folder to C:\\Program Files\\ZAIZENS\\HMS',
    '2. Create .env from your secure template (not included)',
    '3. Create writable uploads/ and tmp/ folders',
    '4. Configure nightly backup — see docs Section 18; scripts/zaizens-hms-backup.ps1',
    '5. License keys: node scripts/setup-hms-license-env.js  (then restart HMS)',
    '6. Start: node app.js  (or configure as Windows service)',
    '7. DB sync (optional): copy scripts/db-sync.env.example to scripts/db-sync.env,',
    '   edit credentials, double-click sync-database.bat, or register schedule task.',
    '',
    'Public UI bundles are under public/dist/',
    'Do not deploy frontend/src or license-generator private keys.',
    '',
    obfuscate ? 'lib/ and routes/ were obfuscated at build time.' : 'Rebuild with --obfuscate for JS obfuscation.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outRoot, 'DEPLOY-README.txt'), text, 'utf8');
}

rmrf(outRoot);
fs.mkdirSync(outRoot, { recursive: true });

const manifest = [];
copyTree(root, outRoot, '', manifest);
copyBackupScripts();

fs.mkdirSync(path.join(outRoot, 'tmp'), { recursive: true });
fs.mkdirSync(path.join(outRoot, 'uploads'), { recursive: true });

console.log('Installing production node_modules in deploy folder...');
installProductionDeps();

maybeObfuscate();
writeReadme();

fs.writeFileSync(
  path.join(outRoot, 'MANIFEST.txt'),
  manifest.sort().join('\n') + '\n',
  'utf8'
);

console.log('');
console.log('Deployment package ready:');
console.log(' ', outRoot);
console.log('Files:', manifest.length);
console.log('Next: copy to server, add .env, run node app.js');
