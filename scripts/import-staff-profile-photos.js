'use strict';

/**
 * Download staff profile photos from the saved CLEAR staff page and attach
 * them to matching tbl_employee rows by first name.
 */

const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const { loadEnv } = require('../lib/loadEnv');
const ensureEmployeeHrSchema = require('../lib/ensureEmployeeHrSchema');
const { ensureStaffProfileUploadRoot, STAFF_PROFILE_UPLOAD_ROOT } = require('../lib/staffProfilePhotoUpload');

loadEnv();

const STAFF_PAGE = 'C:\\Backup\\Demo\\Profile\\staff_page.html';

const TARGETS = [
  'Sidney',
  'Mbakwa',
  'Desmond',
  'Jessie',
  'Mukeh',
  'Peter',
  'Ngii',
  'Kenedy',
  'Geh',
  'Munoh',
  'Mary',
  'Nicholas',
];

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extensionFromUrl(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
}

function findImageForName(html, firstName) {
  const matches = [...html.matchAll(new RegExp(escapeRegex(firstName), 'gi'))];
  for (const match of matches) {
    if (typeof match.index !== 'number') continue;
    const before = html.slice(Math.max(0, match.index - 5000), match.index);
    const urls = [...before.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((m) => m[1]);
    const url = urls.reverse().find((candidate) => /\/wp-content\/uploads\//i.test(candidate) && !/login-logo/i.test(candidate));
    if (url) return url;
  }
  return '';
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed ${response.status} for ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, buffer);
}

async function main() {
  ensureStaffProfileUploadRoot();
  const html = await fs.readFile(STAFF_PAGE, 'utf8');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 3,
  });

  try {
    await ensureEmployeeHrSchema(pool);
    for (const firstName of TARGETS) {
      const url = findImageForName(html, firstName);
      if (!url) {
        console.warn(`[skip] ${firstName}: no image URL found`);
        continue;
      }
      const filename = `${firstName.toLowerCase()}${extensionFromUrl(url)}`;
      const destination = path.join(STAFF_PROFILE_UPLOAD_ROOT, filename);
      await download(url, destination);
      const relativePath = `staff-profiles/${filename}`;
      const [result] = await pool.query(
        `UPDATE tbl_employee
         SET photo_path=?
         WHERE LOWER(first_name)=LOWER(?)
            OR LOWER(SUBSTRING_INDEX(first_name, ' ', 1))=LOWER(?)
            OR LOWER(username)=LOWER(?)`,
        [relativePath, firstName, firstName, firstName]
      );
      console.log(`[ok] ${firstName}: ${relativePath} (${result.affectedRows} employee rows)`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
