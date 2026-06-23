'use strict';

/**
 * Pharmacy module: medicine types/categories, purchase orders, expiry reports.
 */
const ensurePharmacySchema = require('../lib/ensurePharmacySchema');
const { checkPrescriptionLineExpiry, isExpired, todayYmd } = require('../lib/pharmacyExpiry');
const { nextPoNumber, loadPoList, loadPoDetail } = require('../lib/pharmacyPurchase');
const { replacePoLines } = require('../lib/procurementPo');
const { ensurePurchaseOrderSchema } = require('../lib/ensurePurchaseOrderSchema');
const { ensureProcurementExtendedSchema } = require('../lib/ensureProcurementExtendedSchema');
const { parseQtyWithUom, PROCUREMENT_UNITS } = require('../lib/procurementQty');
const { tableExists } = require('../lib/hmsFinGeneralLedger');
const recordInventoryMovement = require('../lib/recordInventoryMovement');
const { postPurchaseOrderToGl, purchaseOrderJournalSuffix } = require('../lib/finPurchaseOrderJournal');

module.exports = function registerPharmacyModule(app, pool, requireAuth, requirePerm) {
  const phaRead = requirePerm('pharmacy.read', 'pharmacy.write');
  const phaWrite = requirePerm('pharmacy.write');
  const phaMgr = requirePerm('pharmacy.write', 'procurement.write', 'inventory.write');

  function facilityId(req) {
    return Math.max(1, parseInt(req.session.facilityId, 10) || 1);
  }

  function uid(req) {
    return parseInt(String(req.session.userId ?? req.session.user?.id ?? ''), 10) || null;
  }

  async function nursingBadge() {
    try {
      const [[r]] = await pool.query(
        "SELECT COUNT(*) AS c FROM tbl_nursing_supply_request WHERE status IN ('pending','preparing')"
      );
      return parseInt(r && r.c, 10) || 0;
    } catch (_) {
      return 0;
    }
  }

  async function loadVendors(fid) {
    if (!(await tableExists(pool, 'tbl_procurement_vendor'))) return [];
    const [rows] = await pool.query(
      'SELECT id, name, vendor_code FROM tbl_procurement_vendor WHERE facility_id = ? AND is_active = 1 ORDER BY name',
      [fid]
    );
    return rows || [];
  }

  // ── Medicine types ─────────────────────────────────────────
  app.get('/pharmacy/config/medicine-types', requireAuth, phaMgr, async (req, res) => {
    await ensurePharmacySchema(pool);
    const [types] = await pool.query(
      'SELECT * FROM tbl_pharmacy_medicine_type ORDER BY sort_order, name'
    );
    res.render('pharmacy-config-types', {
      title: 'Medicine types',
      pharmacyOdooApp: true,
      phaOdooMenu: 'config',
      phaOdooTitle: 'Medicine types',
      nursingSupplyPending: await nursingBadge(),
      types: types || [],
      flash: req.query.msg || null,
      error: req.query.err || null
    });
  });

  app.post('/pharmacy/config/medicine-types', requireAuth, phaMgr, async (req, res) => {
    await ensurePharmacySchema(pool);
    const act = String(req.body.action || 'create');
    try {
      if (act === 'delete') {
        const id = parseInt(req.body.id, 10) || 0;
        if (id > 0) {
          await pool.query('UPDATE tbl_pharmacy_medicine_type SET is_active = 0 WHERE id = ?', [id]);
        }
        return res.redirect('/pharmacy/config/medicine-types?msg=' + encodeURIComponent('Type archived.'));
      }
      const name = String(req.body.name || '').trim();
      if (!name) {
        return res.redirect('/pharmacy/config/medicine-types?err=' + encodeURIComponent('Name is required.'));
      }
      const desc = String(req.body.description || '').trim().slice(0, 500) || null;
      const id = parseInt(req.body.id, 10) || 0;
      if (id > 0) {
        await pool.query(
          'UPDATE tbl_pharmacy_medicine_type SET name = ?, description = ? WHERE id = ?',
          [name.slice(0, 120), desc, id]
        );
        return res.redirect('/pharmacy/config/medicine-types?msg=' + encodeURIComponent('Type updated.'));
      }
      await pool.query(
        'INSERT INTO tbl_pharmacy_medicine_type (name, description) VALUES (?, ?)',
        [name.slice(0, 120), desc]
      );
      return res.redirect('/pharmacy/config/medicine-types?msg=' + encodeURIComponent('Medicine type created.'));
    } catch (e) {
      return res.redirect(
        '/pharmacy/config/medicine-types?err=' + encodeURIComponent(e.message || 'Save failed.')
      );
    }
  });

  // ── Medicine categories ─────────────────────────────────────
  app.get('/pharmacy/config/medicine-categories', requireAuth, phaMgr, async (req, res) => {
    await ensurePharmacySchema(pool);
    const [categories] = await pool.query(
      'SELECT * FROM tbl_pharmacy_medicine_category ORDER BY sort_order, name'
    );
    res.render('pharmacy-config-categories', {
      title: 'Medicine categories',
      pharmacyOdooApp: true,
      phaOdooMenu: 'config',
      phaOdooTitle: 'Medicine categories',
      nursingSupplyPending: await nursingBadge(),
      categories: categories || [],
      flash: req.query.msg || null,
      error: req.query.err || null
    });
  });

  app.post('/pharmacy/config/medicine-categories', requireAuth, phaMgr, async (req, res) => {
    await ensurePharmacySchema(pool);
    const act = String(req.body.action || 'create');
    try {
      if (act === 'delete') {
        const id = parseInt(req.body.id, 10) || 0;
        if (id > 0) {
          await pool.query('UPDATE tbl_pharmacy_medicine_category SET is_active = 0 WHERE id = ?', [id]);
        }
        return res.redirect('/pharmacy/config/medicine-categories?msg=' + encodeURIComponent('Category archived.'));
      }
      const name = String(req.body.name || '').trim();
      if (!name) {
        return res.redirect(
          '/pharmacy/config/medicine-categories?err=' + encodeURIComponent('Name is required.')
        );
      }
      const desc = String(req.body.description || '').trim().slice(0, 500) || null;
      const requiresRx = req.body.requires_prescription === '1' ? 1 : 0;
      const id = parseInt(req.body.id, 10) || 0;
      if (id > 0) {
        await pool.query(
          'UPDATE tbl_pharmacy_medicine_category SET name = ?, description = ?, requires_prescription = ? WHERE id = ?',
          [name.slice(0, 120), desc, requiresRx, id]
        );
        return res.redirect('/pharmacy/config/medicine-categories?msg=' + encodeURIComponent('Category updated.'));
      }
      await pool.query(
        'INSERT INTO tbl_pharmacy_medicine_category (name, description, requires_prescription) VALUES (?, ?, ?)',
        [name.slice(0, 120), desc, requiresRx]
      );
      return res.redirect(
        '/pharmacy/config/medicine-categories?msg=' + encodeURIComponent('Medicine category created.')
      );
    } catch (e) {
      return res.redirect(
        '/pharmacy/config/medicine-categories?err=' + encodeURIComponent(e.message || 'Save failed.')
      );
    }
  });

  // ── Product medicine profile (type, category, expiry) ───────
  app.post('/pharmacy/products/:id/profile', requireAuth, phaWrite, async (req, res) => {
    await ensurePharmacySchema(pool);
    const id = parseInt(req.params.id, 10) || 0;
    if (id < 1) {
      return res.redirect('/pharmacy?view=products&err=' + encodeURIComponent('Invalid product.'));
    }
    const typeId = parseInt(req.body.medicine_type_id, 10) || null;
    const catId = parseInt(req.body.medicine_category_id, 10) || null;
    let expiry = String(req.body.expiry_date || '').trim().slice(0, 10);
    if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) expiry = null;
    const mfg = String(req.body.manufacturing_company || '').trim().slice(0, 255) || null;
    const requiresRx = req.body.requires_prescription === '1' ? 1 : 0;
    try {
      await pool.query(
        `UPDATE tbl_inventory_item SET
           medicine_type_id = ?, medicine_category_id = ?, expiry_date = ?,
           manufacturing_company = ?, requires_prescription = ?
         WHERE id = ?`,
        [typeId || null, catId || null, expiry || null, mfg, requiresRx, id]
      );
      return res.redirect('/pharmacy?view=products&msg=' + encodeURIComponent('Product profile saved.'));
    } catch (e) {
      return res.redirect('/pharmacy?view=products&err=' + encodeURIComponent(e.message || 'Save failed.'));
    }
  });

  // ── Dispense expiry warning page ────────────────────────────
  app.get('/pharmacy/dispense-warn/:lineId', requireAuth, phaWrite, async (req, res) => {
    await ensurePharmacySchema(pool);
    const lineId = parseInt(req.params.lineId, 10) || 0;
    const check = await checkPrescriptionLineExpiry(pool, lineId);
    if (!check.line) {
      return res.redirect('/pharmacy?view=dispensing&err=' + encodeURIComponent('Line not found.'));
    }
    if (!check.expired) {
      return res.redirect(
        '/pharmacy/dispense/' + lineId + '?force=1&msg=' + encodeURIComponent('Dispensed.')
      );
    }
    res.render('pharmacy-dispense-warn', {
      title: 'Expiry warning',
      pharmacyOdooApp: true,
      phaOdooMenu: 'dispensing',
      phaOdooTitle: 'Confirm dispense',
      nursingSupplyPending: await nursingBadge(),
      check,
      lineId
    });
  });

  // ── Purchase orders ─────────────────────────────────────────
  app.get('/pharmacy/purchase-orders', requireAuth, phaRead, async (req, res) => {
    const fid = facilityId(req);
    const pos = await loadPoList(pool, fid, 200);
    res.render('pharmacy-purchase-orders', {
      title: 'Purchase orders',
      pharmacyOdooApp: true,
      phaOdooMenu: 'purchase',
      phaOdooTitle: 'Purchase orders',
      nursingSupplyPending: await nursingBadge(),
      pos,
      flash: req.query.msg || null,
      error: req.query.err || null
    });
  });

  app.get('/pharmacy/purchase-orders/new', requireAuth, phaWrite, async (req, res) => {
    await ensurePharmacySchema(pool);
    const fid = facilityId(req);
    const [inventory] = await pool.query(
      'SELECT id, sku, name, quantity, unit_price FROM tbl_inventory_item ORDER BY name LIMIT 300'
    );
    res.render('pharmacy-po-new', {
      title: 'New purchase order',
      pharmacyOdooApp: true,
      phaOdooMenu: 'purchase',
      phaOdooTitle: 'New purchase order',
      nursingSupplyPending: await nursingBadge(),
      inventory: inventory || [],
      vendors: await loadVendors(fid),
      units: PROCUREMENT_UNITS,
      flash: req.query.msg || null,
      error: req.query.err || null
    });
  });

  app.post('/pharmacy/purchase-orders', requireAuth, phaWrite, async (req, res) => {
    const fid = facilityId(req);
    const user = uid(req);
    if (!(await tableExists(pool, 'tbl_purchase_order'))) {
      return res.redirect('/pharmacy/purchase-orders?err=' + encodeURIComponent('PO tables not installed.'));
    }
    const supplier = String(req.body.supplier_name || '').trim().slice(0, 128) || 'Vendor';
    const vendorId = parseInt(req.body.vendor_id, 10) || null;
    const notes = String(req.body.po_notes || 'Pharmacy purchase').trim().slice(0, 500);
    const itemIds = Array.isArray(req.body.inventory_item_id)
      ? req.body.inventory_item_id
      : req.body.inventory_item_id
        ? [req.body.inventory_item_id]
        : [];
    const qtys = Array.isArray(req.body.quantity) ? req.body.quantity : req.body.quantity ? [req.body.quantity] : [];
    const uoms = Array.isArray(req.body.line_uom) ? req.body.line_uom : req.body.line_uom != null ? [req.body.line_uom] : [];
    const prices = Array.isArray(req.body.unit_price)
      ? req.body.unit_price
      : req.body.unit_price
        ? [req.body.unit_price]
        : [];

    const lines = [];
    for (let i = 0; i < itemIds.length; i++) {
      const iid = parseInt(itemIds[i], 10) || 0;
      const { quantity, uom } = parseQtyWithUom(qtys[i], uoms[i]);
      if (iid < 1 || quantity < 1) continue;
      const price = parseFloat(String(prices[i] || '0').replace(',', '.')) || 0;
      lines.push({ inventory_item_id: iid, quantity, uom, unit_price: price });
    }
    if (!lines.length) {
      return res.redirect('/pharmacy/purchase-orders/new?err=' + encodeURIComponent('Add at least one product line.'));
    }

    try {
      await ensurePurchaseOrderSchema(pool).catch(() => {});
      await ensureProcurementExtendedSchema(pool).catch(() => {});
      const poNumber = await nextPoNumber(pool, fid);
      let total = 0;
      lines.forEach((l) => {
        total += l.quantity * l.unit_price;
      });
      const [ins] = await pool.query(
        `INSERT INTO tbl_purchase_order
         (facility_id, po_number, supplier_name, vendor_id, status, total_amount, created_by, po_notes)
         VALUES (?,?,?,?, 'draft', ?, ?, ?)`,
        [fid, poNumber, supplier, vendorId, total, user, notes]
      );
      const poId = ins.insertId;
      await replacePoLines(pool, poId, lines);
      return res.redirect('/pharmacy/purchase-orders/' + poId + '?msg=' + encodeURIComponent('Purchase order created.'));
    } catch (e) {
      return res.redirect('/pharmacy/purchase-orders/new?err=' + encodeURIComponent(e.message || 'Create failed.'));
    }
  });

  app.get('/pharmacy/purchase-orders/:id', requireAuth, phaRead, async (req, res) => {
    const fid = facilityId(req);
    const poId = parseInt(req.params.id, 10) || 0;
    const detail = await loadPoDetail(pool, fid, poId);
    if (!detail) {
      return res.redirect('/pharmacy/purchase-orders?err=' + encodeURIComponent('Purchase order not found.'));
    }
    res.render('pharmacy-po-detail', {
      title: detail.po.po_number,
      pharmacyOdooApp: true,
      phaOdooMenu: 'purchase',
      phaOdooTitle: detail.po.po_number,
      nursingSupplyPending: await nursingBadge(),
      po: detail.po,
      lines: detail.lines,
      flash: req.query.msg || null,
      error: req.query.err || null
    });
  });

  app.post('/pharmacy/purchase-orders/:id/confirm', requireAuth, phaWrite, async (req, res) => {
    const fid = facilityId(req);
    const poId = parseInt(req.params.id, 10) || 0;
    const user = uid(req);
    const detail = await loadPoDetail(pool, fid, poId);
    if (!detail) {
      return res.redirect('/pharmacy/purchase-orders?err=' + encodeURIComponent('PO not found.'));
    }
    if (detail.po.status !== 'draft') {
      return res.redirect('/pharmacy/purchase-orders/' + poId + '?err=' + encodeURIComponent('Only draft POs can be confirmed.'));
    }

    const expiredLines = [];
    for (const l of detail.lines) {
      if (l.expiry_date && isExpired(l.expiry_date)) {
        expiredLines.push(l);
      }
    }
    if (expiredLines.length && req.body.force !== '1') {
      const names = expiredLines.map((x) => x.item_name).join(', ');
      return res.redirect(
        '/pharmacy/purchase-orders/' +
          poId +
          '?err=' +
          encodeURIComponent('Expired stock on PO lines: ' + names + '. Confirm anyway with override.')
      );
    }

    try {
      await pool.query(
        `UPDATE tbl_purchase_order SET status = 'approved', approved_at = NOW(), approved_by = ? WHERE id = ? AND facility_id = ?`,
        [user, poId, fid]
      );
      return res.redirect('/pharmacy/purchase-orders/' + poId + '?msg=' + encodeURIComponent('Purchase order confirmed.'));
    } catch (e) {
      return res.redirect('/pharmacy/purchase-orders/' + poId + '?err=' + encodeURIComponent(e.message));
    }
  });

  app.post('/pharmacy/purchase-orders/:id/receive', requireAuth, phaWrite, async (req, res) => {
    const fid = facilityId(req);
    const poId = parseInt(req.params.id, 10) || 0;
    const user = uid(req);
    const detail = await loadPoDetail(pool, fid, poId);
    if (!detail) {
      return res.redirect('/pharmacy/purchase-orders?err=' + encodeURIComponent('PO not found.'));
    }
    if (!['approved', 'issued'].includes(String(detail.po.status))) {
      return res.redirect(
        '/pharmacy/purchase-orders/' + poId + '?err=' + encodeURIComponent('Confirm the PO before receiving goods.')
      );
    }

    try {
      for (const l of detail.lines) {
        const iid = parseInt(l.inventory_item_id, 10) || 0;
        const qty = Math.round(parseFloat(l.quantity) || 0);
        if (iid < 1 || qty < 1) continue;
        const [[before]] = await pool.query('SELECT COALESCE(quantity,0) AS quantity FROM tbl_inventory_item WHERE id = ?', [
          iid
        ]);
        const qtyBefore = parseInt(before && before.quantity, 10) || 0;
        const qtyAfter = qtyBefore + qty;
        await pool.query('UPDATE tbl_inventory_item SET quantity = ? WHERE id = ?', [qtyAfter, iid]);
        await recordInventoryMovement(pool, {
          inventory_item_id: iid,
          change_qty: qty,
          qty_before: qtyBefore,
          qty_after: qtyAfter,
          reason: 'po_receive',
          note: 'PO ' + detail.po.po_number,
          user_id: user
        });
      }
      await pool.query(
        `UPDATE tbl_purchase_order SET status = 'received', issued_at = COALESCE(issued_at, NOW()), issued_by = COALESCE(issued_by, ?) WHERE id = ?`,
        [user, poId]
      );
      let glSuffix = '';
      try {
        const glCode = await postPurchaseOrderToGl(pool, {
          facilityId: fid,
          poId,
          po: detail.po,
          lines: detail.lines,
          stockKind: 'pharmacy',
          createdBy: user,
        });
        glSuffix = purchaseOrderJournalSuffix(glCode);
      } catch (_) {
        /* non-blocking */
      }
      return res.redirect(
        '/pharmacy/purchase-orders/' + poId + '?msg=' + encodeURIComponent('Goods received — stock updated.' + glSuffix)
      );
    } catch (e) {
      return res.redirect('/pharmacy/purchase-orders/' + poId + '?err=' + encodeURIComponent(e.message));
    }
  });
};
