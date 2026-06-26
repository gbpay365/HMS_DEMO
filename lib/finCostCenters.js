'use strict';

const ensureFinCostCenterSchema = require('./ensureFinCostCenterSchema');

/**
 * @returns {Promise<Array<{id:number,code:string,name:string,isActive:boolean,sortOrder:number}>>}
 */
async function loadActiveCostCenters(pool) {
  await ensureFinCostCenterSchema(pool).catch(() => {});
  try {
    const [rows] = await pool.query(
      `SELECT id, code, label_en, active, sort_order
       FROM tbl_fin_cost_center
       WHERE active = 1
       ORDER BY sort_order ASC, code ASC`
    );
    return (rows || []).map((r) => ({
      id: parseInt(r.id, 10) || 0,
      code: String(r.code || '').trim(),
      name: String(r.label_en || r.name || '').trim(),
      isActive: r.active === 1 || r.active === true,
      sortOrder: parseInt(r.sort_order, 10) || 0,
    }));
  } catch (_) {
    return [];
  }
}

async function resolveCostCenterIdByCode(pool, code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  try {
    const [[r]] = await pool.query(
      'SELECT id FROM tbl_fin_cost_center WHERE UPPER(code) = ? AND active = 1 LIMIT 1',
      [c]
    );
    return r ? parseInt(r.id, 10) || null : null;
  } catch (_) {
    return null;
  }
}

function filterActiveCostCenters(list) {
  return (list || []).filter((c) => c.isActive !== false && c.active !== 0);
}

module.exports = {
  loadActiveCostCenters,
  resolveCostCenterIdByCode,
  filterActiveCostCenters,
};
