'use strict';

const recordInventoryMovement = require('./recordInventoryMovement');

function parseSupplyLineQty(qtyStr) {
  const s = String(qtyStr || '').trim();
  if (!s) return 1;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return 1;
  return Math.max(1, Math.round(parseFloat(m[1]) || 1));
}

async function resolveInventoryItemId(conn, line) {
  let invId = parseInt(line.inventory_item_id, 10) || 0;
  if (invId > 0) return invId;
  const name = String(line.item_name || '').trim();
  if (!name) return 0;
  const [[row]] = await conn
    .query('SELECT id FROM tbl_inventory_item WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1', [name])
    .catch(() => [[null]]);
  if (row?.id) return parseInt(row.id, 10) || 0;
  const [[fuzzy]] = await conn
    .query('SELECT id FROM tbl_inventory_item WHERE LOWER(name) LIKE LOWER(?) ORDER BY id ASC LIMIT 1', [`%${name}%`])
    .catch(() => [[null]]);
  return fuzzy?.id ? parseInt(fuzzy.id, 10) || 0 : 0;
}

/**
 * Mark nursing supply request fulfilled and deduct inventory for each line.
 * @returns {Promise<{ok:boolean, error?:string, deducted?:Array, alreadyDone?:boolean}>}
 */
async function fulfillNursingSupplyRequest(pool, requestId, userId) {
  const rid = parseInt(requestId, 10) || 0;
  const uid = parseInt(userId, 10) || 0;
  if (rid < 1) return { ok: false, error: 'Invalid request.' };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[req]] = await conn.query(
      'SELECT id, status, stock_deducted_at FROM tbl_nursing_supply_request WHERE id = ? LIMIT 1 FOR UPDATE',
      [rid]
    );
    if (!req) {
      await conn.rollback();
      return { ok: false, error: 'Request not found.' };
    }

    if (req.stock_deducted_at) {
      await conn.query(
        `UPDATE tbl_nursing_supply_request
            SET status = 'fulfilled', fulfilled_by = COALESCE(fulfilled_by, ?)
          WHERE id = ?`,
        [uid || null, rid]
      );
      await conn.commit();
      return { ok: true, alreadyDone: true, deducted: [] };
    }

    const [lines] = await conn.query(
      'SELECT id, item_name, quantity, inventory_item_id FROM tbl_nursing_supply_request_line WHERE request_id = ? ORDER BY id',
      [rid]
    );
    if (!lines?.length) {
      await conn.rollback();
      return { ok: false, error: 'This request has no line items.' };
    }

    const deducted = [];
    for (const line of lines) {
      const invId = await resolveInventoryItemId(conn, line);
      if (invId < 1) {
        await conn.rollback();
        return {
          ok: false,
          error: `No inventory SKU linked for "${line.item_name || 'item'}". Link the item to stock before dispensing.`,
        };
      }

      const qty = parseSupplyLineQty(line.quantity);
      const [[sku]] = await conn.query(
        'SELECT id, name, quantity FROM tbl_inventory_item WHERE id = ? LIMIT 1 FOR UPDATE',
        [invId]
      );
      if (!sku) {
        await conn.rollback();
        return { ok: false, error: `Inventory item #${invId} not found.` };
      }

      const before = parseInt(sku.quantity, 10) || 0;
      if (before < qty) {
        await conn.rollback();
        return {
          ok: false,
          error: `Insufficient stock for ${sku.name || line.item_name}: need ${qty}, on hand ${before}.`,
        };
      }

      const after = before - qty;
      await conn.query('UPDATE tbl_inventory_item SET quantity = ? WHERE id = ?', [after, invId]);
      await recordInventoryMovement(conn, {
        inventory_item_id: invId,
        change_qty: -qty,
        qty_before: before,
        qty_after: after,
        reason: 'nursing_dispense',
        note: `Nursing supply request #${rid} · line #${line.id}`,
        user_id: uid || null,
      });
      await conn.query(
        'UPDATE tbl_nursing_supply_request_line SET inventory_item_id = ?, qty_deducted = ? WHERE id = ?',
        [invId, qty, line.id]
      );
      deducted.push({ lineId: line.id, item: sku.name || line.item_name, qty, qtyAfter: after });
    }

    await conn.query(
      `UPDATE tbl_nursing_supply_request
          SET status = 'fulfilled', stock_deducted_at = NOW(), fulfilled_by = ?
        WHERE id = ?`,
      [uid || null, rid]
    );
    await conn.commit();
    return { ok: true, deducted };
  } catch (e) {
    try {
      await conn.rollback();
    } catch (_) {
      /* ignore */
    }
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = {
  parseSupplyLineQty,
  fulfillNursingSupplyRequest,
};
