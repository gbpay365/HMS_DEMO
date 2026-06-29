/**
 * Procurement hub — purchase orders & vendors (PHP migrations 034, 036, 046).
 */
const { tableExists } = require('../lib/hmsFinGeneralLedger');
const { ensureProcurementVendorSchema } = require('../lib/ensureProcurementVendorSchema');
const { nextProcPoNumber, loadPoDetail, replacePoLines } = require('../lib/procurementPo');
const recordInventoryMovement = require('../lib/recordInventoryMovement');
const { ensureProcurementExtendedSchema } = require('../lib/ensureProcurementExtendedSchema');
const { ensurePurchaseOrderSchema } = require('../lib/ensurePurchaseOrderSchema');
const { insertPoAudit, loadPoAudit } = require('../lib/procurementPoAudit');
const { PROCUREMENT_UNITS, normalizeProcurementUom } = require('../lib/procurementUnits');
const { parseQtyWithUom } = require('../lib/procurementQty');
const { suggestInventoryId, loadInventoryPickList } = require('../lib/procurementInventoryMatch');
const { loadProcurementHubData, loadRecentPos, userCanProcureWrite } = require('../lib/procurementHub');

const VENDOR_CLASSES = ['pharmaceutical', 'consumables', 'equipment', 'services', 'general'];

module.exports = function registerProcurement(app, pool, requireAuth, requirePerm) {
 const procureRead = requirePerm(
  'procurement.read',
  'procurement.write',
  'inventory.read',
  'inventory.write',
  'pharmacy.read',
  'pharmacy.write'
 );
 const procureWrite = requirePerm('procurement.write', 'inventory.write', 'pharmacy.write');

 function facilityId(req) {
  return Math.max(1, parseInt(req.session.facilityId, 10) || 1);
 }

 function pharmacyShellReturn(req, fallback) {
  const ret = String(req.body?.return_to || '').trim();
  return ret.startsWith('/pharmacy/') ? ret.replace(/\/+$/, '') : fallback;
 }

 function userCanProcureWriteReq(req, res) {
  return userCanProcureWrite(res.locals.userPerms || [], req.session.user?.role);
 }

 function rfqBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  const map = {
   draft: 'badge-warning',
   issued: 'badge-info',
   closed: 'badge-secondary',
   cancelled: 'badge-dark',
   submitted: 'badge-primary',
   accepted: 'badge-success',
   rejected: 'badge-danger'
  };
  return map[s] || 'badge-secondary';
 }

 async function nextRfqNumber(pool, fid) {
  const y = new Date().getFullYear();
  const pfx = `RFQ-${y}-`;
  const [[row]] = await pool.query(
   'SELECT rfq_number FROM tbl_procurement_rfq WHERE facility_id = ? AND rfq_number LIKE ? ORDER BY id DESC LIMIT 1',
   [fid, `${pfx}%`]
  ).catch(() => [[null]]);
  let n = 1;
  const last = row && row.rfq_number ? String(row.rfq_number) : '';
  const m = last.match(/-(\d+)$/);
  if (m) n = parseInt(m[1], 10) + 1 || 1;
  return pfx + String(n).padStart(4, '0');
 }

 async function loadRfqList(pool, fid) {
  if (!(await tableExists(pool, 'tbl_procurement_rfq'))) return [];
  const [rows] = await pool.query(
   'SELECT * FROM tbl_procurement_rfq WHERE facility_id = ? ORDER BY created_at DESC LIMIT 100',
   [fid]
  ).catch(() => [[]]);
  return rows || [];
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

 app.get('/procurement', requireAuth, procureRead, async (req, res) => {
  try {
   const fid = facilityId(req);
   const hub = await loadProcurementHubData(pool, fid);
   res.render('procurement', {
    title: 'Procurement - ZAIZENS',
    flash: req.query.msg || null,
    error: req.query.err || null,
    stats: hub.stats,
    pos: hub.pos,
    canWrite: userCanProcureWriteReq(req, res),
   });
  } catch (e) {
   res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
  }
 });

 app.get('/procurement/purchase-orders', requireAuth, procureRead, async (req, res) => {
  try {
   const fid = facilityId(req);
   const allPos = await loadRecentPos(pool, fid, 200);
   const status = String(req.query.status || '').trim().toLowerCase();
   const search = String(req.query.q || '').trim();
   const qLower = search.toLowerCase();
   let pos = allPos;
   if (status) {
    pos = pos.filter((po) => String(po.status || '').toLowerCase() === status);
   }
   if (qLower) {
    pos = pos.filter((po) => {
     const num = String(po.po_number || '').toLowerCase();
     const vendor = String(po.vendor_name || po.supplier_name || '').toLowerCase();
     return num.includes(qLower) || vendor.includes(qLower);
    });
   }
   const poStats = {
    total: allPos.length,
    draft: allPos.filter((po) => String(po.status || '').toLowerCase() === 'draft').length,
    approved: allPos.filter((po) => String(po.status || '').toLowerCase() === 'approved').length,
    received: allPos.filter((po) => String(po.status || '').toLowerCase() === 'received').length,
   };
   res.render('procurement-pos', {
    title: 'Purchase orders - ZAIZENS',
    flash: req.query.msg || null,
    error: req.query.err || null,
    pos,
    poStats,
    poFilter: status,
    poSearch: search,
    canWrite: userCanProcureWriteReq(req, res),
   });
  } catch (e) {
   res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
  }
 });

 app.get('/procurement/purchase-orders/:id(\\d+)', requireAuth, procureRead, async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const fid = facilityId(req);
  if (id < 1 || !(await tableExists(pool, 'tbl_purchase_order'))) {
   return res.redirect('/procurement/purchase-orders?err=' + encodeURIComponent('Purchase order not found.'));
  }
  try {
   await ensureProcurementExtendedSchema(pool).catch(() => {});
   const detail = await loadPoDetail(pool, fid, id);
   if (!detail) {
    return res.redirect('/procurement/purchase-orders?err=' + encodeURIComponent('Purchase order not found.'));
   }
   const audit = await loadPoAudit(pool, id, 30);
   const poSt = String(detail.po.status || '').toLowerCase();
   const poEditable = userCanProcureWriteReq(req, res) && ['draft', 'approved', 'issued', 'received'].includes(poSt);
   const wasSent = ['approved', 'issued', 'received'].includes(poSt);
   let vendors = [];
   let inventoryItems = [];
   if (poEditable) {
    vendors = await loadActiveVendors(pool, fid);
    inventoryItems = await loadInventoryPickList(pool, 400);
   }
   res.render('procurement-po-detail', {
    title: `PO ${detail.po.po_number} - ZAIZENS`,
    flash: req.query.msg || null,
    error: req.query.err || null,
    po: detail.po,
    lines: detail.lines,
    attachments: detail.attachments || [],
    audit,
    units: PROCUREMENT_UNITS,
    vendors,
    inventoryItems,
    wasSent,
    poEditable,
    openEditModal: req.query.edit === '1',
    canWrite: userCanProcureWriteReq(req, res),
    smtpReady: !!(String(process.env.HMS_SMTP_HOST || '').trim() && String(process.env.HMS_SMTP_FROM || '').trim())
   });
  } catch (e) {
   res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
  }
 });

 app.get('/procurement/purchase-orders/:id(\\d+)/print', requireAuth, procureRead, async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const fid = facilityId(req);
  try {
   const detail = await loadPoDetail(pool, fid, id);
   if (!detail) {
    return res.redirect('/procurement/purchase-orders?err=' + encodeURIComponent('Purchase order not found.'));
   }
   res.render('procurement-po-print', {
    title: `PO ${detail.po.po_number}`,
    po: detail.po,
    lines: detail.lines,
    autoPrint: req.query.print === '1'
   });
  } catch (e) {
   res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
  }
 });

 app.post('/procurement/purchase-orders/:id(\\d+)/approve', requireAuth, procureWrite, async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const fid = facilityId(req);
  const uid = parseInt(req.session.userId || req.session.user?.id, 10) || 0;
  const detail = await loadPoDetail(pool, fid, id);
  if (!detail) {
   return res.redirect('/procurement/purchase-orders?err=' + encodeURIComponent('PO not found.'));
  }
  if (String(detail.po.status) !== 'draft') {
   return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent('Only draft POs can be approved.'));
  }
  try {
   await pool.query(
    `UPDATE tbl_purchase_order SET status = 'approved', approved_at = NOW(), approved_by = ? WHERE id = ? AND facility_id = ?`,
    [uid, id, fid]
   );
   await insertPoAudit(pool, {
    purchase_order_id: id,
    facility_id: fid,
    action: 'approve',
    from_status: 'draft',
    to_status: 'approved',
    note: 'Purchase order approved',
    performed_by: uid,
   });
   return res.redirect('/procurement/purchase-orders/' + id + '?msg=' + encodeURIComponent('Purchase order approved.'));
  } catch (e) {
   return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent(e.message || 'Approve failed.'));
  }
 });

 app.post('/procurement/purchase-orders/:id(\\d+)/send', requireAuth, procureWrite, async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const fid = facilityId(req);
  const uid = parseInt(req.session.userId || req.session.user?.id, 10) || 0;
  const detail = await loadPoDetail(pool, fid, id);
  if (!detail) {
   return res.redirect('/procurement/purchase-orders?err=' + encodeURIComponent('PO not found.'));
  }
  if (!['approved', 'issued'].includes(String(detail.po.status))) {
   return res.redirect(
    '/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent('Approve the PO before sending to vendor.')
   );
  }
  const emailTo = String(req.body.vendor_email || detail.po.vendor_email || '').trim();
  const notes = String(req.body.cover_note || '').trim().slice(0, 500);
  let mailNote = '';
  if (emailTo) {
   const { sendMail } = require('../lib/hmsMailer');
   const baseUrl = String(process.env.HMS_PUBLIC_URL || req.protocol + '://' + req.get('host')).replace(/\/$/, '');
   const printUrl = baseUrl + '/procurement/purchase-orders/' + id + '/print';
   const linesText = (detail.lines || [])
    .map((l) => `- ${l.item_name || l.description || 'Item'} × ${l.quantity} ${l.uom || 'unit'} @ ${Number(l.unit_price || 0).toLocaleString()} XAF`)
    .join('\n');
   const result = await sendMail({
    to: emailTo,
    subject: `Purchase order ${detail.po.po_number}`,
    text:
     `Dear supplier,\n\nPlease find our purchase order ${detail.po.po_number}.\n\n` +
     (notes ? notes + '\n\n' : '') +
     `Lines:\n${linesText || '(see attached link)'}\n\n` +
     `Total: ${Number(detail.po.total_amount || 0).toLocaleString()} XAF\n\n` +
     `View / print: ${printUrl}\n`,
   });
   if (result.sent) mailNote = ' Email sent to vendor.';
   else if (result.reason === 'smtp_not_configured') {
    return res.redirect(
     '/procurement/purchase-orders/' +
      id +
      '?err=' +
      encodeURIComponent('SMTP not configured. Download PDF and send manually, or set HMS_SMTP_* env vars.')
    );
   } else {
    return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent('Email could not be sent.'));
   }
  }
  try {
   await pool.query(
    `UPDATE tbl_purchase_order SET status = 'issued', issued_at = COALESCE(issued_at, NOW()), issued_by = COALESCE(issued_by, ?),
      sent_to_vendor_at = NOW(), sent_to_vendor_by = ? WHERE id = ? AND facility_id = ?`,
    [uid, uid, id, fid]
   );
   await insertPoAudit(pool, {
    purchase_order_id: id,
    facility_id: fid,
    action: 'send',
    from_status: detail.po.status,
    to_status: 'issued',
    note: emailTo ? `Sent to ${emailTo}` : 'Marked sent to vendor',
    performed_by: uid,
   });
   return res.redirect(
    '/procurement/purchase-orders/' + id + '?msg=' + encodeURIComponent('PO marked sent to vendor.' + mailNote)
   );
  } catch (e) {
   return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent(e.message || 'Send failed.'));
  }
 });

 app.post('/procurement/purchase-orders/:id(\\d+)/receive', requireAuth, procureWrite, async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const fid = facilityId(req);
  const uid = parseInt(req.session.userId || req.session.user?.id, 10) || 0;
  const detail = await loadPoDetail(pool, fid, id);
  if (!detail) {
   return res.redirect('/procurement/purchase-orders?err=' + encodeURIComponent('PO not found.'));
  }
  if (!['approved', 'issued'].includes(String(detail.po.status))) {
   return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent('PO must be approved before receiving.'));
  }
  try {
   for (const l of detail.lines || []) {
    const iid = parseInt(l.inventory_item_id, 10) || 0;
    const qty = parseInt(l.quantity, 10) || 0;
    if (iid < 1 || qty < 1) continue;
    const [[before]] = await pool.query('SELECT COALESCE(quantity,0) AS quantity FROM tbl_inventory_item WHERE id = ?', [iid]);
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
     user_id: uid,
    });
   }
   await pool.query(
    `UPDATE tbl_purchase_order SET status = 'received' WHERE id = ? AND facility_id = ?`,
    [id, fid]
   );
   let glSuffix = '';
   try {
    const glCode = await postPurchaseOrderToGl(pool, {
     facilityId: fid,
     poId: id,
     po: detail.po,
     lines: detail.lines,
     stockKind: 'procurement',
     createdBy: uid,
    });
    glSuffix = purchaseOrderJournalSuffix(glCode);
   } catch (_) {
    /* non-blocking */
   }
   return res.redirect('/procurement/purchase-orders/' + id + '?msg=' + encodeURIComponent('Goods received — inventory updated.' + glSuffix));
  } catch (e) {
   return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent(e.message || 'Receive failed.'));
  }
 });

 app.get('/procurement/vendors', requireAuth, procureRead, async (req, res) => {
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
   res.render('procurement-vendors', {
    title: 'Vendors - ZAIZENS',
    flash: req.query.msg || null,
    error: req.query.err || null,
    vendors,
    vendorSearch: search,
    vendorClasses: VENDOR_CLASSES,
    canWrite: userCanProcureWriteReq(req, res)
   });
  } catch (e) {
   res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
  }
 });

 app.post('/procurement/vendors/add', requireAuth, procureWrite, async (req, res) => {
  const fid = facilityId(req);
  if (!(await tableExists(pool, 'tbl_procurement_vendor'))) {
   return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?err=' + encodeURIComponent('Vendor table not installed. Run procurement migrations (046).'));
  }
  await ensureProcurementVendorSchema(pool).catch(() => {});
  const name = String(req.body.name || '').trim();
  if (!name) {
   return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?err=' + encodeURIComponent('Vendor name is required.'));
  }
  let code = String(req.body.vendor_code || '').trim().slice(0, 32);
  if (!code) {
   code = `V-${Date.now().toString(36).toUpperCase()}`.slice(0, 32);
  }
  const contact_name = String(req.body.contact_name || '').trim().slice(0, 128) || null;
  const tax_id = String(req.body.tax_id || '').trim().slice(0, 64) || null;
  const phone = String(req.body.phone || '').trim().slice(0, 64) || null;
  const email = String(req.body.email || '').trim().slice(0, 160) || null;
  const address = String(req.body.address || '').trim().slice(0, 512) || null;
  let vendorClass = String(req.body.vendor_class || 'general').trim().toLowerCase();
  if (!VENDOR_CLASSES.includes(vendorClass)) vendorClass = 'general';
  const uid = parseInt(req.session.userId || req.session.user?.id, 10) || 0;
  try {
   await pool.query(
    `INSERT INTO tbl_procurement_vendor
     (facility_id, vendor_code, name, contact_name, phone, email, address, tax_id, notes, is_active, vendor_class, created_by)
     VALUES (?,?,?,?,?,?,?,?,NULL,1,?,?)`,
    [fid, code, name.slice(0, 255), contact_name, phone, email, address, tax_id, vendorClass, uid]
   );
   return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?msg=' + encodeURIComponent('Vendor registered.'));
  } catch (e) {
   const msg = String(e.message || e);
   if (/Duplicate/i.test(msg)) {
    return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?err=' + encodeURIComponent('That vendor code already exists for this site.'));
   }
   return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?err=' + encodeURIComponent(msg));
  }
 });

 app.post('/procurement/vendors/:id/update', requireAuth, procureWrite, async (req, res) => {
  const fid = facilityId(req);
  const vid = parseInt(req.params.id, 10) || 0;
  if (vid < 1) return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?err=' + encodeURIComponent('Invalid vendor.'));
  await ensureProcurementVendorSchema(pool).catch(() => {});
  const name = String(req.body.name || '').trim();
  if (!name) return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?err=' + encodeURIComponent('Vendor name is required.'));
  let vendorClass = String(req.body.vendor_class || 'general').trim().toLowerCase();
  if (!VENDOR_CLASSES.includes(vendorClass)) vendorClass = 'general';
  try {
   await pool.query(
    `UPDATE tbl_procurement_vendor SET name=?, contact_name=?, phone=?, email=?, address=?, tax_id=?, vendor_class=?
      WHERE id=? AND facility_id=? LIMIT 1`,
    [
     name.slice(0, 255),
     String(req.body.contact_name || '').trim().slice(0, 128) || null,
     String(req.body.phone || '').trim().slice(0, 64) || null,
     String(req.body.email || '').trim().slice(0, 160) || null,
     String(req.body.address || '').trim().slice(0, 512) || null,
     String(req.body.tax_id || '').trim().slice(0, 64) || null,
     vendorClass,
     vid,
     fid,
    ]
   );
   return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?msg=' + encodeURIComponent('Vendor updated.'));
  } catch (e) {
   return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?err=' + encodeURIComponent(e.message || 'Update failed.'));
  }
 });

 app.post('/procurement/vendors/:id/suspend', requireAuth, procureWrite, async (req, res) => {
  const fid = facilityId(req);
  const vid = parseInt(req.params.id, 10) || 0;
  const uid = parseInt(req.session.userId || req.session.user?.id, 10) || 0;
  await ensureProcurementVendorSchema(pool).catch(() => {});
  try {
   await pool.query(
    `UPDATE tbl_procurement_vendor SET is_active=0, suspended_at=NOW(), suspended_by=? WHERE id=? AND facility_id=? LIMIT 1`,
    [uid, vid, fid]
   );
   return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?msg=' + encodeURIComponent('Vendor suspended.'));
  } catch (e) {
   return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?err=' + encodeURIComponent(e.message || 'Suspend failed.'));
  }
 });

 app.post('/procurement/vendors/:id/activate', requireAuth, procureWrite, async (req, res) => {
  const fid = facilityId(req);
  const vid = parseInt(req.params.id, 10) || 0;
  await ensureProcurementVendorSchema(pool).catch(() => {});
  try {
   await pool.query(
    `UPDATE tbl_procurement_vendor SET is_active=1, suspended_at=NULL, suspended_by=NULL WHERE id=? AND facility_id=? LIMIT 1`,
    [vid, fid]
   );
   return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?msg=' + encodeURIComponent('Vendor reactivated.'));
  } catch (e) {
   return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?err=' + encodeURIComponent(e.message || 'Activate failed.'));
  }
 });

 app.post('/procurement/vendors/:id/delete', requireAuth, procureWrite, async (req, res) => {
  const fid = facilityId(req);
  const vid = parseInt(req.params.id, 10) || 0;
  try {
   const [[poRef]] = await pool.query(
    'SELECT id FROM tbl_purchase_order WHERE vendor_id = ? AND facility_id = ? LIMIT 1',
    [vid, fid]
   ).catch(() => [[null]]);
   const [[qRef]] = await pool.query(
    'SELECT id FROM tbl_procurement_quotation WHERE vendor_id = ? AND facility_id = ? LIMIT 1',
    [vid, fid]
   ).catch(() => [[null]]);
   if (poRef || qRef) {
    return res.redirect(
     pharmacyShellReturn(req, '/procurement/vendors') +
     '?err=' +
      encodeURIComponent('Vendor has purchase orders or quotations — suspend instead of delete.')
    );
   }
   await pool.query('DELETE FROM tbl_procurement_vendor WHERE id = ? AND facility_id = ? LIMIT 1', [vid, fid]);
   return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?msg=' + encodeURIComponent('Vendor deleted.'));
  } catch (e) {
   return res.redirect(pharmacyShellReturn(req, '/procurement/vendors') + '?err=' + encodeURIComponent(e.message || 'Delete failed.'));
  }
 });

 app.post('/procurement/rfq', requireAuth, procureWrite, async (req, res) => {
  const fid = facilityId(req);
  const uid = parseInt(req.session.userId || req.session.user?.id, 10) || 0;
  const act = String(req.body.rfq_action || '').trim();
  const rfqId = parseInt(req.body.rfq_id, 10) || 0;

  if (!(await tableExists(pool, 'tbl_procurement_rfq'))) {
   return res.redirect('/procurement/rfq?err=' + encodeURIComponent('RFQ tables not installed. Run migration 046.'));
  }

  try {
   if (act === 'create') {
    const title = String(req.body.title || 'Request for quotation').trim().slice(0, 255) || 'Request for quotation';
    let neededBy = String(req.body.needed_by || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) neededBy = null;
    const num = await nextRfqNumber(pool, fid);
    const [ins] = await pool.query(
     'INSERT INTO tbl_procurement_rfq (facility_id, rfq_number, title, status, needed_by, created_by) VALUES (?,?,?,?,?,?)',
     [fid, num, title, 'draft', neededBy, uid]
    );
    const newId = ins.insertId;
    return res.redirect('/procurement/rfq/' + newId + '?msg=' + encodeURIComponent('Draft RFQ created.'));
   }

   if (rfqId < 1) {
    return res.redirect('/procurement/rfq?err=' + encodeURIComponent('Invalid RFQ.'));
   }

   const [[rfq]] = await pool.query(
    'SELECT * FROM tbl_procurement_rfq WHERE id = ? AND facility_id = ? LIMIT 1',
    [rfqId, fid]
   );
   if (!rfq) {
    return res.redirect('/procurement/rfq?err=' + encodeURIComponent('RFQ not found.'));
   }

   if (act === 'add_line' && String(rfq.status) === 'draft') {
    const desc = String(req.body.line_desc || '').trim();
    if (desc) {
     const { quantity: qty, uom } = parseQtyWithUom(req.body.line_qty, req.body.line_uom);
     if (qty <= 0) {
      return res.redirect('/procurement/rfq/' + rfqId + '?err=' + encodeURIComponent('Invalid quantity.'));
     }
     const [[mx]] = await pool.query(
      'SELECT COALESCE(MAX(line_no), 0) + 1 AS n FROM tbl_procurement_rfq_line WHERE rfq_id = ?',
      [rfqId]
     );
     const lineNo = parseInt(mx?.n, 10) || 1;
     const invId = parseInt(req.body.line_inventory_item_id, 10) || null;
     await pool.query(
      'INSERT INTO tbl_procurement_rfq_line (rfq_id, line_no, description, quantity, uom, inventory_item_id) VALUES (?,?,?,?,?,?)',
      [rfqId, lineNo, desc.slice(0, 512), qty, uom, invId]
     );
     return res.redirect('/procurement/rfq/' + rfqId + '?msg=' + encodeURIComponent('Line added.'));
    }
    return res.redirect('/procurement/rfq/' + rfqId + '?err=' + encodeURIComponent('Description is required.'));
   }

   if (act === 'issue' && String(rfq.status) === 'draft') {
    const lines = await loadRfqLines(pool, rfqId);
    if (lines.length) {
     await pool.query(
      "UPDATE tbl_procurement_rfq SET status = 'issued', issued_at = NOW() WHERE id = ? AND facility_id = ? LIMIT 1",
      [rfqId, fid]
     );
     return res.redirect(
      '/procurement/rfq/' + rfqId + '?msg=' + encodeURIComponent('RFQ issued — vendors may respond with quotations.')
     );
    }
    return res.redirect(
     '/procurement/rfq/' + rfqId + '?msg=' + encodeURIComponent('Add at least one line before issuing.')
    );
   }

   if (act === 'close' && ['draft', 'issued'].includes(String(rfq.status))) {
    await pool.query(
     "UPDATE tbl_procurement_rfq SET status = 'closed', closed_at = NOW() WHERE id = ? AND facility_id = ? LIMIT 1",
     [rfqId, fid]
    );
    return res.redirect('/procurement/rfq/' + rfqId + '?msg=' + encodeURIComponent('RFQ closed.'));
   }

   if (act === 'add_quotation' && ['issued', 'closed'].includes(String(rfq.status))) {
    if (!(await tableExists(pool, 'tbl_procurement_quotation'))) {
     return res.redirect('/procurement/rfq/' + rfqId + '?err=' + encodeURIComponent('Quotation tables not installed.'));
    }
    const vendorId = parseInt(req.body.vendor_id, 10) || 0;
    if (vendorId < 1) {
     return res.redirect('/procurement/rfq/' + rfqId + '?err=' + encodeURIComponent('Select a vendor.'));
    }
    const rfqLines = await loadRfqLines(pool, rfqId);
    if (!rfqLines.length) {
     return res.redirect('/procurement/rfq/' + rfqId + '?err=' + encodeURIComponent('RFQ has no lines.'));
    }
    const prices = Array.isArray(req.body.line_unit_price)
     ? req.body.line_unit_price
     : req.body.line_unit_price != null
       ? [req.body.line_unit_price]
       : [];
    const invIds = Array.isArray(req.body.line_inventory_item_id)
     ? req.body.line_inventory_item_id
     : req.body.line_inventory_item_id != null
       ? [req.body.line_inventory_item_id]
       : [];
    let total = 0;
    const quoteLines = [];
    for (let i = 0; i < rfqLines.length; i++) {
     const ln = rfqLines[i];
     const qty = parseFloat(ln.quantity) || 1;
     const unitPrice = parseFloat(String(prices[i] || '0').replace(',', '.')) || 0;
     let invId = parseInt(invIds[i], 10) || parseInt(ln.inventory_item_id, 10) || 0;
     if (invId < 1) {
      invId = (await suggestInventoryId(pool, ln.description, null)) || 0;
     }
     if (invId > 0 && invId !== parseInt(ln.inventory_item_id, 10)) {
      await pool
       .query('UPDATE tbl_procurement_rfq_line SET inventory_item_id = ? WHERE id = ?', [invId, ln.id])
       .catch(() => {});
     }
     total += qty * unitPrice;
     quoteLines.push({
      rfq_line_id: ln.id,
      description: ln.description,
      quantity: qty,
      unit_price: unitPrice,
      inventory_item_id: invId > 0 ? invId : null,
     });
    }
    const vendorRef = String(req.body.vendor_ref || '').trim().slice(0, 128) || null;
    const [insQ] = await pool.query(
     `INSERT INTO tbl_procurement_quotation
      (facility_id, rfq_id, vendor_id, vendor_ref, status, currency, total_amount, submitted_at, created_by)
      VALUES (?,?,?,?, 'submitted', 'XAF', ?, NOW(), ?)`,
     [fid, rfqId, vendorId, vendorRef, total, uid]
    );
    const quoteId = insQ.insertId;
    for (const ql of quoteLines) {
     await pool.query(
      `INSERT INTO tbl_procurement_quotation_line (quotation_id, rfq_line_id, description, quantity, unit_price, inventory_item_id)
       VALUES (?,?,?,?,?,?)`,
      [
       quoteId,
       ql.rfq_line_id,
       ql.description.slice(0, 512),
       ql.quantity,
       ql.unit_price,
       ql.inventory_item_id,
      ]
     );
    }
    return res.redirect('/procurement/rfq/' + rfqId + '?msg=' + encodeURIComponent('Quotation recorded.'));
   }

   if (act === 'accept_quote') {
    const quoteId = parseInt(req.body.quotation_id, 10) || 0;
    if (quoteId < 1) {
     return res.redirect('/procurement/rfq/' + rfqId + '?err=' + encodeURIComponent('Invalid quotation.'));
    }
    await pool.query(
     "UPDATE tbl_procurement_quotation SET status = 'accepted' WHERE id = ? AND rfq_id = ? AND facility_id = ?",
     [quoteId, rfqId, fid]
    );
    await pool.query(
     "UPDATE tbl_procurement_quotation SET status = 'rejected' WHERE rfq_id = ? AND facility_id = ? AND id <> ? AND status = 'submitted'",
     [rfqId, fid, quoteId]
    );
    return res.redirect('/procurement/rfq/' + rfqId + '?msg=' + encodeURIComponent('Quotation accepted.'));
   }

   if (act === 'create_po' && (await tableExists(pool, 'tbl_purchase_order'))) {
    await ensurePurchaseOrderSchema(pool).catch(() => {});
    const quoteId = parseInt(req.body.quotation_id, 10) || 0;
    if (quoteId < 1) {
     return res.redirect('/procurement/rfq/' + rfqId + '?err=' + encodeURIComponent('Select an accepted quotation.'));
    }
    const [[quote]] = await pool.query(
     `SELECT q.*, v.name AS vendor_name FROM tbl_procurement_quotation q
      LEFT JOIN tbl_procurement_vendor v ON v.id = q.vendor_id
      WHERE q.id = ? AND q.rfq_id = ? AND q.facility_id = ? LIMIT 1`,
     [quoteId, rfqId, fid]
    );
    if (!quote || String(quote.status) !== 'accepted') {
     return res.redirect('/procurement/rfq/' + rfqId + '?err=' + encodeURIComponent('Accept a quotation before creating a PO.'));
    }
    const [qLines] = await pool.query(
     'SELECT * FROM tbl_procurement_quotation_line WHERE quotation_id = ? ORDER BY id ASC',
     [quoteId]
    ).catch(() => [[]]);
    if (!qLines || !qLines.length) {
     return res.redirect('/procurement/rfq/' + rfqId + '?err=' + encodeURIComponent('Quotation has no lines.'));
    }
    const poNumber = await nextProcPoNumber(pool, fid);
    const [insPo] = await pool.query(
     `INSERT INTO tbl_purchase_order
      (facility_id, po_number, supplier_name, vendor_id, rfq_id, quotation_id, status, total_amount, created_by, po_notes)
      VALUES (?,?,?,?,?,?,'draft',?,?,?)`,
     [
      fid,
      poNumber,
      quote.vendor_name || 'Vendor',
      quote.vendor_id,
      rfqId,
      quoteId,
      parseFloat(quote.total_amount) || 0,
      uid,
      `From RFQ ${rfq.rfq_number}`,
     ]
    );
    const poId = insPo.insertId;
    const poLines = [];
    for (const ql of qLines) {
     let invId = parseInt(ql.inventory_item_id, 10) || null;
     if (!invId && ql.description) {
      const [[inv]] = await pool
       .query('SELECT id FROM tbl_inventory_item WHERE LOWER(name) LIKE LOWER(?) ORDER BY id ASC LIMIT 1', [
        '%' + String(ql.description).trim() + '%',
       ])
       .catch(() => [[null]]);
      if (inv && inv.id) invId = parseInt(inv.id, 10) || null;
     }
     poLines.push({
      inventory_item_id: invId,
      quantity: ql.quantity,
      unit_price: ql.unit_price,
      description: String(ql.description || '').slice(0, 512) || null,
      uom: 'unit',
     });
    }
    await replacePoLines(pool, poId, poLines);
    return res.redirect('/procurement/purchase-orders/' + poId + '?msg=' + encodeURIComponent('Draft PO created from quotation.'));
   }

   return res.redirect('/procurement/rfq/' + rfqId + '?err=' + encodeURIComponent('Action not allowed.'));
  } catch (e) {
   const u = rfqId > 0 ? '/procurement/rfq/' + rfqId : '/procurement/rfq';
   return res.redirect(u + '?err=' + encodeURIComponent(e.message || 'RFQ action failed.'));
  }
 });

 app.get('/procurement/rfq', requireAuth, procureRead, async (req, res) => {
  try {
   const fid = facilityId(req);
   const rfqReady = await tableExists(pool, 'tbl_procurement_rfq');
   const allRfqs = rfqReady ? await loadRfqList(pool, fid) : [];
   const rfqFilter = String(req.query.status || '').trim().toLowerCase();
   const rfqSearch = String(req.query.q || '').trim();
   const qLower = rfqSearch.toLowerCase();
   let rfqList = allRfqs;
   if (rfqFilter) {
    rfqList = rfqList.filter((r) => String(r.status || '').toLowerCase() === rfqFilter);
   }
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
   res.render('procurement-rfq', {
    title: 'Requests for quotation - ZAIZENS',
    flash: req.query.msg || null,
    error: req.query.err || null,
    rfqReady,
    rfq: null,
    rfqNotFound: false,
    rfqList,
    rfqStats,
    rfqFilter,
    rfqSearch,
    lines: [],
    quotes: [],
    canWrite: userCanProcureWriteReq(req, res),
    badgeClass: rfqBadgeClass
   });
  } catch (e) {
   res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
  }
 });

 app.get('/procurement/rfq/new', requireAuth, procureRead, (req, res) => {
  res.redirect('/procurement/rfq');
 });

 app.get('/procurement/rfq/:id(\\d+)', requireAuth, procureRead, async (req, res) => {
  try {
   const id = parseInt(req.params.id, 10) || 0;
   const fid = facilityId(req);
   const rfqReady = await tableExists(pool, 'tbl_procurement_rfq');
   if (!rfqReady || id < 1) {
    return res.redirect('/procurement/rfq?err=' + encodeURIComponent('Invalid RFQ.'));
   }
   const [[rfq]] = await pool.query(
    'SELECT * FROM tbl_procurement_rfq WHERE id = ? AND facility_id = ? LIMIT 1',
    [id, fid]
   );
   if (!rfq) {
    return res.render('procurement-rfq', {
     title: 'RFQ - ZAIZENS',
     flash: req.query.msg || null,
     error: req.query.err || null,
     rfqReady: true,
     rfq: null,
     rfqNotFound: true,
     rfqList: [],
     lines: [],
     quotes: [],
     canWrite: userCanProcureWriteReq(req, res),
     badgeClass: rfqBadgeClass
    });
   }
   const lines = await enrichRfqLinesForSkuPick(pool, await loadRfqLines(pool, id));
   const quotes = await loadQuotationsForRfq(pool, fid, id);
   const vendors = await loadActiveVendors(pool, fid);
   const inventoryItems = await loadInventoryPickList(pool, 400);
   res.render('procurement-rfq', {
    title: `RFQ ${rfq.rfq_number} - ZAIZENS`,
    flash: req.query.msg || null,
    error: req.query.err || null,
    rfqReady: true,
    rfq,
    rfqNotFound: false,
    rfqList: [],
    lines,
    quotes,
    vendors,
    inventoryItems,
    canWrite: userCanProcureWriteReq(req, res),
    badgeClass: rfqBadgeClass
   });
  } catch (e) {
   res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
  }
 });

 app.get('/procurement/goods-receipt', requireAuth, procureWrite, (req, res) => {
  res.redirect(
   '/procurement?msg=' + encodeURIComponent('Goods receipt (GRN) is available in PHP; use Inventory receive or extend Node when needed.')
  );
 });

 require('./procurementExtended')(app, pool, requireAuth, procureRead, procureWrite, {
  facilityId,
  userCanProcureWrite: userCanProcureWriteReq,
  loadActiveVendors,
 });
};
