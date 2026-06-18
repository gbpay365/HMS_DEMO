'use strict';

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isExpired(expiryDate, asOfYmd) {
  if (!expiryDate) return false;
  const exp =
    expiryDate instanceof Date
      ? expiryDate.toISOString().slice(0, 10)
      : String(expiryDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return false;
  return exp < (asOfYmd || todayYmd());
}

/**
 * Resolve inventory row for a prescription medication line.
 */
async function resolveInventoryForLine(pool, line) {
  if (!line) return null;
  if (line.inventory_item_id) {
    const [[row]] = await pool.query(
      `SELECT i.*, mt.name AS medicine_type_name, mc.name AS medicine_category_name,
              mc.requires_prescription AS category_requires_rx
       FROM tbl_inventory_item i
       LEFT JOIN tbl_pharmacy_medicine_type mt ON mt.id = i.medicine_type_id
       LEFT JOIN tbl_pharmacy_medicine_category mc ON mc.id = i.medicine_category_id
       WHERE i.id = ? LIMIT 1`,
      [line.inventory_item_id]
    );
    return row || null;
  }
  const name = String(line.medication_name || '').trim();
  if (!name) return null;
  const [[row]] = await pool.query(
    `SELECT i.*, mt.name AS medicine_type_name, mc.name AS medicine_category_name,
            mc.requires_prescription AS category_requires_rx
     FROM tbl_inventory_item i
     LEFT JOIN tbl_pharmacy_medicine_type mt ON mt.id = i.medicine_type_id
     LEFT JOIN tbl_pharmacy_medicine_category mc ON mc.id = i.medicine_category_id
     WHERE i.name = ? OR i.sku = ?
     ORDER BY i.id DESC LIMIT 1`,
    [name, name]
  );
  return row || null;
}

/**
 * Resolve inventory for a pharmacy OPD order item (catalog link or name match).
 */
async function resolveInventoryForOrderItem(pool, oi) {
  if (!oi) return null;
  const catalogId = parseInt(oi.catalog_id, 10) || 0;
  if (catalogId > 0) {
    const [[row]] = await pool.query(
      `SELECT i.*, mt.name AS medicine_type_name, mc.name AS medicine_category_name,
              mc.requires_prescription AS category_requires_rx
       FROM tbl_inventory_item i
       LEFT JOIN tbl_pharmacy_medicine_type mt ON mt.id = i.medicine_type_id
       LEFT JOIN tbl_pharmacy_medicine_category mc ON mc.id = i.medicine_category_id
       WHERE i.service_catalog_id = ?
       ORDER BY i.id DESC LIMIT 1`,
      [catalogId]
    );
    if (row) return row;
  }
  const name = String(oi.item_name || '').trim();
  if (!name) return null;
  const [[row]] = await pool.query(
    `SELECT i.*, mt.name AS medicine_type_name, mc.name AS medicine_category_name,
            mc.requires_prescription AS category_requires_rx
     FROM tbl_inventory_item i
     LEFT JOIN tbl_pharmacy_medicine_type mt ON mt.id = i.medicine_type_id
     LEFT JOIN tbl_pharmacy_medicine_category mc ON mc.id = i.medicine_category_id
     WHERE i.name = ? OR i.sku = ?
     ORDER BY i.id DESC LIMIT 1`,
    [name, name]
  );
  return row || null;
}

/**
 * Expiry check for pharmacy validate / serve (tbl_opd_order_item).
 * @returns {{ oi, inventory, expired: boolean, expiry_date: string|null, warnings: string[] }}
 */
async function checkOpdOrderItemExpiry(pool, oiId, asOfYmd) {
  const [[oi]] = await pool.query(
    `SELECT oi.*, p.first_name, p.last_name
     FROM tbl_opd_order_item oi
     JOIN tbl_patient p ON p.id = oi.patient_id
     WHERE oi.id = ? AND oi.item_type = 'pharmacy' LIMIT 1`,
    [oiId]
  );
  if (!oi) {
    return { oi: null, inventory: null, expired: false, expiry_date: null, warnings: ['Item not found.'] };
  }

  const inventory = await resolveInventoryForOrderItem(pool, oi);
  const warnings = [];
  let expired = false;
  let expiry_date = null;

  if (!inventory) {
    warnings.push('No linked inventory product — expiry could not be verified.');
    return { oi, inventory: null, expired: false, expiry_date: null, warnings };
  }

  expiry_date = inventory.expiry_date ? String(inventory.expiry_date).slice(0, 10) : null;
  if (expiry_date && isExpired(expiry_date, asOfYmd)) {
    expired = true;
    warnings.push(
      `${inventory.name} expired on ${expiry_date}. You cannot serve expired stock without confirming override.`
    );
  }

  const needsRx =
    inventory.requires_prescription === 1 || inventory.category_requires_rx === 1;
  if (needsRx) {
    warnings.push('This category requires a prescription attachment on file.');
  }

  return { oi, inventory, expired, expiry_date, warnings };
}

/**
 * @returns {{ line, inventory, expired: boolean, expiry_date: string|null, warnings: string[] }}
 */
async function checkPrescriptionLineExpiry(pool, lineId, asOfYmd) {
  const [[line]] = await pool.query(
    `SELECT pl.*, r.patient_id, p.first_name, p.last_name
     FROM tbl_prescription_line pl
     INNER JOIN tbl_prescription r ON r.id = pl.prescription_id
     INNER JOIN tbl_patient p ON p.id = r.patient_id
     WHERE pl.id = ? AND pl.line_type = 'medication' LIMIT 1`,
    [lineId]
  );
  if (!line) {
    return { line: null, inventory: null, expired: false, expiry_date: null, warnings: ['Line not found.'] };
  }

  const inventory = await resolveInventoryForLine(pool, line);
  const warnings = [];
  let expired = false;
  let expiry_date = null;

  if (!inventory) {
    warnings.push('No linked inventory product — expiry could not be verified.');
    return { line, inventory: null, expired: false, expiry_date: null, warnings };
  }

  expiry_date = inventory.expiry_date
    ? String(inventory.expiry_date).slice(0, 10)
    : null;
  if (expiry_date && isExpired(expiry_date, asOfYmd)) {
    expired = true;
    warnings.push(
      `${inventory.name} expired on ${expiry_date}. You cannot dispense expired stock without confirming override.`
    );
  }

  const needsRx =
    inventory.requires_prescription === 1 || inventory.category_requires_rx === 1;
  if (needsRx) {
    warnings.push('This category requires a prescription attachment on file.');
  }

  return { line, inventory, expired, expiry_date, warnings };
}

/**
 * List inventory items expired or expiring within `days` days.
 */
async function listExpiryReport(pool, opts) {
  const days = Math.max(0, parseInt(opts && opts.days, 10) || 30);
  const asOf = todayYmd();
  const [rows] = await pool.query(
    `SELECT i.id, i.sku, i.name, i.quantity, i.expiry_date, i.manufacturing_company,
            mt.name AS medicine_type_name, mc.name AS medicine_category_name
     FROM tbl_inventory_item i
     LEFT JOIN tbl_pharmacy_medicine_type mt ON mt.id = i.medicine_type_id
     LEFT JOIN tbl_pharmacy_medicine_category mc ON mc.id = i.medicine_category_id
     WHERE i.expiry_date IS NOT NULL
       AND i.expiry_date <= DATE_ADD(?, INTERVAL ? DAY)
     ORDER BY i.expiry_date ASC, i.name ASC
     LIMIT 500`,
    [asOf, days]
  );
  return (rows || []).map((r) => {
    const exp = r.expiry_date ? String(r.expiry_date).slice(0, 10) : null;
    return {
      ...r,
      expiry_date: exp,
      expired: exp ? isExpired(exp, asOf) : false
    };
  });
}

module.exports = {
  todayYmd,
  isExpired,
  resolveInventoryForLine,
  resolveInventoryForOrderItem,
  checkOpdOrderItemExpiry,
  checkPrescriptionLineExpiry,
  listExpiryReport
};
