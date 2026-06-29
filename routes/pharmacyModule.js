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
const { loadProcurementHubData, userCanProcureWrite } = require('../lib/procurementHub');
const { pharmacyProcHubLocals } = require('../lib/pharmacyProcurementUrls');
const { postPurchaseOrderToGl, purchaseOrderJournalSuffix } = require('../lib/finPurchaseOrderJournal');
const { ensureProcurementVendorSchema } = require('../lib/ensureProcurementVendorSchema');
const { loadPrList, loadPrDetail } = require('../lib/procurementPurchaseRequest');
const { suggestInventoryId, loadInventoryPickList } = require('../lib/procurementInventoryMatch');

const VENDOR_CLASSES = ['pharmaceutical', 'consumables', 'equipment', 'services', 'general'];

function rfqBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  const map = {
    draft: 'badge-warning',
    issued: 'badge-info',
    closed: 'badge-secondary',
    cancelled: 'badge-dark',
    submitted: 'badge-primary',
    accepted: 'badge-success',
    rejected: 'badge-danger',
  };
  return map[s] || 'badge-secondary';
}

async function loadRfqLines(pool, rfqId) {
  if (!(await tableExists(pool, 'tbl_procurement_rfq_line'))) return [];
  const [rows] = await pool.query(
    `SELECT l.*, i.name AS inv_name, i.sku AS inv_sku
       FROM tbl_procurement_rfq_line l
       LEFT JOIN tbl_inventory_item i ON i.id = l.inventory_item_id
      WHERE l.rfq_id = ?
      ORDER BY l.line_no ASC, l.id ASC`,
    [rfqId]
  ).catch(() => [[]]);
  return rows || [];
}

async function enrichRfqLinesForSkuPick(pool, lines) {
  const out = [];
  for (const ln of lines || []) {
    const suggested =
      parseInt(ln.inventory_item_id, 10) ||
      (await suggestInventoryId(pool, ln.description, null)) ||
      null;
    out.push({ ...ln, suggested_inventory_id: suggested });
  }
  return out;
}

async function loadQuotationsForRfq(pool, fid, rfqId) {
  if (!(await tableExists(pool, 'tbl_procurement_quotation'))) return [];
  const [rows] = await pool.query(
    `SELECT q.*, v.name AS vendor_name FROM tbl_procurement_quotation q
     INNER JOIN tbl_procurement_vendor v ON v.id = q.vendor_id AND v.facility_id = ?
     WHERE q.facility_id = ? AND q.rfq_id = ? ORDER BY q.created_at DESC`,
    [fid, fid, rfqId]
  ).catch(() => [[]]);
  return rows || [];
}

async function loadActiveVendors(pool, fid) {
  if (!(await tableExists(pool, 'tbl_procurement_vendor'))) return [];
  await ensureProcurementVendorSchema(pool).catch(() => {});
  const [rows] = await pool.query(
    'SELECT id, name, vendor_code, email FROM tbl_procurement_vendor WHERE facility_id = ? AND is_active = 1 ORDER BY name ASC',
    [fid]
  ).catch(() => [[]]);
  return rows || [];
}

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

  // ── Full procurement hub (pharmacy shell) ───────────────────
  app.get('/pharmacy/procurement', requireAuth, phaRead, async (req, res) => {
    try {
      const fid = facilityId(req);
      const hub = await loadProcurementHubData(pool, fid);
      const perms = res.locals.userPerms || [];
      res.render('pharmacy-procurement', pharmacyProcHubLocals({
        title: 'Procurement Hub — Pharmacy',
        phaOdooTitle: 'Procurement Hub',
        nursingSupplyPending: await nursingBadge(),
        stats: hub.stats,
        pos: hub.pos,
        canWrite: userCanProcureWrite(perms, req.session.user?.role),
        flash: req.query.msg || null,
        error: req.query.err || null,
      }));
    } catch (e) {
      console.error('pharmacy procurement hub:', e);
      return res.redirect('/pharmacy?view=products&err=' + encodeURIComponent(e.message || 'Could not load procurement hub.'));
    }
  });

  app.get('/pharmacy/procurement/vendors', requireAuth, phaRead, async (req, res) => {
    try {
      const fid = facilityId(req);
      await ensureProcurementVendorSchema(pool).catch(() => {});
      const search = String(req.query.q || '').trim();
      let vendors = [];
      if (await tableExists(pool, 'tbl_procurement_vendor')) {
        let sql = 'SELECT * FROM tbl_procurement_vendor WHERE facility_id = ?';
        const params = [fid];
        if (search) {
          sql += ' AND (name LIKE ? OR vendor_code LIKE ? OR contact_name LIKE ? OR email LIKE ?)';
          const like = `%${search}%`;
          params.push(like, like, like, like);
        }
        sql += ' ORDER BY name ASC LIMIT 500';
        const [rows] = await pool.query(sql, params);
        vendors = rows || [];
      }
      const perms = res.locals.userPerms || [];
      res.render('procurement-vendors', pharmacyProcHubLocals({
        title: 'Vendors — Pharmacy',
        phaOdooTitle: 'Vendor directory',
        nursingSupplyPending: await nursingBadge(),
        vendors,
        vendorSearch: search,
        vendorClasses: VENDOR_CLASSES,
        canWrite: userCanProcureWrite(perms, req.session.user?.role),
        flash: req.query.msg || null,
        error: req.query.err || null,
      }));
    } catch (e) {
      console.error('pharmacy procurement vendors:', e);
      return res.redirect('/pharmacy/procurement?err=' + encodeURIComponent(e.message || 'Could not load vendors.'));
    }
  });

  app.get('/pharmacy/procurement/rfq', requireAuth, phaRead, async (req, res) => {
    try {
      const fid = facilityId(req);
      const rfqReady = await tableExists(pool, 'tbl_procurement_rfq');
      let allRfqs = [];
      if (rfqReady) {
        const [rows] = await pool.query(
          'SELECT * FROM tbl_procurement_rfq WHERE facility_id = ? ORDER BY created_at DESC LIMIT 100',
          [fid]
        );
        allRfqs = rows || [];
      }
      const rfqFilter = String(req.query.status || '').trim().toLowerCase();
      const rfqSearch = String(req.query.q || '').trim();
      const qLower = rfqSearch.toLowerCase();
      let rfqList = allRfqs;
      if (rfqFilter) rfqList = rfqList.filter((r) => String(r.status || '').toLowerCase() === rfqFilter);
      if (qLower) {
        rfqList = rfqList.filter((r) => {
          const num = String(r.rfq_number || '').toLowerCase();
          const title = String(r.title || '').toLowerCase();
          return num.includes(qLower) || title.includes(qLower);
        });
      }
      const rfqStats = {
        total: allRfqs.length,
        draft: allRfqs.filter((r) => String(r.status || '').toLowerCase() === 'draft').length,
        issued: allRfqs.filter((r) => String(r.status || '').toLowerCase() === 'issued').length,
        closed: allRfqs.filter((r) => String(r.status || '').toLowerCase() === 'closed').length,
      };
      const perms = res.locals.userPerms || [];
      res.render('procurement-rfq', pharmacyProcHubLocals({
        title: 'RFQs — Pharmacy',
        phaOdooTitle: 'Requests for quotation',
        nursingSupplyPending: await nursingBadge(),
        rfqReady,
        rfq: null,
        rfqNotFound: false,
        rfqList,
        rfqStats,
        rfqFilter,
        rfqSearch,
        lines: [],
        quotes: [],
        canWrite: userCanProcureWrite(perms, req.session.user?.role),
        badgeClass: (status) => {
          const map = { draft: 'badge-warning', issued: 'badge-info', closed: 'badge-secondary' };
          return map[String(status || '').toLowerCase()] || 'badge-secondary';
        },
        flash: req.query.msg || null,
        error: req.query.err || null,
      }));
    } catch (e) {
      console.error('pharmacy procurement rfq:', e);
      return res.redirect('/pharmacy/procurement?err=' + encodeURIComponent(e.message || 'Could not load RFQs.'));
    }
  });

  app.get('/pharmacy/procurement/rfq/:id(\\d+)', requireAuth, phaRead, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10) || 0;
      const fid = facilityId(req);
      const rfqReady = await tableExists(pool, 'tbl_procurement_rfq');
      if (!rfqReady || id < 1) {
        return res.redirect('/pharmacy/procurement/rfq?err=' + encodeURIComponent('Invalid RFQ.'));
      }
      const [[rfq]] = await pool.query(
        'SELECT * FROM tbl_procurement_rfq WHERE id = ? AND facility_id = ? LIMIT 1',
        [id, fid]
      );
      if (!rfq) {
        return res.render('procurement-rfq', pharmacyProcHubLocals({
          title: 'RFQ — Pharmacy',
          phaOdooTitle: 'Requests for quotation',
          nursingSupplyPending: await nursingBadge(),
          rfqReady: true,
          rfq: null,
          rfqNotFound: true,
          rfqList: [],
          lines: [],
          quotes: [],
          canWrite: userCanProcureWrite(res.locals.userPerms || [], req.session.user?.role),
          badgeClass: rfqBadgeClass,
          flash: req.query.msg || null,
          error: req.query.err || null,
        }));
      }
      const lines = await enrichRfqLinesForSkuPick(pool, await loadRfqLines(pool, id));
      const quotes = await loadQuotationsForRfq(pool, fid, id);
      const vendors = await loadActiveVendors(pool, fid);
      const inventoryItems = await loadInventoryPickList(pool, 400);
      const perms = res.locals.userPerms || [];
      res.render('procurement-rfq', pharmacyProcHubLocals({
        title: `RFQ ${rfq.rfq_number} — Pharmacy`,
        phaOdooTitle: rfq.rfq_number,
        nursingSupplyPending: await nursingBadge(),
        rfqReady: true,
        rfq,
        rfqNotFound: false,
        rfqList: [],
        lines,
        quotes,
        vendors,
        inventoryItems,
        canWrite: userCanProcureWrite(perms, req.session.user?.role),
        badgeClass: rfqBadgeClass,
        flash: req.query.msg || null,
        error: req.query.err || null,
      }));
    } catch (e) {
      console.error('pharmacy procurement rfq detail:', e);
      return res.redirect('/pharmacy/procurement/rfq?err=' + encodeURIComponent(e.message || 'Could not load RFQ.'));
    }
  });

  app.get('/pharmacy/procurement/purchase-requests', requireAuth, phaRead, async (req, res) => {
    try {
      await ensureProcurementExtendedSchema(pool).catch(() => {});
      await ensureProcurementVendorSchema(pool).catch(() => {});
      const fid = facilityId(req);
      const allPr = await loadPrList(pool, fid, 200);
      const status = String(req.query.status || '').trim().toLowerCase();
      const dept = String(req.query.dept || '').trim().toLowerCase();
      const search = String(req.query.q || '').trim();
      const qLower = search.toLowerCase();
      let prList = allPr;
      if (status) prList = prList.filter((row) => String(row.status || '').toLowerCase() === status);
      if (dept) prList = prList.filter((row) => String(row.source_department || '').toLowerCase() === dept);
      if (qLower) {
        prList = prList.filter((row) => {
          const num = String(row.pr_number || '').toLowerCase();
          const title = String(row.title || '').toLowerCase();
          const vendor = String(row.vendor_name || '').toLowerCase();
          return num.includes(qLower) || title.includes(qLower) || vendor.includes(qLower);
        });
      }
      const prStats = {
        total: allPr.length,
        draft: allPr.filter((row) => String(row.status || '').toLowerCase() === 'draft').length,
        issued: allPr.filter((row) => String(row.status || '').toLowerCase() === 'issued').length,
        reviewed: allPr.filter((row) => String(row.status || '').toLowerCase() === 'reviewed').length,
      };
      let vendors = [];
      if (await tableExists(pool, 'tbl_procurement_vendor')) {
        const [rows] = await pool.query(
          'SELECT id, name, vendor_code, email FROM tbl_procurement_vendor WHERE facility_id = ? AND is_active = 1 ORDER BY name ASC',
          [fid]
        );
        vendors = rows || [];
      }
      const perms = res.locals.userPerms || [];
      res.render('procurement-pr', pharmacyProcHubLocals({
        title: 'Purchase requests — Pharmacy',
        phaOdooTitle: 'Purchase requests',
        nursingSupplyPending: await nursingBadge(),
        prList,
        prStats,
        prFilter: status,
        prDeptFilter: dept,
        prSearch: search,
        pr: null,
        lines: [],
        vendors,
        canWrite: userCanProcureWrite(perms, req.session.user?.role),
        flash: req.query.msg || null,
        error: req.query.err || null,
      }));
    } catch (e) {
      console.error('pharmacy procurement purchase-requests:', e);
      return res.redirect('/pharmacy/procurement?err=' + encodeURIComponent(e.message || 'Could not load purchase requests.'));
    }
  });

  app.get('/pharmacy/procurement/purchase-requests/:id(\\d+)', requireAuth, phaRead, async (req, res) => {
    try {
      await ensureProcurementExtendedSchema(pool).catch(() => {});
      await ensureProcurementVendorSchema(pool).catch(() => {});
      const id = parseInt(req.params.id, 10) || 0;
      const fid = facilityId(req);
      const detail = await loadPrDetail(pool, fid, id);
      if (!detail) {
        return res.redirect('/pharmacy/procurement/purchase-requests?err=' + encodeURIComponent('Purchase request not found.'));
      }
      const vendors = await loadActiveVendors(pool, fid);
      const inventoryItems = await loadInventoryPickList(pool, 400);
      const perms = res.locals.userPerms || [];
      res.render('procurement-pr', pharmacyProcHubLocals({
        title: `PR ${detail.pr.pr_number} — Pharmacy`,
        phaOdooTitle: detail.pr.pr_number,
        nursingSupplyPending: await nursingBadge(),
        prList: [],
        prStats: null,
        prFilter: '',
        prSearch: '',
        pr: detail.pr,
        lines: detail.lines,
        vendors,
        inventoryItems,
        units: PROCUREMENT_UNITS,
        canWrite: userCanProcureWrite(perms, req.session.user?.role),
        flash: req.query.msg || null,
        error: req.query.err || null,
      }));
    } catch (e) {
      console.error('pharmacy procurement purchase-request detail:', e);
      return res.redirect('/pharmacy/procurement/purchase-requests?err=' + encodeURIComponent(e.message || 'Could not load purchase request.'));
    }
  });

  app.get('/pharmacy/procurement/purchase-requests/:id(\\d+)/print', requireAuth, phaRead, async (req, res) => {
    try {
      await ensureProcurementExtendedSchema(pool).catch(() => {});
      const id = parseInt(req.params.id, 10) || 0;
      const fid = facilityId(req);
      const detail = await loadPrDetail(pool, fid, id);
      if (!detail) {
        return res.redirect('/pharmacy/procurement/purchase-requests?err=' + encodeURIComponent('Purchase request not found.'));
      }
      res.render('procurement-pr-print', {
        title: `PR ${detail.pr.pr_number}`,
        pr: detail.pr,
        lines: detail.lines,
        autoPrint: req.query.print === '1',
      });
    } catch (e) {
      console.error('pharmacy procurement purchase-request print:', e);
      return res.redirect('/pharmacy/procurement/purchase-requests?err=' + encodeURIComponent(e.message || 'Could not print purchase request.'));
    }
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
