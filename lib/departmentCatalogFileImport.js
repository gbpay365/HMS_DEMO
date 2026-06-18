'use strict';

const { parsePharmacyCatalogFile, dedupeImportRows, normName } = require('./pharmacyCatalogFileImport');
const {
  SCANS_IMAGING_CATEGORY,
  imagingCategoryWhere,
  mergeScansImagingCatalog,
} = require('./scansImagingCatalog');

function mapParsedRows(rows) {
  return (rows || []).map((row, index) => ({
    sn: parseInt(row.sn, 10) || index + 1,
    name: String(row.name || '').trim(),
    price: Math.max(0, parseInt(row.price, 10) || 0),
    department: String(row.usedFor || row.section || '').trim() || null,
    section: String(row.section || '').trim() || null,
    code: row.code ? String(row.code).slice(0, 40) : null,
  }));
}

/**
 * Parse name + price rows from Excel, CSV, PDF, or Word (.docx).
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} [mimetype]
 */
async function parseDepartmentCatalogFile(buffer, originalName, mimetype = '') {
  const parsed = await parsePharmacyCatalogFile(buffer, originalName, mimetype);
  return {
    rows: mapParsedRows(parsed.rows),
    warnings: parsed.warnings || [],
    mergedInFile: parsed.mergedInFile || 0,
  };
}

function catalogSubcategory(department) {
  const d = String(department || '').trim();
  if (d === 'Biochemistry') return 'Clinical Chemistry';
  if (d === 'Serology' || d === 'Microbiology') return 'Microbiology & Serology';
  if (d === 'Parasitology') return 'Parasitology / Stool';
  if (d === 'Blood Bank') return 'Others';
  return d || 'Laboratory';
}

function cptForLab(item, index) {
  const sn = parseInt(item.sn, 10) || index + 1;
  if (item.code) return String(item.code).slice(0, 20);
  return `L${String(sn).padStart(3, '0')}`;
}

function cptForImaging(item, index) {
  const sn = parseInt(item.sn, 10) || index + 1;
  if (item.code) return String(item.code).slice(0, 20);
  return `R${String(sn).padStart(3, '0')}`;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {Array<{sn?:number,name:string,price:number,department?:string,code?:string}>} items
 * @param {{ deactivateMissing?: boolean, facilityId?: number, mergedInFile?: number }} [opts]
 */
async function upsertLaboratoryCatalogRows(pool, items, opts = {}) {
  const category = 'laboratory';
  const facilityId = Math.max(0, parseInt(opts.facilityId, 10) || 0);
  let inserted = 0;
  let updated = 0;
  let labCatalogUpserted = 0;

  const deduped = dedupeImportRows(
    (items || []).map((item) => ({
      sn: item.sn,
      name: item.name,
      price: item.price,
      usedFor: item.department || 'Laboratory',
      section: item.department || 'Laboratory',
      code: item.code,
    }))
  );
  const list = deduped.rows;
  const mergedInFile = (opts.mergedInFile || 0) + deduped.mergedInFile;

  const [existing] = await pool.query(
    `SELECT id, name, price, department_name, status, cpt_code, facility_id
     FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) = ? AND facility_id = ?`,
    [category, facilityId]
  );
  const byName = new Map();
  const byCpt = new Map();
  for (const row of existing || []) {
    byName.set(normName(row.name), row);
    if (row.cpt_code) byCpt.set(String(row.cpt_code), row);
  }

  const seededNames = new Set();

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const name = String(item.name || '').trim();
    if (!name) continue;
    const key = normName(name);
    seededNames.add(key);
    const price = Math.max(0, parseInt(item.price, 10) || 0);
    const department = String(item.usedFor || 'Laboratory').trim();
    const subcategory = catalogSubcategory(department);
    const sortSn = parseInt(item.sn, 10) || i + 1;
    const cptCode = item.code ? String(item.code).slice(0, 20) : cptForLab(item, i);

    const prev = byCpt.get(cptCode) || byName.get(key);
    if (prev) {
      await pool.query(
        `UPDATE tbl_service_catalog
         SET category = ?, subcategory = ?, name = ?, department_name = ?, cpt_code = ?, price = ?, status = 1, sort_order = ?
         WHERE id = ? LIMIT 1`,
        [category, subcategory, name, department, cptCode, price, sortSn, prev.id]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO tbl_service_catalog
         (facility_id, category, subcategory, name, department_name, cpt_code, price, currency, status, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'XAF', 1, ?)`,
        [facilityId, category, subcategory, name, department, cptCode, price, sortSn]
      );
      inserted++;
    }

    const labCode = String(item.code || `LAB${sortSn}`).slice(0, 40);
    try {
      await pool.query(
        `INSERT INTO tbl_lab_catalog (code, name, category, specimen_hint, active, sort_order)
         VALUES (?, ?, ?, NULL, 1, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           category = VALUES(category),
           active = 1,
           sort_order = VALUES(sort_order)`,
        [labCode, name, department, sortSn]
      );
      labCatalogUpserted++;
    } catch (_) {
      /* tbl_lab_catalog may not exist on very old DBs */
    }
  }

  let deactivated = 0;
  if (opts.deactivateMissing) {
    for (const row of existing || []) {
      if (seededNames.has(normName(row.name))) continue;
      if (row.status === 0) continue;
      await pool.query('UPDATE tbl_service_catalog SET status = 0 WHERE id = ? LIMIT 1', [row.id]);
      deactivated++;
    }
  }

  return {
    total: list.length,
    inserted,
    updated,
    deactivated,
    imported: seededNames.size,
    labCatalogUpserted,
    mergedInFile,
  };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {Array<{sn?:number,name:string,price:number,department?:string,code?:string}>} items
 * @param {{ deactivateMissing?: boolean, facilityId?: number, mergedInFile?: number }} [opts]
 */
async function upsertRadiologyCatalogRows(pool, items, opts = {}) {
  const category = SCANS_IMAGING_CATEGORY;
  const facilityId = Math.max(0, parseInt(opts.facilityId, 10) || 0);
  let inserted = 0;
  let updated = 0;

  const deduped = dedupeImportRows(
    (items || []).map((item) => ({
      sn: item.sn,
      name: item.name,
      price: item.price,
      usedFor: item.department || 'Imaging',
      section: item.department || 'Imaging',
      code: item.code,
    }))
  );
  const list = deduped.rows;
  const mergedInFile = (opts.mergedInFile || 0) + deduped.mergedInFile;

  const [existing] = await pool.query(
    `SELECT id, name, price, department_name, status, cpt_code, facility_id
     FROM tbl_service_catalog
     WHERE ${imagingCategoryWhere()} AND facility_id = ?`,
    [facilityId]
  );
  const byName = new Map();
  const byCpt = new Map();
  for (const row of existing || []) {
    byName.set(normName(row.name), row);
    if (row.cpt_code) byCpt.set(String(row.cpt_code), row);
  }

  const seededNames = new Set();

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const name = String(item.name || '').trim();
    if (!name) continue;
    const key = normName(name);
    seededNames.add(key);
    const price = Math.max(0, parseInt(item.price, 10) || 0);
    const department = String(item.usedFor || 'Imaging').trim();
    const subcategory = department;
    const sortSn = parseInt(item.sn, 10) || i + 1;
    const cptCode = item.code ? String(item.code).slice(0, 20) : cptForImaging(item, i);

    const prev = byCpt.get(cptCode) || byName.get(key);
    if (prev) {
      await pool.query(
        `UPDATE tbl_service_catalog
         SET category = ?, subcategory = ?, name = ?, department_name = ?, cpt_code = ?, price = ?, status = 1, sort_order = ?
         WHERE id = ? LIMIT 1`,
        [category, subcategory, name, department, cptCode, price, sortSn, prev.id]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO tbl_service_catalog
         (facility_id, category, subcategory, name, department_name, cpt_code, price, currency, status, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'XAF', 1, ?)`,
        [facilityId, category, subcategory, name, department, cptCode, price, sortSn]
      );
      inserted++;
    }
  }

  let deactivated = 0;
  if (opts.deactivateMissing) {
    for (const row of existing || []) {
      if (seededNames.has(normName(row.name))) continue;
      if (row.status === 0) continue;
      await pool.query('UPDATE tbl_service_catalog SET status = 0 WHERE id = ? LIMIT 1', [row.id]);
      deactivated++;
    }
  }

  const merge = await mergeScansImagingCatalog(pool, { facilityId });

  return {
    total: list.length,
    inserted,
    updated,
    deactivated,
    imported: seededNames.size,
    mergedInFile,
    merge,
  };
}

module.exports = {
  parseDepartmentCatalogFile,
  upsertLaboratoryCatalogRows,
  upsertRadiologyCatalogRows,
};
