'use strict';

const { catalogActiveWhere } = require('./catalogActiveWhere');
const { assignServiceCodesForConsultation } = require('./paymentTicketCode');

function safeArr(raw) {
  try {
    const a = JSON.parse(String(raw || '[]'));
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function toIds(arr) {
  return (arr || []).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Create missing tbl_opd_order_item rows from consultation JSON (lab/rad/meds).
 * Idempotent per consultation — skips when any order line already exists.
 */
async function repairOpdOrderItemsFromConsultations(pool, { limit = 100, facilityId = 1, userId = 1 } = {}) {
  if (!pool || !pool.query) return { created: 0, skipped: 0 };

  const cap = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
  const [rows] = await pool
    .query(
      `SELECT id, patient_id, opd_visit_id, facility_id, lab_orders_json, rad_orders_json, medications_json, created_by, created_at
       FROM tbl_consultation
       WHERE (lab_orders_json IS NOT NULL AND CHAR_LENGTH(TRIM(lab_orders_json)) > 2)
          OR (rad_orders_json IS NOT NULL AND CHAR_LENGTH(TRIM(rad_orders_json)) > 2)
          OR (medications_json IS NOT NULL AND CHAR_LENGTH(TRIM(medications_json)) > 2)
       ORDER BY id DESC
       LIMIT ?`,
      [cap]
    )
    .catch(() => [[]]);

  const active = catalogActiveWhere('', pool);
  const loadCatalog = async (ids) => {
    if (!ids.length) return new Map();
    const placeholders = ids.map(() => '?').join(',');
    const [rws] = await pool
      .query(
        `SELECT id, name, price FROM tbl_service_catalog WHERE id IN (${placeholders}) AND ${active}`,
        ids
      )
      .catch(() => [[]]);
    const m = new Map();
    for (const r of rws || []) m.set(parseInt(r.id, 10), { name: r.name, price: parseFloat(r.price || 0) || 0 });
    return m;
  };

  const resolveMed = async (name) => {
    const n = String(name || '').trim();
    if (!n) return null;
    const tryQ = async (where, params) => {
      const [rs] = await pool
        .query(
          `SELECT id, name, price FROM tbl_service_catalog
           WHERE LOWER(TRIM(category))='pharmacy' AND ${active} AND ${where}
           ORDER BY CHAR_LENGTH(name) ASC LIMIT 1`,
          params
        )
        .catch(() => [[]]);
      return rs && rs[0];
    };
    let hit =
      (await tryQ('LOWER(name)=LOWER(?)', [n])) ||
      (await tryQ('LOWER(name) LIKE LOWER(?)', [n + '%'])) ||
      (await tryQ('LOWER(name) LIKE LOWER(?)', ['%' + n + '%']));
    if (hit) return { catId: parseInt(hit.id, 10) || null, name: hit.name, price: parseFloat(hit.price || 0) || 0 };
    return { catId: null, name: n, price: 0 };
  };

  let created = 0;
  let skipped = 0;

  for (const c of rows || []) {
    const consultId = parseInt(c.id, 10) || 0;
    const pid = parseInt(c.patient_id, 10) || 0;
    if (!consultId || !pid) {
      skipped += 1;
      continue;
    }

    const labIds = toIds(safeArr(c.lab_orders_json));
    const radIds = toIds(safeArr(c.rad_orders_json));
    const medsArr = safeArr(c.medications_json).filter((m) => m && m.name);
    if (!labIds.length && !radIds.length && !medsArr.length) {
      skipped += 1;
      continue;
    }

    const [[exists]] = await pool
      .query('SELECT id FROM tbl_opd_order_item WHERE consultation_id=? LIMIT 1', [consultId])
      .catch(() => [[null]]);
    if (exists) {
      skipped += 1;
      continue;
    }

    const labMap = await loadCatalog(labIds);
    const radMap = await loadCatalog(radIds);
    const facility = parseInt(c.facility_id, 10) || facilityId;
    const visitId = parseInt(c.opd_visit_id, 10) || null;
    const createdBy = parseInt(c.created_by, 10) || userId;

    const insertItem = async (type, catId, info) => {
      if (!info || !info.name) return;
      const [ins] = await pool
        .query(
          `INSERT INTO tbl_opd_order_item
           (facility_id, patient_id, opd_visit_id, consultation_id, item_type, catalog_id, item_name, unit_price, quantity, status, created_by, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?)`,
          [
            facility,
            pid,
            visitId,
            consultId,
            type,
            catId,
            info.name,
            info.price,
            1,
            createdBy,
            c.created_at || new Date(),
          ]
        )
        .catch(() => [null]);
      if (ins && ins.insertId) created += 1;
    };

    for (const id of labIds) await insertItem('laboratory', id, labMap.get(id));
    for (const id of radIds) await insertItem('radiology', id, radMap.get(id));
    for (const med of medsArr) {
      const info = await resolveMed(med && med.name);
      if (info && info.name) await insertItem('pharmacy', info.catId, info);
    }

    await assignServiceCodesForConsultation(pool, consultId).catch(() => {});
  }

  return { created, skipped };
}

module.exports = { repairOpdOrderItemsFromConsultations };
