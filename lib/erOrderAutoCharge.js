'use strict';

const syncEmergencyCashierTickets = require('./syncEmergencyCashierTickets');

const ORDER_CATALOG_CATEGORY = {
  lab: 'laboratory',
  radiology: 'radiology',
  pharmacy: 'pharmacy',
  blood_bank: 'laboratory',
  procedure: 'service',
};

const ORDER_CHARGE_TYPE = {
  lab: 'laboratory',
  radiology: 'radiology',
  pharmacy: 'pharmacy',
  blood_bank: 'laboratory',
  procedure: 'misc',
};

async function resolveExplicitPricing(db, opts) {
  const catalogId = parseInt(opts.catalogId, 10) || 0;
  const sourceModule = String(opts.sourceModule || '').trim();
  const explicitAmount = parseFloat(opts.amount);
  const qty = Math.max(1, parseInt(opts.quantity, 10) || 1);

  if (catalogId > 0 && sourceModule === 'service_catalog') {
    const [[row]] = await db
      .query('SELECT id, name, price FROM tbl_service_catalog WHERE id=? AND status=1 LIMIT 1', [catalogId])
      .catch(() => [[null]]);
    if (row) {
      const unit =
        Number.isFinite(explicitAmount) && explicitAmount > 0 ? explicitAmount : parseFloat(row.price) || 0;
      return {
        description: row.name,
        amount: unit * qty,
        unitPrice: unit,
        quantity: qty,
        charge_type: null,
        source_module: 'service_catalog',
        source_pk: catalogId,
      };
    }
  }

  if (catalogId > 0 && sourceModule === 'inventory') {
    const [[row]] = await db
      .query('SELECT id, name, price, selling_price FROM tbl_inventory_item WHERE id=? LIMIT 1', [catalogId])
      .catch(() => [[null]]);
    if (row) {
      const unit =
        Number.isFinite(explicitAmount) && explicitAmount > 0
          ? explicitAmount
          : parseFloat(row.selling_price != null ? row.selling_price : row.price) || 0;
      return {
        description: row.name,
        amount: unit * qty,
        unitPrice: unit,
        quantity: qty,
        charge_type: 'pharmacy',
        source_module: 'inventory',
        source_pk: catalogId,
      };
    }
  }

  if (Number.isFinite(explicitAmount) && explicitAmount > 0) {
    return {
      description: String(opts.description || 'ER order').trim(),
      amount: explicitAmount * qty,
      unitPrice: explicitAmount,
      quantity: qty,
      charge_type: null,
      source_module: sourceModule || null,
      source_pk: catalogId > 0 ? catalogId : null,
    };
  }

  return null;
}

async function resolveCatalogByName(db, category, description) {
  const name = String(description || '').trim();
  if (!name || !category) return null;

  const [[exact]] = await db
    .query(
      `SELECT id, name, price FROM tbl_service_catalog
        WHERE status = 1 AND LOWER(TRIM(category)) = LOWER(TRIM(?))
          AND LOWER(TRIM(name)) = LOWER(TRIM(?))
        LIMIT 1`,
      [category, name]
    )
    .catch(() => [[null]]);
  if (exact) {
    return {
      description: exact.name,
      amount: parseFloat(exact.price) || 0,
      source_module: 'service_catalog',
      source_pk: exact.id,
    };
  }

  const [likeRows] = await db
    .query(
      `SELECT id, name, price FROM tbl_service_catalog
        WHERE status = 1 AND LOWER(TRIM(category)) = LOWER(TRIM(?))
          AND (LOWER(name) LIKE LOWER(?) OR LOWER(?) LIKE CONCAT('%', LOWER(name), '%'))
        ORDER BY LENGTH(name) ASC
        LIMIT 5`,
      [category, `%${name}%`, name]
    )
    .catch(() => [[]]);

  if (likeRows.length === 1) {
    const row = likeRows[0];
    return {
      description: row.name,
      amount: parseFloat(row.price) || 0,
      source_module: 'service_catalog',
      source_pk: row.id,
    };
  }
  return null;
}

async function resolveInventoryByName(db, description) {
  const name = String(description || '').trim();
  if (!name) return null;
  const [[row]] = await db
    .query(
      `SELECT id, name, price, selling_price FROM tbl_inventory_item
        WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) OR LOWER(TRIM(sku)) = LOWER(TRIM(?))
        LIMIT 1`,
      [name, name]
    )
    .catch(() => [[null]]);
  if (!row) return null;
  const unit = parseFloat(row.selling_price != null ? row.selling_price : row.price) || 0;
  return {
    description: row.name,
    amount: unit,
    source_module: 'inventory',
    source_pk: row.id,
    charge_type: 'pharmacy',
  };
}

async function resolveErOrderPricing(db, orderType, description, opts = {}) {
  const explicit = await resolveExplicitPricing(db, { ...opts, description });
  if (explicit) return explicit;

  const ot = String(orderType || '').trim().toLowerCase();
  const category = ORDER_CATALOG_CATEGORY[ot];
  const qty = Math.max(1, parseInt(opts.quantity, 10) || 1);

  if (ot === 'pharmacy') {
    const inv = await resolveInventoryByName(db, description);
    if (inv) {
      return { ...inv, unitPrice: inv.amount, quantity: qty, amount: inv.amount * qty };
    }
    const cat = await resolveCatalogByName(db, 'pharmacy', description);
    if (cat) {
      return { ...cat, unitPrice: cat.amount, quantity: qty, amount: cat.amount * qty, charge_type: 'pharmacy' };
    }
  }

  if (category) {
    const cat = await resolveCatalogByName(db, category, description);
    if (cat) {
      return { ...cat, unitPrice: cat.amount, quantity: qty, amount: cat.amount * qty };
    }
  }

  return null;
}

async function autoChargeFromErOrder(db, opts) {
  const visitId = parseInt(opts.visitId, 10) || 0;
  const orderId = parseInt(opts.orderId, 10) || 0;
  const patientId = parseInt(opts.patientId, 10) || 0;
  if (visitId < 1 || orderId < 1 || patientId < 1) {
    return { ok: false, skipped: true, reason: 'invalid_ids' };
  }

  const [[existing]] = await db
    .query(
      `SELECT id, amount, settled FROM tbl_emergency_charge
        WHERE source_module='er_order' AND source_pk=? LIMIT 1`,
      [orderId]
    )
    .catch(() => [[null]]);
  if (existing && existing.id) {
    return { ok: true, skipped: true, reason: 'already_charged', chargeId: existing.id };
  }

  const ot = String(opts.orderType || '').trim().toLowerCase();
  const pricing = await resolveErOrderPricing(db, ot, opts.description, opts);
  if (!pricing || !(pricing.amount > 0)) {
    return { ok: false, skipped: true, reason: 'no_price', orderType: ot };
  }

  const chargeType = pricing.charge_type || ORDER_CHARGE_TYPE[ot] || 'misc';
  const qty = pricing.quantity || 1;
  const desc =
    qty > 1 ? `${pricing.description} × ${qty}` : pricing.description;

  const fid = parseInt(opts.facilityId, 10) || 1;
  const uid = parseInt(opts.addedBy, 10) || null;

  const [ins] = await db.query(
    `INSERT INTO tbl_emergency_charge
      (facility_id, visit_id, patient_id, charge_type, description, amount,
       added_by, source_module, source_pk, clinical_detail)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      fid,
      visitId,
      patientId,
      chargeType,
      String(desc).slice(0, 290),
      pricing.amount,
      uid,
      'er_order',
      orderId,
      JSON.stringify({
        er_order_id: orderId,
        order_type: ot,
        quantity: qty,
        catalog_source: pricing.source_module || null,
        catalog_id: pricing.source_pk || null,
      }),
    ]
  );

  await db
    .query('UPDATE tbl_opd_visit SET emg_credit_total = COALESCE(emg_credit_total,0)+? WHERE id=?', [
      pricing.amount,
      visitId,
    ])
    .catch(() => {});

  return { ok: true, chargeId: ins.insertId, amount: pricing.amount, description: desc };
}

async function voidErOrderCharge(db, orderId) {
  const oid = parseInt(orderId, 10) || 0;
  if (oid < 1) return { ok: false };
  const [[ch]] = await db
    .query(
      `SELECT id, visit_id, amount, settled FROM tbl_emergency_charge
        WHERE source_module='er_order' AND source_pk=? LIMIT 1`,
      [oid]
    )
    .catch(() => [[null]]);
  if (!ch || !ch.id) return { ok: true, voided: false };
  if (parseInt(ch.settled, 10) === 1) return { ok: false, reason: 'already_settled' };

  const amt = parseFloat(ch.amount) || 0;
  await db.query('DELETE FROM tbl_emergency_charge WHERE id=?', [ch.id]);
  if (amt > 0 && ch.visit_id) {
    await db
      .query('UPDATE tbl_opd_visit SET emg_credit_total = GREATEST(0, COALESCE(emg_credit_total,0)-?) WHERE id=?', [
        amt,
        ch.visit_id,
      ])
      .catch(() => {});
  }
  return { ok: true, voided: true, amount: amt, visitId: ch.visit_id };
}

module.exports = {
  autoChargeFromErOrder,
  voidErOrderCharge,
  resolveErOrderPricing,
  syncAfterErCharge: syncEmergencyCashierTickets,
};
