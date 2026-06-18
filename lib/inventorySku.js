'use strict';

/**
 * Manual inventory SKU: HMS-{facility 4d}-I{category 4d}{sequence 4d}
 * e.g. facility 1, category 8, seq 1 → HMS-0001-I00080001
 */
function formatManualInventorySku(facilityId, categoryId, sequence) {
  const fac = String(Math.max(1, parseInt(facilityId, 10) || 1)).padStart(4, '0');
  const cat = String(Math.max(0, parseInt(categoryId, 10) || 0)).padStart(4, '0');
  const seq = String(Math.max(1, parseInt(sequence, 10) || 1)).padStart(4, '0');
  return `HMS-${fac}-I${cat}${seq}`;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} facilityId
 * @param {number|null|undefined} categoryId
 * @returns {Promise<string>}
 */
async function allocateNextInventorySku(pool, facilityId, categoryId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const catId = Math.max(0, parseInt(categoryId, 10) || 0);
  const catParam = catId > 0 ? catId : null;

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM tbl_inventory_item
     WHERE facility_id = ? AND (category_id <=> ? OR (? = 0 AND (category_id IS NULL OR category_id = 0)))`,
    [fid, catParam, catId]
  );
  let seq = (parseInt(countRow && countRow.cnt, 10) || 0) + 1;

  for (let attempt = 0; attempt < 200; attempt++, seq++) {
    const sku = formatManualInventorySku(fid, catId, seq);
    const [[dup]] = await pool.query(
      'SELECT id FROM tbl_inventory_item WHERE facility_id = ? AND LOWER(TRIM(sku)) = LOWER(?) LIMIT 1',
      [fid, sku]
    );
    if (!dup || !dup.id) return sku;
  }

  return formatManualInventorySku(fid, catId, Date.now() % 10000);
}

module.exports = {
  formatManualInventorySku,
  allocateNextInventorySku,
};
