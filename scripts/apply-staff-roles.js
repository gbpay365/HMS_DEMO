'use strict';
/**
 * Apply staff roles from the staff_logins roster (Employee / User Name / Role).
 * Usage: node scripts/apply-staff-roles.js [--dry-run]
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const ROSTER = [
  { username: 'sidney.tazeh', roleTitle: 'Doctor' },
  { username: 'mbakwa.rickeins', roleTitle: 'Doctor' },
  { username: 'desmond.yenge', roleTitle: 'Doctor' },
  { username: 'jessie.titi', roleTitle: 'Cashier' },
  { username: 'mukeh.pancratius', roleTitle: 'Nurse' },
  { username: 'peter.tazeh', roleTitle: 'Director' },
  { username: 'ngii.tazeh', roleTitle: 'Nurse' },
  { username: 'kenedy.foryoung', roleTitle: 'Nurse' },
  { username: 'geh.meh', roleTitle: 'Radiologist' },
  { username: 'munoh.kenne', roleTitle: 'Radiologist' },
  { username: 'mary.esele', roleTitle: 'Pharmacist' },
  { username: 'nicholas.ade', roleTitle: 'Lab Tech' },
];

/** Map spreadsheet role labels to tbl_role.title values. */
const ROLE_TITLE_ALIASES = {
  doctor: 'Doctor',
  cashier: 'Cashier',
  nurse: 'Nurse',
  'hospital director': 'Director',
  director: 'Director',
  radiologist: 'Radiologist',
  pharmacist: 'Pharmacist',
  'laboratory technician': 'Lab Tech',
  'lab technician': 'Lab Tech',
  'lab tech': 'Lab Tech',
};

function normUser(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveRoleTitle(label) {
  const key = String(label || '').trim().toLowerCase();
  return ROLE_TITLE_ALIASES[key] || String(label || '').trim();
}

async function loadRoleMap(pool) {
  const [rows] = await pool.query('SELECT role, title FROM tbl_role');
  const byTitle = new Map();
  for (const row of rows || []) {
    byTitle.set(String(row.title || '').trim().toLowerCase(), String(row.role));
  }
  return byTitle;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });

  const roleByTitle = await loadRoleMap(pool);
  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const entry of ROSTER) {
    const username = normUser(entry.username);
    const title = resolveRoleTitle(entry.roleTitle);
    const roleId = roleByTitle.get(title.toLowerCase());
    if (!roleId) {
      console.error(`No tbl_role row for title "${title}" (${entry.username})`);
      missing += 1;
      continue;
    }

    const [rows] = await pool.query(
      'SELECT id, first_name, last_name, username, role FROM tbl_employee WHERE LOWER(TRIM(username)) = ? LIMIT 1',
      [username]
    );
    const emp = rows && rows[0];
    if (!emp) {
      console.warn(`Employee not found: ${entry.username}`);
      missing += 1;
      continue;
    }

    const current = String(emp.role ?? '').trim();
    if (current === String(roleId)) {
      console.log(`= ${emp.first_name} ${emp.last_name} (${emp.username}) already ${title} (${roleId})`);
      skipped += 1;
      continue;
    }

    console.log(
      `${dryRun ? '[dry-run] ' : ''}${emp.first_name} ${emp.last_name} (${emp.username}): ${current || '—'} → ${title} (${roleId})`
    );
    if (!dryRun) {
      await pool.query('UPDATE tbl_employee SET role = ? WHERE id = ?', [roleId, emp.id]);
    }
    updated += 1;
  }

  console.log(`\nDone. Updated: ${updated}, unchanged: ${skipped}, missing/errors: ${missing}${dryRun ? ' (dry-run)' : ''}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
