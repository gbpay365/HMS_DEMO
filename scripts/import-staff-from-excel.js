'use strict';

/**
 * Import employees from staff_logins.xlsx into tbl_employee.
 *
 * Handles:
 *  - Auto-create departments / specialisations missing from catalog
 *  - Comma-separated departments and specialisations
 *  - Profile pictures from Picture column (local path, HYPERLINK, or URL)
 *  - Short Biography -> bio
 *  - Employee name, User Name, Password from sheet
 *
 * Usage:
 *   node scripts/import-staff-from-excel.js [excel-path] [--dry-run] [--update]
 *
 * Default excel: C:\Backup\Demo\Profile\staff_logins.xlsx
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const { registerDoctorSpecialisation } = require('../lib/hmsDoctorSpecialisations');
const {
  ensureEmployeeClinicalLinksSchema,
  primaryLegacyFields,
  syncEmployeeDepartments,
  syncEmployeeSpecialisations,
} = require('../lib/hmsEmployeeClinicalLinks');
const { resolveProfileEmoji } = require('../lib/hmsEmployeeProfile');

const DEFAULT_XLSX = 'C:\\Backup\\Demo\\Profile\\staff_logins.xlsx';
const UPLOAD_SUBDIR = path.join('uploads', 'doctors');

const NAME_SUFFIX_RE = /,?\s*(ph\.?d\.?|dnp|md|mph|do|rn|aprnp?)\.?$/i;

function parseArgs(argv) {
  const args = argv.slice(2);
  let excelPath = DEFAULT_XLSX;
  let dryRun = false;
  let updateExisting = false;
  for (const arg of args) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--update') updateExisting = true;
    else if (!arg.startsWith('-')) excelPath = arg;
  }
  return { excelPath, dryRun, updateExisting };
}

function normLabel(value) {
  return String(value || '').trim().slice(0, 120);
}

function parseCommaList(value) {
  const out = [];
  const seen = new Set();
  for (const part of String(value || '').split(/[,;|]/)) {
    const label = normLabel(part);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

function splitEmployeeName(full) {
  let name = String(full || '').trim();
  name = name.replace(NAME_SUFFIX_RE, '').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    const one = parts[0] || 'Staff';
    return { first: one, last: one };
  }
  return {
    first: parts.slice(0, -1).join(' '),
    last: parts[parts.length - 1],
  };
}

function extractPictureRef(cell) {
  if (!cell) return '';
  if (cell.f) {
    const m = String(cell.f).match(/HYPERLINK\s*\(\s*"([^"]+)"/i);
    if (m) return m[1];
  }
  const v = String(cell.v || '').trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (v && v !== 'Link' && (/^[a-zA-Z]:[\\/]/.test(v) || v.includes('\\') || v.includes('/'))) return v;
  return '';
}

function readStaffRows(xlsxPath) {
  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`Excel file not found: ${xlsxPath}`);
  }
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws['!ref']) throw new Error('Worksheet is empty');

  const range = XLSX.utils.decode_range(ws['!ref']);
  const headerByCol = {};
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    const cell = ws[addr];
    if (cell && cell.v != null && String(cell.v).trim()) {
      headerByCol[c] = String(cell.v).trim();
    }
  }
  const pictureCol = Object.entries(headerByCol).find(([, h]) => /^picture$/i.test(h))?.[0];
  const pictureColNum = pictureCol != null ? parseInt(pictureCol, 10) : null;

  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return rows
    .map((row, idx) => {
      let pictureRef = '';
      if (pictureColNum != null) {
        const addr = XLSX.utils.encode_cell({ r: range.s.r + 1 + idx, c: pictureColNum });
        pictureRef = extractPictureRef(ws[addr]);
      }
      return {
        employee: normLabel(row.Employee || row.Name || row.employee),
        departments: parseCommaList(row.Department || row.Departments || ''),
        specialisations: parseCommaList(row.Specialisation || row.Specialization || row.Specialisations || ''),
        username: normLabel(row['User Name'] || row.Username || row.username),
        password: String(row.Password ?? row.password ?? '').trim(),
        biography: String(row['Short Biography'] || row.Biography || row.bio || '').trim(),
        pictureRef,
      };
    })
    .filter((r) => r.employee && r.username);
}

function mapRole(departments, specialisations) {
  const blob = `${departments.join(' ')} ${specialisations.join(' ')}`.toLowerCase();
  if (/\b(ceo|coo|cfo|managing director)\b/.test(blob)) return '1';
  if (/\b(technologist|sonograph|sonography|radiology tech)\b/.test(blob)) return '6';
  return '2';
}

function slugFileBase(username) {
  return String(username || 'staff')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'staff';
}

function extFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext;
  return '.jpg';
}

function downloadUrl(url, dest) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    client
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlink(dest, () => {});
          return resolve(downloadUrl(res.headers.location, dest));
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {});
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      })
      .on('error', (err) => {
        file.close();
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function materializePhoto(pictureRef, username, dryRun) {
  const ref = String(pictureRef || '').trim();
  if (!ref) return null;

  const uploadRoot = path.join(__dirname, '..', 'public', UPLOAD_SUBDIR);
  const ext = extFromPath(ref);
  const fileName = `${slugFileBase(username)}${ext}`;
  const absDest = path.join(uploadRoot, fileName);
  const relPath = path.posix.join(UPLOAD_SUBDIR.replace(/\\/g, '/'), fileName);

  if (dryRun) return relPath;

  fs.mkdirSync(uploadRoot, { recursive: true });

  if (/^https?:\/\//i.test(ref)) {
    await downloadUrl(ref, absDest);
    return relPath;
  }

  const localSrc = path.isAbsolute(ref) ? ref : path.resolve(path.dirname(DEFAULT_XLSX), ref);
  if (!fs.existsSync(localSrc)) {
    throw new Error(`Picture file not found: ${localSrc}`);
  }
  fs.copyFileSync(localSrc, absDest);
  return relPath;
}

async function ensureDepartment(pool, name) {
  const label = normLabel(name);
  if (!label) return null;
  const [[existing]] = await pool.query(
    'SELECT id FROM tbl_department WHERE TRIM(LOWER(department_name)) = TRIM(LOWER(?)) LIMIT 1',
    [label]
  );
  if (existing) return label;
  await pool.query(
    'INSERT INTO tbl_department (department_name, status, description) VALUES (?, 1, ?)',
    [label, 'Imported from staff Excel']
  );
  return label;
}

async function ensureDepartments(pool, names) {
  const out = [];
  for (const name of names) {
    const label = await ensureDepartment(pool, name);
    if (label) out.push(label);
  }
  return out;
}

async function ensureSpecialisations(pool, names) {
  const out = [];
  for (const name of names) {
    const label = await registerDoctorSpecialisation(pool, name);
    if (label) out.push(label);
  }
  return out;
}

async function nextAutoEmployeeStaffId(pool) {
  const year = new Date().getFullYear();
  const prefix = `EMP-${year}-`;
  const [rows] = await pool.query(
    'SELECT employee_id FROM tbl_employee WHERE employee_id LIKE ? ORDER BY id DESC LIMIT 80',
    [`${prefix}%`]
  );
  let maxSeq = 0;
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${esc}(\\d+)$`);
  for (const row of rows || []) {
    const m = String(row.employee_id || '').match(re);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10) || 0);
  }
  return `${prefix}${String(maxSeq + 1).padStart(5, '0')}`;
}

function defaultEmail(username) {
  const safe = String(username || 'staff').replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
  return `${safe || 'staff'}@staff.local`;
}

function todayJoinDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function upsertEmployee(pool, row, options) {
  const { dryRun, updateExisting } = options;
  const { first, last } = splitEmployeeName(row.employee);
  const username = row.username;
  const password = row.password || '12345';
  const departments = await ensureDepartments(pool, row.departments);
  const specialisations = await ensureSpecialisations(pool, row.specialisations);
  const legacy = primaryLegacyFields(departments, specialisations);
  const role = mapRole(departments, specialisations);
  const email = defaultEmail(username);
  const bio = row.biography || `${specialisations[0] || departments[0] || 'Staff'} — Clear Radiology`;
  const joiningDate = todayJoinDate();
  const profileEmoji = resolveProfileEmoji('', 'Male');

  let photoPath = null;
  try {
    photoPath = await materializePhoto(row.pictureRef, username, dryRun);
  } catch (err) {
    console.warn(`  [photo] ${username}: ${err.message}`);
  }

  const [[existing]] = await pool.query(
    'SELECT id FROM tbl_employee WHERE LOWER(username) = LOWER(?) LIMIT 1',
    [username]
  );

  if (existing && !updateExisting) {
    return { action: 'skipped', username, reason: 'username already exists' };
  }

  if (dryRun) {
    return {
      action: existing ? 'would-update' : 'would-insert',
      username,
      name: `${first} ${last}`,
      role,
      departments,
      specialisations,
      photoPath,
    };
  }

  const hash = await bcrypt.hash(password, 10);

  if (existing) {
    const id = existing.id;
    await pool.query(
      `UPDATE tbl_employee SET
         first_name=?, last_name=?, password=?, bio=?,
         primary_department=?, specialisation=?, photo_path=COALESCE(?, photo_path),
         role=?, profile_emoji=?
       WHERE id=?`,
      [
        first,
        last,
        hash,
        bio,
        legacy.primary_department,
        legacy.specialisation,
        photoPath,
        parseInt(role, 10),
        profileEmoji,
        id,
      ]
    );
    if (departments.length) await syncEmployeeDepartments(pool, id, departments);
    if (specialisations.length) await syncEmployeeSpecialisations(pool, id, specialisations);
    return { action: 'updated', id, username, name: `${first} ${last}`, role, departments, specialisations, photoPath };
  }

  const employeeId = await nextAutoEmployeeStaffId(pool);
  const [result] = await pool.query(
    `INSERT INTO tbl_employee (
       first_name, last_name, username, emailid, password, dob, employee_id, joining_date,
       gender, address, phone, bio, primary_department, specialisation, photo_path,
       profile_emoji, role, status
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [
      first,
      last,
      username,
      email,
      hash,
      '',
      employeeId,
      joiningDate,
      'Male',
      'Clear Radiology Buea',
      '0000000000',
      bio,
      legacy.primary_department,
      legacy.specialisation,
      photoPath,
      profileEmoji,
      parseInt(role, 10),
    ]
  );
  const newId = result.insertId;
  if (departments.length) await syncEmployeeDepartments(pool, newId, departments);
  if (specialisations.length) await syncEmployeeSpecialisations(pool, newId, specialisations);
  return {
    action: 'inserted',
    id: newId,
    username,
    name: `${first} ${last}`,
    role,
    departments,
    specialisations,
    photoPath,
    employeeId,
  };
}

(async () => {
  const { excelPath, dryRun, updateExisting } = parseArgs(process.argv);
  console.log(`Reading: ${excelPath}`);
  const rows = readStaffRows(excelPath);
  console.log(`Found ${rows.length} staff row(s)${dryRun ? ' (dry-run)' : ''}`);

  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });

  await ensureEmployeeClinicalLinksSchema(pool);

  const results = [];
  for (const row of rows) {
    try {
      const result = await upsertEmployee(pool, row, { dryRun, updateExisting });
      results.push(result);
      console.log(`  ${result.action}: ${result.username} — ${result.name || ''}`);
      if (result.departments?.length) console.log(`    departments: ${result.departments.join(', ')}`);
      if (result.specialisations?.length) console.log(`    specialisations: ${result.specialisations.join(', ')}`);
      if (result.photoPath) console.log(`    photo: ${result.photoPath}`);
    } catch (err) {
      console.error(`  FAILED ${row.username}: ${err.message}`);
      results.push({ action: 'failed', username: row.username, error: err.message });
    }
  }

  const inserted = results.filter((r) => r.action === 'inserted').length;
  const updated = results.filter((r) => r.action === 'updated').length;
  const skipped = results.filter((r) => r.action === 'skipped').length;
  const failed = results.filter((r) => r.action === 'failed').length;

  console.log('\nSummary:', { inserted, updated, skipped, failed, dryRun });
  await pool.end();
})().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
