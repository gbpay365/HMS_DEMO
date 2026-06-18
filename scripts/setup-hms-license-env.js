'use strict';

/**
 * Configure hospital HMS with ZAIZENS license PUBLIC keys (safe for client servers).
 *
 * Usage (from HMS install root, e.g. C:\Program Files\ZAIZENS\HMS):
 *   node scripts/setup-hms-license-env.js
 *   node scripts/setup-hms-license-env.js --keys-dir config\license-keys
 *   node scripts/setup-hms-license-env.js --env D:\HMS-Data\.env
 *
 * On hardened Windows servers (C:\Program Files\ZAIZENS\HMS), run elevated:
 *   powershell -ExecutionPolicy Bypass -File scripts\setup-hms-license-env.ps1
 *
 * After running, restart the HMS app / Windows service.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const DEFAULT_KEYS_DIRS = [
  path.join(root, 'config', 'license-keys'),
  path.join(root, 'keys'),
  path.join(root, 'license-generator', 'keys'),
];

function parseArgs(argv) {
  const opts = {
    keysDir: null,
    envPath: path.join(root, '.env'),
    outputPath: null,
    port: null,
    dryRun: false,
    printOnly: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--print') opts.printOnly = true;
    else if (arg === '--keys-dir') opts.keysDir = path.resolve(argv[++i] || '');
    else if (arg === '--env') opts.envPath = path.resolve(argv[++i] || '');
    else if (arg === '--output') opts.outputPath = path.resolve(argv[++i] || '');
    else if (arg === '--port') opts.port = String(argv[++i] || '').trim();
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Configure LICENSE_RSA_PUBLIC_KEY_PEM and LICENSE_ED25519_PUBLIC_KEY_PEM in .env',
        '',
        'Options:',
        '  --keys-dir <path>   Folder with rsa-public.pem and ed25519-public.pem',
        '  --env <path>        Target .env file (default: <HMS root>/.env)',
        '  --output <path>     Write merged .env to a writable path (if --env is locked)',
        '  --port <number>     Set PORT in .env (e.g. 80 for production HTTP)',
        '  --print             Print LICENSE_* lines only (paste into .env as Admin)',
        '  --dry-run           Show what would change without writing',
        '',
        'Windows Program Files installs are read-only for normal users.',
        'Run elevated: powershell -ExecutionPolicy Bypass -File scripts\\setup-hms-license-env.ps1',
        '',
        'Default key folders (first match wins):',
        ...DEFAULT_KEYS_DIRS.map((d) => `  - ${d}`),
      ].join('\n'));
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return opts;
}

function readKeyFile(dir, name) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8').trim();
}

function resolveKeysDir(explicitDir) {
  const candidates = explicitDir ? [explicitDir] : DEFAULT_KEYS_DIRS;
  for (const dir of candidates) {
    const rsa = readKeyFile(dir, 'rsa-public.pem');
    const ed = readKeyFile(dir, 'ed25519-public.pem');
    if (rsa && ed) return { dir, rsa, ed };
  }
  return null;
}

function pemEnvValue(pem) {
  return `"${pem.replace(/\n/g, '\\n')}"`;
}

function validatePublicKey(pem, label) {
  try {
    crypto.createPublicKey(pem);
  } catch (err) {
    throw new Error(`${label} is not a valid PEM public key: ${err.message}`);
  }
}

function upsertEnvLines(content, updates) {
  const lines = content.split(/\r?\n/);
  const keys = Object.keys(updates);
  const seen = new Set();

  const next = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match) return line;
    const key = match[1];
    if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });

  for (const key of keys) {
    if (!seen.has(key)) next.push(`${key}=${updates[key]}`);
  }

  return next.join('\n').replace(/\n?$/, '\n');
}

function loadEnvTemplate(envPath) {
  if (fs.existsSync(envPath)) return fs.readFileSync(envPath, 'utf8');
  const example = path.join(root, 'env.example');
  if (fs.existsSync(example)) return fs.readFileSync(example, 'utf8');
  return '# HMS environment\n';
}

function isPermissionError(err) {
  return err && (err.code === 'EPERM' || err.code === 'EACCES');
}

function printPermissionHelp(targetPath) {
  console.error('');
  console.error(`Cannot write to: ${targetPath}`);
  console.error('');
  console.error('On deployed servers, .env is locked read-only — even for Administrators.');
  console.error('Do not run the .js file directly; use the elevated PowerShell wrapper instead.');
  console.error('');
  console.error('Fix — pick one:');
  console.error('');
  console.error('  1) Elevated PowerShell wrapper (recommended):');
  console.error('     Right-click PowerShell -> Run as administrator');
  console.error('     cd "C:\\Program Files\\ZAIZENS\\HMS\\scripts"');
  console.error('     powershell -ExecutionPolicy Bypass -File .\\setup-hms-license-env.ps1');
  console.error('');
  console.error('  2) Print lines, unlock .env, paste, re-lock:');
  console.error('     node scripts\\setup-hms-license-env.js --print');
  console.error('     icacls "C:\\Program Files\\ZAIZENS\\HMS\\.env" /grant Administrators:F');
  console.error('     (edit .env in Notepad, save)');
  console.error('     icacls "C:\\Program Files\\ZAIZENS\\HMS\\.env" /inheritance:r /grant:r Administrators:R SYSTEM:F');
  console.error('');
  console.error('  3) Write to temp, then copy with unlock:');
  console.error('     node scripts\\setup-hms-license-env.js --output %TEMP%\\hms.env');
  console.error('     icacls "C:\\Program Files\\ZAIZENS\\HMS\\.env" /grant Administrators:F');
  console.error('     copy /Y %TEMP%\\hms.env "C:\\Program Files\\ZAIZENS\\HMS\\.env"');
  console.error('');
}

function writeEnvFile(targetPath, content) {
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf8');
    return targetPath;
  } catch (err) {
    if (!isPermissionError(err)) throw err;
    printPermissionHelp(targetPath);
    process.exit(1);
  }
}

function main() {
  const opts = parseArgs(process.argv);
  const resolved = resolveKeysDir(opts.keysDir);

  if (!resolved) {
    console.error('');
    console.error('License public key files were not found.');
    console.error('');
    console.error('Expected both files in one of these folders:');
    for (const dir of opts.keysDir ? [opts.keysDir] : DEFAULT_KEYS_DIRS) {
      console.error(`  ${dir}\\rsa-public.pem`);
      console.error(`  ${dir}\\ed25519-public.pem`);
    }
    console.error('');
    process.exit(1);
  }

  validatePublicKey(resolved.rsa, 'rsa-public.pem');
  validatePublicKey(resolved.ed, 'ed25519-public.pem');

  const updates = {
    LICENSE_RSA_PUBLIC_KEY_PEM: pemEnvValue(resolved.rsa),
    LICENSE_ED25519_PUBLIC_KEY_PEM: pemEnvValue(resolved.ed),
  };
  if (opts.port) {
    if (!/^\d+$/.test(opts.port) || Number(opts.port) < 1 || Number(opts.port) > 65535) {
      throw new Error(`Invalid --port value: ${opts.port}`);
    }
    updates.PORT = opts.port;
  }

  console.log(`Keys source: ${resolved.dir}`);
  if (opts.port) console.log(`PORT: ${opts.port}`);

  if (opts.printOnly) {
    console.log('');
    console.log('Add or replace these lines in .env (edit with Notepad as Administrator):');
    console.log('');
    if (opts.port) console.log(`PORT=${updates.PORT}`);
    console.log(`LICENSE_RSA_PUBLIC_KEY_PEM=${updates.LICENSE_RSA_PUBLIC_KEY_PEM}`);
    console.log(`LICENSE_ED25519_PUBLIC_KEY_PEM=${updates.LICENSE_ED25519_PUBLIC_KEY_PEM}`);
    console.log('');
    process.exit(0);
  }

  const templatePath = opts.envPath;
  const writePath = opts.outputPath || opts.envPath;
  const before = loadEnvTemplate(templatePath);
  const after = upsertEnvLines(before, updates);

  console.log(`Target .env: ${writePath}`);

  if (opts.dryRun) {
    const parts = ['LICENSE_RSA_PUBLIC_KEY_PEM', 'LICENSE_ED25519_PUBLIC_KEY_PEM'];
    if (opts.port) parts.unshift(`PORT=${opts.port}`);
    console.log(`Dry run — .env would be updated with ${parts.join(', ')}`);
    process.exit(0);
  }

  writeEnvFile(writePath, after);

  console.log('');
  if (opts.outputPath) {
    console.log(`Wrote merged .env to: ${writePath}`);
    console.log('Copy it over the live .env as Administrator, then restart HMS:');
    console.log(`  copy /Y "${writePath}" "${path.join(root, '.env')}"`);
  } else {
    console.log('Updated .env with license public keys' + (opts.port ? ` and PORT=${opts.port}` : '') + '.');
  }
  console.log('Restart HMS now (Windows service, PM2, or node app.js) so the app reloads .env.');
  console.log('');
}

main();
