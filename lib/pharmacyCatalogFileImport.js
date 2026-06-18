'use strict';

const path = require('path');

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Loose key for pharmacy duplicate detection (brand, form, punctuation). */
function normPharmacyNameKey(s) {
  return normName(s)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(
      /\b(tablets?|tab|caps?(?:ules?)?|inj(?:ection)?s?|syrup|susp(?:ension)?|cream|ointment|gel|drops?|nebules?|ampoules?|sachets?|infusion|solution|powder|lozenges?|suppository|suppositories)\b/gi,
      ' '
    )
    .replace(/\b(\d+(?:\.\d+)?)\s*(mg|g|ml|iu|mcg|%)\b/gi, '$1$2')
    .replace(/[^\w\s.%/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cptForPharmacy(item, index) {
  const sn = parseInt(item.sn, 10) || index + 1;
  if (item.code) return String(item.code).slice(0, 20);
  return `PH${String(sn).padStart(3, '0')}`;
}

function pickBetterPharmacyRow(a, b) {
  if (!a) return b;
  if (!b) return a;
  const aGeneral = !String(a.usedFor || '').trim() || String(a.usedFor).trim() === 'General';
  const bGeneral = !String(b.usedFor || '').trim() || String(b.usedFor).trim() === 'General';
  if (aGeneral !== bGeneral) return bGeneral ? a : b;
  const aSection = String(a.section || '').trim();
  const bSection = String(b.section || '').trim();
  if (!aSection && bSection) return b;
  if (aSection && !bSection) return a;
  return b;
}

/**
 * Collapse duplicate medications inside one uploaded file.
 * @param {Array<{name:string,price:number,usedFor?:string,section?:string,sn?:number}>} rows
 */
function dedupeImportRows(rows) {
  const byKey = new Map();
  let mergedInFile = 0;

  for (const row of rows || []) {
    const name = String(row.name || '').trim();
    if (!name) continue;
    const key = normPharmacyNameKey(name) || normName(name);
    if (!key) continue;
    if (byKey.has(key)) {
      byKey.set(key, pickBetterPharmacyRow(byKey.get(key), row));
      mergedInFile++;
    } else {
      byKey.set(key, { ...row, name });
    }
  }

  return {
    rows: Array.from(byKey.values()),
    mergedInFile,
  };
}

function parsePriceToken(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const HEADER_ALIASES = {
  name: new Set(['medication', 'drug', 'product', 'name', 'item', 'medicament', 'service', 'designation']),
  price: new Set(['price', 'tariff', 'tarif', 'amount', 'xaf', 'cost', 'prix', 'unit price']),
  usedFor: new Set([
    'used for',
    'usedfor',
    'therapeutic',
    'class',
    'department',
    'indication',
    'usage',
    'category',
  ]),
  section: new Set(['section', 'subcategory', 'group', 'groupe', 'list section']),
  sn: new Set(['sn', 's n', '#', 'no', 'num', 'number', 'sno', 'id']),
};

function mapHeaderRow(cells) {
  const map = {};
  cells.forEach((cell, idx) => {
    const key = normHeader(cell);
    if (!key) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.has(key)) {
        map[field] = idx;
        break;
      }
    }
  });
  return map;
}

function rowFromCells(cells, colMap, currentSection, sn) {
  const get = (field, fallbackIdx) => {
    const idx = colMap[field];
    if (idx != null && cells[idx] != null) return String(cells[idx]).trim();
    if (fallbackIdx != null && cells[fallbackIdx] != null) return String(cells[fallbackIdx]).trim();
    return '';
  };

  const name = get('name', colMap.price == null && colMap.usedFor == null ? 0 : 1);
  if (!name || /^total\b/i.test(name)) return null;

  let price = parsePriceToken(get('price'));
  if (price == null) {
    for (let i = cells.length - 1; i >= 0; i--) {
      price = parsePriceToken(cells[i]);
      if (price != null) break;
    }
  }
  if (price == null) return null;

  let usedFor = get('usedFor');
  if (!usedFor && colMap.name != null && colMap.price != null) {
    const between = [];
    const start = (colMap.name ?? 0) + 1;
    const end = colMap.price ?? cells.length - 1;
    for (let i = start; i < end; i++) {
      const part = String(cells[i] ?? '').trim();
      if (part) between.push(part);
    }
    usedFor = between.join(' ').trim();
  }
  if (!usedFor && cells.length >= 3 && parsePriceToken(cells[cells.length - 1]) != null) {
    usedFor = cells
      .slice(1, -1)
      .map((c) => String(c ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  if (!usedFor) usedFor = 'General';

  const section = get('section') || currentSection || 'Pharmacy';
  const snVal = parseInt(get('sn'), 10) || sn;

  return {
    sn: snVal,
    name,
    price,
    usedFor,
    section,
  };
}

function splitDataLine(line) {
  if (line.includes('\t')) {
    return line.split('\t').map((p) => p.trim());
  }
  if (line.includes('|')) {
    return line.split('|').map((p) => p.trim());
  }
  if (/\s{2,}/.test(line)) {
    return line.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
  }
  const priceMatch = line.match(/^(.*?)(?:\s+)(\d[\d\s,.]*)\s*$/);
  if (priceMatch) {
    const left = priceMatch[1].trim();
    const price = priceMatch[2].trim();
    const midMatch = left.match(/^(.*?)(?:\s{2,}|\s[-–—]\s)(.+)$/);
    if (midMatch) {
      return [midMatch[1].trim(), midMatch[2].trim(), price];
    }
    return [left, price];
  }
  return [line];
}

function looksLikeSectionHeader(line, cells) {
  if (!line || cells.length > 4) return false;
  if (parsePriceToken(cells[cells.length - 1]) != null && cells.length >= 2) return false;
  if (/^(medication|drug|name|price|used\s*for|section|sn|#)\b/i.test(line)) return false;
  if (line.length > 90) return false;
  if (/^\d+[\.)]?\s/.test(line)) return false;
  return cells.length <= 2 || cells.every((c) => !parsePriceToken(c));
}

function parsePharmacyRowsFromText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);

  const rows = [];
  const warnings = [];
  let currentSection = 'Pharmacy';
  let sn = 0;

  for (const line of lines) {
    if (/^(medication|drug|name|price|used\s*for|tariff)\b/i.test(line) && /\b(price|tariff|xaf)\b/i.test(line)) {
      continue;
    }

    const cells = splitDataLine(line);
    if (looksLikeSectionHeader(line, cells)) {
      currentSection = cells.join(' ').trim() || currentSection;
      continue;
    }

    const row = rowFromCells(cells, {}, currentSection, ++sn);
    if (row) rows.push(row);
  }

  if (!rows.length) {
    warnings.push('No medication rows found in document text.');
  }
  return { rows, warnings };
}

function parsePharmacyRowsFromExcel(buffer) {
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch (_) {
    throw new Error('Excel support is unavailable (xlsx package not installed).');
  }

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { rows: [], warnings: ['Workbook has no sheets.'] };

  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const warnings = [];
  const rows = [];
  let colMap = null;
  let headerRowIdx = -1;
  let currentSection = 'Pharmacy';
  let sn = 0;

  for (let i = 0; i < matrix.length; i++) {
    const rawCells = (matrix[i] || []).map((c) => String(c ?? '').trim());
    if (!rawCells.some(Boolean)) continue;

    if (!colMap) {
      const candidate = mapHeaderRow(rawCells);
      if (candidate.name != null || candidate.price != null) {
        colMap = candidate;
        headerRowIdx = i;
        continue;
      }
    }

    if (!colMap && i - headerRowIdx <= 2 && rawCells.length >= 2) {
      colMap = { name: 0, usedFor: 1, price: 2 };
    }

    if (!colMap) continue;

    const mapped = rowFromCells(rawCells, colMap, currentSection, ++sn);
    if (mapped) {
      rows.push(mapped);
      continue;
    }

    if (looksLikeSectionHeader(rawCells.join(' '), rawCells)) {
      currentSection = rawCells.filter(Boolean).join(' ').trim() || currentSection;
    }
  }

  if (!rows.length) warnings.push('No medication rows found in spreadsheet.');
  return { rows, warnings };
}

async function extractTextFromPdf(buffer) {
  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch (_) {
    throw new Error('PDF support is unavailable (pdf-parse package not installed).');
  }
  const data = await pdfParse(buffer);
  return String(data.text || '');
}

async function extractTextFromDocx(buffer) {
  let mammoth;
  try {
    mammoth = require('mammoth');
  } catch (_) {
    throw new Error('Word support is unavailable (mammoth package not installed).');
  }
  const result = await mammoth.extractRawText({ buffer });
  return String(result.value || '');
}

function extOf(filename) {
  return path.extname(String(filename || '')).toLowerCase();
}

function finalizeParsedPharmacyRows(parsed) {
  const deduped = dedupeImportRows(parsed.rows || []);
  const warnings = [...(parsed.warnings || [])];
  if (deduped.mergedInFile > 0) {
    warnings.push(`Merged ${deduped.mergedInFile} duplicate row(s) in the uploaded file.`);
  }
  return { rows: deduped.rows, warnings, mergedInFile: deduped.mergedInFile };
}

/**
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} [mimetype]
 */
async function parsePharmacyCatalogFile(buffer, originalName, mimetype = '') {
  const ext = extOf(originalName);
  const mime = String(mimetype || '').toLowerCase();

  if (
    ext === '.xlsx' ||
    ext === '.xls' ||
    ext === '.csv' ||
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'text/csv'
  ) {
    return finalizeParsedPharmacyRows(parsePharmacyRowsFromExcel(buffer));
  }

  if (ext === '.pdf' || mime === 'application/pdf') {
    const text = await extractTextFromPdf(buffer);
    return finalizeParsedPharmacyRows(parsePharmacyRowsFromText(text));
  }

  if (
    ext === '.docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const text = await extractTextFromDocx(buffer);
    return finalizeParsedPharmacyRows(parsePharmacyRowsFromText(text));
  }

  if (ext === '.doc' || mime === 'application/msword') {
    throw new Error('Legacy .doc files are not supported. Save as .docx or export to Excel/PDF.');
  }

  throw new Error('Unsupported file type. Use Excel (.xlsx), PDF, or Word (.docx).');
}

/**
 * Deactivate duplicate active pharmacy catalog rows (same medication name key).
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ facilityId?: number, preferIds?: Set<number>|number[] }} [opts]
 */
async function dedupePharmacyCatalogInDb(pool, opts = {}) {
  const facilityId = Math.max(0, parseInt(opts.facilityId, 10) || 0);
  const prefer = new Set(
    Array.isArray(opts.preferIds) ? opts.preferIds : opts.preferIds ? [...opts.preferIds] : []
  );

  const [rows] = await pool.query(
    `SELECT id, name, price, department_name, subcategory, status, cpt_code, sort_order
     FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) = 'pharmacy' AND facility_id = ?`,
    [facilityId]
  );

  const groups = new Map();
  for (const row of rows || []) {
    const key = normPharmacyNameKey(row.name) || normName(row.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let duplicatesRemoved = 0;
  for (const group of groups.values()) {
    const active = group.filter((r) => Number(r.status) === 1);
    if (active.length <= 1) continue;

    const winner = active
      .slice()
      .sort((a, b) => {
        const aPref = prefer.has(a.id) ? 0 : 1;
        const bPref = prefer.has(b.id) ? 0 : 1;
        if (aPref !== bPref) return aPref - bPref;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      })[0];

    for (const row of active) {
      if (row.id === winner.id) continue;
      await pool.query('UPDATE tbl_service_catalog SET status = 0 WHERE id = ? LIMIT 1', [row.id]);
      duplicatesRemoved++;
    }
  }

  return {
    uniqueServices: groups.size,
    duplicatesRemoved,
  };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {Array<{sn?:number,name:string,price:number,usedFor?:string,section?:string,code?:string}>} items
 * @param {{ deactivateMissing?: boolean, facilityId?: number, matchBySnCpt?: boolean, mergedInFile?: number }} [opts]
 */
async function upsertPharmacyCatalogRows(pool, items, opts = {}) {
  const category = 'pharmacy';
  const facilityId = Math.max(0, parseInt(opts.facilityId, 10) || 0);
  let inserted = 0;
  let updated = 0;
  const touchedIds = new Set();

  const dedupedItems = dedupeImportRows(items || []);
  const list = dedupedItems.rows;
  const mergedInFile = (opts.mergedInFile || 0) + dedupedItems.mergedInFile;

  const [existing] = await pool.query(
    `SELECT id, name, price, department_name, status, cpt_code, facility_id
     FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) = ? AND facility_id = ?`,
    [category, facilityId]
  );
  const byName = new Map();
  const byNameKey = new Map();
  const byCpt = new Map();
  for (const row of existing || []) {
    byName.set(normName(row.name), row);
    const nameKey = normPharmacyNameKey(row.name);
    if (nameKey && !byNameKey.has(nameKey)) byNameKey.set(nameKey, row);
    if (row.cpt_code) byCpt.set(String(row.cpt_code), row);
  }

  const seededNameKeys = new Set();
  let nextCptSerial = null;

  async function allocateCptCode() {
    if (nextCptSerial == null) {
      const [rows] = await pool.query(
        `SELECT cpt_code FROM tbl_service_catalog
         WHERE LOWER(TRIM(category)) = 'pharmacy' AND facility_id = ?
           AND cpt_code REGEXP '^PH[0-9]+$'`,
        [facilityId]
      );
      let max = 0;
      for (const row of rows || []) {
        const m = String(row.cpt_code || '').match(/^PH(\d+)$/i);
        if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
      }
      nextCptSerial = max;
    }
    nextCptSerial += 1;
    return `PH${String(nextCptSerial).padStart(3, '0')}`;
  }

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const name = String(item.name || '').trim();
    if (!name) continue;
    const key = normName(name);
    const nameKey = normPharmacyNameKey(name) || key;
    seededNameKeys.add(nameKey);
    const price = Math.max(0, parseInt(item.price, 10) || 0);
    const usedFor = String(item.usedFor || 'General').trim();
    const subcategory = String(item.section || 'Pharmacy').trim();
    const sortSn = parseInt(item.sn, 10) || i + 1;

    let prev = byName.get(key) || byNameKey.get(nameKey);
    if (!prev && item.code) prev = byCpt.get(String(item.code));
    if (!prev && opts.matchBySnCpt) prev = byCpt.get(cptForPharmacy(item, i));

    if (prev) {
      const cptCode =
        prev.cpt_code ||
        (item.code ? String(item.code).slice(0, 20) : await allocateCptCode());
      await pool.query(
        `UPDATE tbl_service_catalog
         SET category = ?, subcategory = ?, name = ?, department_name = ?, cpt_code = ?, price = ?, status = 1, sort_order = ?
         WHERE id = ? LIMIT 1`,
        [category, subcategory, name, usedFor, cptCode, price, sortSn, prev.id]
      );
      prev.name = name;
      prev.cpt_code = cptCode;
      byName.set(key, prev);
      byNameKey.set(nameKey, prev);
      touchedIds.add(prev.id);
      updated++;
      continue;
    }

    const cptCode = item.code
      ? String(item.code).slice(0, 20)
      : opts.matchBySnCpt
        ? cptForPharmacy(item, i)
        : await allocateCptCode();
    const [ins] = await pool.query(
      `INSERT INTO tbl_service_catalog
       (facility_id, category, subcategory, name, department_name, cpt_code, price, currency, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'XAF', 1, ?)`,
      [facilityId, category, subcategory, name, usedFor, cptCode, price, sortSn]
    );
    const newRow = {
      id: ins.insertId,
      name,
      cpt_code: cptCode,
      status: 1,
    };
    byName.set(key, newRow);
    byNameKey.set(nameKey, newRow);
    if (cptCode) byCpt.set(String(cptCode), newRow);
    touchedIds.add(newRow.id);
    inserted++;
  }

  let deactivated = 0;
  if (opts.deactivateMissing) {
    for (const row of existing || []) {
      const rowKey = normPharmacyNameKey(row.name) || normName(row.name);
      if (seededNameKeys.has(rowKey)) continue;
      if (row.status === 0) continue;
      await pool.query('UPDATE tbl_service_catalog SET status = 0 WHERE id = ? LIMIT 1', [row.id]);
      deactivated++;
    }
  }

  const dedupeResult = await dedupePharmacyCatalogInDb(pool, { facilityId, preferIds: touchedIds });

  return {
    total: list.length,
    inserted,
    updated,
    deactivated,
    imported: seededNameKeys.size,
    mergedInFile,
    duplicatesRemoved: dedupeResult.duplicatesRemoved,
  };
}

module.exports = {
  parsePharmacyCatalogFile,
  parsePharmacyRowsFromExcel,
  parsePharmacyRowsFromText,
  upsertPharmacyCatalogRows,
  dedupePharmacyCatalogInDb,
  dedupeImportRows,
  normName,
  normPharmacyNameKey,
  cptForPharmacy,
};
