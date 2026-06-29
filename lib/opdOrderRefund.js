'use strict';

const { findPaidTicketExplicitlyLinkedToOrderItem } = require('./assertOrderLineAndTicketValid');
const recordInventoryMovement = require('./recordInventoryMovement');

const REFUNDABLE_TYPES = new Set(['laboratory', 'radiology', 'pharmacy']);

function parseTicketLines(raw) {
  try {
    const arr = JSON.parse(String(raw || '[]'));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function lineAmountForOrderItem(ticket, orderItemId) {
  const oid = parseInt(orderItemId, 10) || 0;
  if (!ticket || oid < 1) return null;
  const lines = parseTicketLines(ticket.lines_json);
  const ln = lines.find((row) => {
    const pk = parseInt(String(row?.source_pk || ''), 10) || 0;
    const mod = String(row?.source_module || '').toLowerCase();
    return pk === oid && (mod === 'opd_order_item' || mod.includes('opd_order'));
  });
  if (!ln) return null;
  if (ln.patient_due != null && Number.isFinite(parseFloat(ln.patient_due))) {
    return parseFloat(ln.patient_due) || 0;
  }
  const qty = parseFloat(ln.quantity || 1) || 1;
  const price = parseFloat(ln.unit_price || ln.amount || 0) || 0;
  return price * qty;
}

function isRefundableOrderItem(row) {
  if (!row || !REFUNDABLE_TYPES.has(String(row.item_type || '').toLowerCase())) {
    return { ok: false, reason: 'not_refundable_type' };
  }
  const st = String(row.status || '').toLowerCase();
  if (st === 'refunded') return { ok: false, reason: 'already_refunded' };
  if (st !== 'paid') return { ok: false, reason: 'not_paid' };
  if (row.served_at) return { ok: false, reason: 'already_served' };
  return { ok: true, reason: null };
}

async function ensureOpdRefundSchema(db) {
  const addCol = async (sql) => {
    try {
      await db.query(sql);
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (!/duplicate column|already exists/i.test(msg)) throw e;
    }
  };
  await addCol('ALTER TABLE tbl_opd_order_item ADD COLUMN refunded_at DATETIME NULL');
  await addCol('ALTER TABLE tbl_opd_order_item ADD COLUMN refund_amount DECIMAL(12,2) DEFAULT 0');
  await addCol('ALTER TABLE tbl_opd_order_item ADD COLUMN refund_method VARCHAR(40) DEFAULT NULL');
  await addCol('ALTER TABLE tbl_opd_order_item ADD COLUMN refund_reason VARCHAR(255) DEFAULT NULL');
  await addCol('ALTER TABLE tbl_opd_order_item ADD COLUMN refunded_by INT DEFAULT NULL');
}

async function restoreStockForRefund(conn, oi, userId) {
  if (String(oi.item_type) !== 'pharmacy' || !oi.stock_deducted_at) return;
  const invId = parseInt(oi.inventory_item_id, 10) || 0;
  if (invId < 1) return;
  const qty = Math.max(1, Math.round(parseFloat(oi.quantity) || 1));
  const [[sku]] = await conn
    .query('SELECT id, name, quantity FROM tbl_inventory_item WHERE id = ? LIMIT 1', [invId])
    .catch(() => [[null]]);
  if (!sku) return;
  const before = parseInt(sku.quantity, 10) || 0;
  const after = before + qty;
  await conn.query('UPDATE tbl_inventory_item SET quantity = ? WHERE id = ?', [after, invId]);
  await recordInventoryMovement(conn, {
    inventory_item_id: invId,
    change_qty: qty,
    qty_before: before,
    qty_after: after,
    reason: 'refund_restore',
    note: `OPD refund · line #${oi.id}`,
    user_id: userId,
  });
}

async function cancelDownstreamRequests(conn, oi) {
  const oid = parseInt(oi.id, 10) || 0;
  if (oid < 1) return;
  const type = String(oi.item_type || '').toLowerCase();
  if (type === 'laboratory') {
    await conn
      .query(
        `UPDATE tbl_lab_result
            SET status='cancelled',
                notes=TRIM(CONCAT(COALESCE(notes,''), ' [Refunded — not available]'))
          WHERE opd_order_item_id=? AND LOWER(TRIM(COALESCE(status,''))) IN ('pending','received','in_progress')`,
        [oid]
      )
      .catch(() => {});
  } else if (type === 'radiology') {
    await conn
      .query(
        `UPDATE tbl_radiology_result
            SET status='cancelled',
                findings=TRIM(CONCAT(COALESCE(findings,''), ' [Refunded — not available]'))
          WHERE opd_order_item_id=? AND LOWER(TRIM(COALESCE(status,''))) IN ('pending','received','in_progress')`,
        [oid]
      )
      .catch(() => {});
  }
}

async function creditPatientWallet(conn, patientId, amount, referenceId, notes, userId) {
  const amt = parseFloat(amount) || 0;
  if (amt <= 0) return;
  await conn.query(`
    CREATE TABLE IF NOT EXISTS tbl_patient_wallet (
     id INT AUTO_INCREMENT PRIMARY KEY,
     patient_id INT NOT NULL,
     balance DECIMAL(12,2) DEFAULT 0,
     status VARCHAR(20) DEFAULT 'active',
     qr_token VARCHAR(255),
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     UNIQUE KEY uniq_wallet_patient (patient_id)
    )
  `).catch(() => {});
  await conn.query(`
    CREATE TABLE IF NOT EXISTS tbl_patient_wallet_txn (
     id INT AUTO_INCREMENT PRIMARY KEY,
     wallet_id INT NOT NULL,
     txn_type VARCHAR(40) DEFAULT NULL,
     direction ENUM('cr','dr') NOT NULL,
     amount DECIMAL(12,2) NOT NULL,
     balance_after DECIMAL(12,2) DEFAULT 0,
     reference_id VARCHAR(80) DEFAULT NULL,
     notes TEXT,
     created_by INT DEFAULT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     KEY idx_wallet (wallet_id)
    )
  `).catch(() => {});
  await conn
    .query(
      "INSERT IGNORE INTO tbl_patient_wallet (patient_id, balance, status, qr_token, created_at, updated_at) VALUES (?,0,'active',?,NOW(),NOW())",
      [patientId, 'GBPAY-' + patientId + '-' + Date.now()]
    )
    .catch(() => {});
  const [[wallet]] = await conn
    .query("SELECT id, balance FROM tbl_patient_wallet WHERE patient_id=? AND status='active' LIMIT 1 FOR UPDATE", [
      patientId,
    ])
    .catch(() => [[null]]);
  if (!wallet || !wallet.id) return;
  const cur = parseFloat(wallet.balance || 0) || 0;
  const next = cur + amt;
  await conn.query('UPDATE tbl_patient_wallet SET balance=?, updated_at=NOW() WHERE id=?', [next, wallet.id]);
  await conn.query(
    `INSERT INTO tbl_patient_wallet_txn (wallet_id, txn_type, direction, amount, balance_after, reference_id, notes, created_by)
     VALUES (?, 'refund_opd', 'cr', ?, ?, ?, ?, ?)`,
    [wallet.id, amt, next, referenceId, notes, userId]
  );
}

/**
 * Refund paid OPD order lines that could not be fulfilled (not in stock / not available).
 * @returns {Promise<{ok:boolean, error?:string, refundTotal?:number, refundedIds?:number[], receiptId?:number}>}
 */
async function refundOpdOrderItems(conn, opts) {
  const ids = (opts.orderItemIds || [])
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const refundMethod = String(opts.refundMethod || '').trim();
  const refundReason = String(opts.refundReason || '').trim();
  const userId = parseInt(opts.userId, 10) || 0;
  const facilityId = parseInt(opts.facilityId, 10) || 1;
  const nextReceiptNumber = opts.nextReceiptNumber;
  const nextInvoiceNumber = opts.nextInvoiceNumber;

  if (!ids.length) return { ok: false, error: 'Select at least one item to refund.' };
  if (!refundMethod) return { ok: false, error: 'Select a refund method.' };
  if (!refundReason) return { ok: false, error: 'Enter a refund reason.' };

  await ensureOpdRefundSchema(conn);

  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await conn.query(
    `SELECT * FROM tbl_opd_order_item WHERE id IN (${placeholders}) FOR UPDATE`,
    ids
  );
  const items = Array.isArray(rows) ? rows : [];
  if (items.length !== ids.length) return { ok: false, error: 'Some items were not found.' };

  const patientId = parseInt(items[0].patient_id, 10) || 0;
  if (!patientId || !items.every((it) => parseInt(it.patient_id, 10) === patientId)) {
    return { ok: false, error: 'All items must belong to the same patient.' };
  }

  let refundTotal = 0;
  const refundedIds = [];
  const refundLines = [];

  for (const oi of items) {
    const check = isRefundableOrderItem(oi);
    if (!check.ok) {
      const name = oi.item_name || 'item';
      if (check.reason === 'already_refunded') return { ok: false, error: `Already refunded: ${name}` };
      if (check.reason === 'already_served') return { ok: false, error: `Already dispensed/performed: ${name}` };
      if (check.reason === 'not_paid') return { ok: false, error: `Not paid yet: ${name}` };
      return { ok: false, error: `Cannot refund: ${name}` };
    }

    const ticket = await findPaidTicketExplicitlyLinkedToOrderItem(conn, oi);
    let amount =
      lineAmountForOrderItem(ticket, oi.id) ??
      (parseFloat(oi.unit_price || 0) || 0) * (parseFloat(oi.quantity || 1) || 1);
    amount = Math.max(0, Math.round(amount * 100) / 100);
    if (amount <= 0) return { ok: false, error: `No paid amount found for: ${oi.item_name || 'item'}` };

    refundTotal += amount;
    refundedIds.push(oi.id);
    refundLines.push({
      kind: 'opd_refund',
      description: `${oi.item_type}: ${oi.item_name || 'Service'} — ${refundReason}`,
      unit_price: -amount,
      quantity: 1,
      source_module: 'opd_order_item',
      source_pk: oi.id,
      refund_method: refundMethod,
    });

    await conn.query(
      `UPDATE tbl_opd_order_item
          SET status='refunded',
              refund_amount=?,
              refund_method=?,
              refund_reason=?,
              refunded_at=NOW(),
              refunded_by=?
        WHERE id=? AND status='paid'`,
      [amount, refundMethod, refundReason, userId || null, oi.id]
    );

    await restoreStockForRefund(conn, oi, userId);
    await cancelDownstreamRequests(conn, oi);
  }

  if (refundTotal <= 0) return { ok: false, error: 'Refund total is zero.' };

  if (refundMethod === 'Wallet') {
    await creditPatientWallet(
      conn,
      patientId,
      refundTotal,
      'OPD-REFUND-' + refundedIds.join(','),
      refundReason,
      userId
    );
  }

  let receiptId = null;
  if (typeof nextReceiptNumber === 'function' && typeof nextInvoiceNumber === 'function') {
    const receiptNo = await nextReceiptNumber(conn, facilityId);
    const invoiceNo = await nextInvoiceNumber(conn, facilityId);
    const [ins] = await conn.query(
      `INSERT INTO tbl_billing_document
        (facility_id, patient_id, doc_type, doc_number, invoice_doc_number, total_amount, payment_method, status, source_module, source_pk, created_by, created_at)
       VALUES (?, ?, 'refund', ?, ?, ?, ?, 'paid', 'opd_refund', ?, ?, NOW())`,
      [
        facilityId,
        patientId,
        receiptNo,
        invoiceNo,
        -refundTotal,
        refundMethod,
        refundedIds[0] || null,
        userId || null,
      ]
    );
    receiptId = ins && ins.insertId ? ins.insertId : null;
  }

  return { ok: true, refundTotal, refundedIds, refundLines, receiptId, patientId };
}

module.exports = {
  REFUNDABLE_TYPES,
  isRefundableOrderItem,
  lineAmountForOrderItem,
  ensureOpdRefundSchema,
  refundOpdOrderItems,
  creditPatientWallet,
};
