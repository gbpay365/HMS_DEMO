'use strict';

/**
 * Repair common UTF-8 mojibake (UTF-8 bytes read as Windows-1252 / Latin-1, then stored as UTF-8).
 * Example: em dash "—" becomes "ΓÇö" in tbl_service_catalog after a bad import/connection charset.
 */
const REPLACEMENTS = [
  ['ΓÇö', '\u2014'], // em dash
  ['ΓÇô', '\u2013'], // en dash
  ['ΓÇó', '\u2022'], // bullet
  ['Γï»', '\u203A'], // single right-pointing angle quotation
  ['â€"', '\u2014'],
  ['â€“', '\u2013'],
  ['â€¢', '\u2022'],
  ['â€™', '\u2019'], // right single quotation mark
  ['â€œ', '\u201C'], // left double quotation mark
  ['â€\u009d', '\u201D'], // right double quotation mark (sometimes split)
  ['â€\u009c', '\u201C'],
  ['Ã©', '\u00E9'],
  ['Ã¨', '\u00E8'],
  ['Ã ', '\u00E0'],
  ['Ã¢', '\u00E2'],
  ['Ã®', '\u00EE'],
  ['Ã´', '\u00F4'],
  ['Ã»', '\u00FB'],
  ['Ã§', '\u00E7'],
  ['Ã‰', '\u00C9'],
  ['├⌐', '\u00E9'],
  ['├®', '\u00EE'],
  ['├¿', '\u00EF'],
  ['├á', '\u00E0'],
  ['├º', '\u00F9'],
  ['├╗', '\u00FB'],
  ['├╣', '\u00F9'],
  ['├ñ', '\u00E4'],
  ['├╢', '\u00F6'],
];

function fixUtf8Mojibake(value) {
  if (value == null || value === '') return value;
  let out = String(value);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [bad, good] of REPLACEMENTS) {
      if (out.includes(bad)) {
        out = out.split(bad).join(good);
        changed = true;
      }
    }
  }
  return out;
}

function fixUtf8MojibakeFields(row, fields) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const field of fields) {
    if (out[field] != null) out[field] = fixUtf8Mojibake(out[field]);
  }
  return out;
}

function fixUtf8MojibakeRows(rows, fields) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => fixUtf8MojibakeFields(row, fields));
}

function needsMojibakeRepair(value) {
  const s = String(value || '');
  return REPLACEMENTS.some(([bad]) => s.includes(bad));
}

/**
 * One-time / idempotent repair of catalog text columns in the database.
 * @param {import('mysql2/promise').Pool} pool
 */
async function repairServiceCatalogTextEncoding(pool) {
  const cols = ['name', 'department_name', 'subcategory', 'description', 'cpt_code'];
  const [rows] = await pool.query(
    `SELECT id, name, department_name, subcategory, description, cpt_code
     FROM tbl_service_catalog
     WHERE name LIKE '%ΓÇ%'
        OR name LIKE '%â€%'
        OR name LIKE '%Ã%'
        OR name LIKE '%├%'
        OR department_name LIKE '%ΓÇ%'
        OR department_name LIKE '%â€%'
        OR description LIKE '%ΓÇ%'
        OR description LIKE '%â€%'`
  ).catch(() => [[]]);

  let repaired = 0;
  for (const row of rows || []) {
    const next = fixUtf8MojibakeFields(row, cols);
    const dirty = cols.some((c) => String(row[c] || '') !== String(next[c] || ''));
    if (!dirty) continue;
    await pool.query(
      `UPDATE tbl_service_catalog
       SET name = ?, department_name = ?, subcategory = ?, description = ?, cpt_code = ?
       WHERE id = ? LIMIT 1`,
      [
        next.name,
        next.department_name,
        next.subcategory,
        next.description,
        next.cpt_code,
        row.id,
      ]
    );
    repaired += 1;
  }
  return repaired;
}

module.exports = {
  fixUtf8Mojibake,
  fixUtf8MojibakeFields,
  fixUtf8MojibakeRows,
  needsMojibakeRepair,
  repairServiceCatalogTextEncoding,
};
