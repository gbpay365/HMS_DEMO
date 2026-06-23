'use strict';

const fs = require('fs');
const path = require('path');
const { ensureProcurementExtendedSchema } = require('../lib/ensureProcurementExtendedSchema');
const { ensurePurchaseOrderSchema } = require('../lib/ensurePurchaseOrderSchema');
const { ensureProcurementVendorSchema } = require('../lib/ensureProcurementVendorSchema');
const { nextProcPoNumber, loadPoDetail, replacePoLines, calcPoTotal } = require('../lib/procurementPo');
const { insertPoAudit, loadPoAudit, poSnapshot } = require('../lib/procurementPoAudit');
const { parsePoLinesFromFile, sumPoLineTotal } = require('../lib/procurementPoImport');
const { procurementPoUploadMw, PROCUREMENT_PO_UPLOAD_DIR } = require('../lib/procurementUploadMulter');
const { PROCUREMENT_UNITS, normalizeProcurementUom } = require('../lib/procurementUnits');
const { parseQtyWithUom } = require('../lib/procurementQty');
const { nextPrNumber, loadPrList, loadPrDetail } = require('../lib/procurementPurchaseRequest');
const { loadInventoryPickList } = require('../lib/procurementInventoryMatch');
const { tableExists } = require('../lib/hmsFinGeneralLedger');

module.exports = function registerProcurementExtended(app, pool, requireAuth, procureRead, procureWrite, helpers) {
  const { facilityId, userCanProcureWrite, loadActiveVendors } = helpers;

  async function ensureSchemas() {
    await ensureProcurementVendorSchema(pool).catch(() => {});
    await ensurePurchaseOrderSchema(pool).catch(() => {});
    await ensureProcurementExtendedSchema(pool).catch(() => {});
  }

  function parsePoLinesFromBody(body) {
    const descs = Array.isArray(body.line_description) ? body.line_description : body.line_description != null ? [body.line_description] : [];
    const qtys = Array.isArray(body.line_quantity) ? body.line_quantity : body.line_quantity != null ? [body.line_quantity] : [];
    const uoms = Array.isArray(body.line_uom) ? body.line_uom : body.line_uom != null ? [body.line_uom] : [];
    const prices = Array.isArray(body.line_unit_price) ? body.line_unit_price : body.line_unit_price != null ? [body.line_unit_price] : [];
    const invIds = Array.isArray(body.line_inventory_item_id)
      ? body.line_inventory_item_id
      : body.line_inventory_item_id != null
        ? [body.line_inventory_item_id]
        : [];
    const max = Math.max(descs.length, qtys.length, prices.length, 1);
    const lines = [];
    for (let i = 0; i < max; i++) {
      const description = String(descs[i] || '').trim();
      const unit_price = parseFloat(String(prices[i] || '0').replace(',', '.')) || 0;
      const { quantity, uom } = parseQtyWithUom(qtys[i], uoms[i]);
      const inventory_item_id = parseInt(invIds[i], 10) || null;
      if (!description && quantity <= 0 && unit_price <= 0) continue;
      lines.push({ description, quantity: quantity || 1, unit_price, uom, inventory_item_id });
    }
    return lines;
  }

  app.get('/procurement/purchase-orders/new', requireAuth, procureWrite, async (req, res) => {
    try {
      await ensureSchemas();
      const fid = facilityId(req);
      const vendors = await loadActiveVendors(pool, fid);
      const inventoryItems = await loadInventoryPickList(pool, 400);
      const prId = parseInt(req.query.from_pr, 10) || 0;
      let fromPr = null;
      if (prId > 0) {
        fromPr = await loadPrDetail(pool, fid, prId);
      }
      res.render('procurement-po-new', {
        title: 'New purchase order - ZAIZENS',
        flash: req.query.msg || null,
        error: req.query.err || null,
        vendors,
        inventoryItems,
        units: PROCUREMENT_UNITS,
        fromPr,
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/procurement/purchase-orders', requireAuth, procureWrite, procurementPoUploadMw('import_file'), async (req, res) => {
    const fid = facilityId(req);
    const uid = parseInt(req.session.userId || req.session.user?.id, 10) || 0;
    await ensureSchemas();
    if (!(await tableExists(pool, 'tbl_purchase_order'))) {
      return res.redirect('/procurement/purchase-orders?err=' + encodeURIComponent('Purchase order table not installed.'));
    }

    let poMode = String(req.body.po_mode || 'lined').trim() === 'summary' ? 'summary' : 'lined';
    const vendorId = parseInt(req.body.vendor_id, 10) || null;
    const supplierName = String(req.body.supplier_name || '').trim();
    const summaryDescription = String(req.body.summary_description || '').trim();
    const poNotes = String(req.body.po_notes || '').trim().slice(0, 512) || null;
    const manualTotal = parseFloat(String(req.body.total_amount || '0').replace(',', '.')) || 0;
    const prId = parseInt(req.body.purchase_request_id, 10) || null;

    let lines = poMode === 'lined' ? parsePoLinesFromBody(req.body) : [];
    const warnings = [];

    if (req.file) {
      try {
        const buf = fs.readFileSync(req.file.path);
        const parsed = await parsePoLinesFromFile(buf, req.file.originalname);
        if (parsed.rows.length) {
          lines = parsed.rows;
          poMode = 'lined';
        }
        warnings.push(...(parsed.warnings || []));
      } catch (e) {
        if (req.file.path) fs.unlinkSync(req.file.path);
        return res.redirect('/procurement/purchase-orders/new?err=' + encodeURIComponent(e.message || 'Import failed.'));
      }
    }

    if (poMode === 'summary' && !summaryDescription && manualTotal <= 0) {
      return res.redirect('/procurement/purchase-orders/new?err=' + encodeURIComponent('Summary PO requires a description or total amount.'));
    }
    if (poMode === 'lined' && !lines.length && !req.file) {
      return res.redirect('/procurement/purchase-orders/new?err=' + encodeURIComponent('Add at least one line or attach a file to import lines.'));
    }

    let vendorName = supplierName;
    if (vendorId) {
      const [[v]] = await pool.query('SELECT name FROM tbl_procurement_vendor WHERE id = ? AND facility_id = ? LIMIT 1', [vendorId, fid]);
      if (v && v.name) vendorName = v.name;
    }
    if (!vendorName) vendorName = 'Vendor';

    const total = poMode === 'summary' ? manualTotal : calcPoTotal(lines, manualTotal);
    const poNumber = await nextProcPoNumber(pool, fid);

    try {
      const [ins] = await pool.query(
        `INSERT INTO tbl_purchase_order
          (facility_id, po_number, supplier_name, vendor_id, status, total_amount, created_by, po_notes,
           summary_description, po_mode, purchase_request_id)
         VALUES (?,?,?,?,'draft',?,?,?,?,?,?)`,
        [fid, poNumber, vendorName.slice(0, 255), vendorId, total, uid, poNotes, summaryDescription || null, poMode, prId]
      );
      const poId = ins.insertId;

      if (lines.length) {
        await replacePoLines(pool, poId, lines);
        const recomputed = calcPoTotal(lines, total);
        if (recomputed > 0) {
          await pool.query('UPDATE tbl_purchase_order SET total_amount = ? WHERE id = ?', [recomputed, poId]);
        }
      }

      if (req.file) {
        await pool.query(
          `INSERT INTO tbl_procurement_po_attachment
            (purchase_order_id, facility_id, original_name, stored_name, mime_type, doc_type, file_size, uploaded_by, import_parsed)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            poId,
            fid,
            req.file.originalname.slice(0, 255),
            path.basename(req.file.path),
            req.file.mimetype || null,
            String(req.body.doc_type || 'import_source').slice(0, 32),
            req.file.size || null,
            uid,
            lines.length ? 1 : 0,
          ]
        );
      }

      await insertPoAudit(pool, {
        purchase_order_id: poId,
        facility_id: fid,
        action: 'create',
        from_status: null,
        to_status: 'draft',
        note: poMode === 'summary' ? 'Summary PO created' : `PO created with ${lines.length} line(s)`,
        snapshot_json: { po_mode: poMode, lines_count: lines.length, warnings },
        performed_by: uid,
      });

      if (prId) {
        await pool
          .query(
            "UPDATE tbl_procurement_purchase_request SET status = 'converted', converted_po_id = ? WHERE id = ? AND facility_id = ?",
            [poId, prId, fid]
          )
          .catch(() => {});
      }

      return res.redirect('/procurement/purchase-orders/' + poId + '?msg=' + encodeURIComponent('Draft PO created.'));
    } catch (e) {
      return res.redirect('/procurement/purchase-orders/new?err=' + encodeURIComponent(e.message || 'Create failed.'));
    }
  });

  app.get('/procurement/purchase-orders/:id(\\d+)/edit', requireAuth, procureWrite, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const fid = facilityId(req);
    await ensureSchemas();
    const detail = await loadPoDetail(pool, fid, id);
    if (!detail) {
      return res.redirect('/procurement/purchase-orders?err=' + encodeURIComponent('PO not found.'));
    }
    if (!['draft', 'approved', 'issued', 'received'].includes(String(detail.po.status))) {
      return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent('This PO cannot be edited.'));
    }
    const vendors = await loadActiveVendors(pool, fid);
    const inventoryItems = await loadInventoryPickList(pool, 400);
    const wasSent = ['approved', 'issued', 'received'].includes(String(detail.po.status));
    res.render('procurement-po-edit', {
      title: `Edit PO ${detail.po.po_number} - ZAIZENS`,
      flash: req.query.msg || null,
      error: req.query.err || null,
      po: detail.po,
      lines: detail.lines,
      attachments: detail.attachments || [],
      vendors,
      inventoryItems,
      units: PROCUREMENT_UNITS,
      wasSent,
    });
  });

  app.post('/procurement/purchase-orders/:id(\\d+)/update', requireAuth, procureWrite, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const fid = facilityId(req);
    const uid = parseInt(req.session.userId || req.session.user?.id, 10) || 0;
    await ensureSchemas();
    const detail = await loadPoDetail(pool, fid, id);
    if (!detail) {
      return res.redirect('/procurement/purchase-orders?err=' + encodeURIComponent('PO not found.'));
    }
    if (!['draft', 'approved', 'issued', 'received'].includes(String(detail.po.status))) {
      return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent('PO cannot be edited in current status.'));
    }

    const wasSent = ['approved', 'issued', 'received'].includes(String(detail.po.status));
    const editNote = String(req.body.edit_note || '').trim().slice(0, 2000);
    if (wasSent && !editNote) {
      return res.redirect(
        '/procurement/purchase-orders/' + id + '?edit=1&err=' + encodeURIComponent('Correction reason is required when editing an approved, issued, or received PO.')
      );
    }

    const beforeSnap = poSnapshot(detail);
    const poMode = String(req.body.po_mode || detail.po.po_mode || 'lined').trim() === 'summary' ? 'summary' : 'lined';
    const vendorId = parseInt(req.body.vendor_id, 10) || null;
    const supplierName = String(req.body.supplier_name || '').trim();
    const summaryDescription = String(req.body.summary_description || '').trim();
    const poNotes = String(req.body.po_notes || '').trim().slice(0, 512) || null;
    const manualTotal = parseFloat(String(req.body.total_amount || '0').replace(',', '.')) || 0;
    const lines = poMode === 'lined' ? parsePoLinesFromBody(req.body) : [];

    let vendorName = supplierName || detail.po.supplier_name;
    if (vendorId) {
      const [[v]] = await pool.query('SELECT name FROM tbl_procurement_vendor WHERE id = ? AND facility_id = ? LIMIT 1', [vendorId, fid]);
      if (v && v.name) vendorName = v.name;
    }

    const total = poMode === 'summary' ? manualTotal : calcPoTotal(lines, manualTotal);

    try {
      const recallFields = wasSent
        ? ', status=\'draft\', recalled_at=NOW(), recalled_by=?, recall_reason=?'
        : ', recalled_at=NULL, recalled_by=NULL, recall_reason=NULL';
      const recallParams = wasSent ? [uid, editNote] : [];

      await pool.query(
        `UPDATE tbl_purchase_order SET supplier_name=?, vendor_id=?, total_amount=?, po_notes=?,
          summary_description=?, po_mode=?${recallFields}
         WHERE id=? AND facility_id=?`,
        [
          vendorName.slice(0, 255),
          vendorId,
          total,
          poNotes,
          summaryDescription || null,
          poMode,
          ...recallParams,
          id,
          fid,
        ]
      );
      if (poMode === 'lined') {
        await replacePoLines(pool, id, lines);
        const recomputed = calcPoTotal(lines, total);
        if (recomputed > 0) {
          await pool.query('UPDATE tbl_purchase_order SET total_amount = ? WHERE id = ?', [recomputed, id]);
        }
      } else {
        await pool.query('DELETE FROM tbl_purchase_order_line WHERE purchase_order_id = ?', [id]);
      }

      const afterDetail = await loadPoDetail(pool, fid, id);
      await insertPoAudit(pool, {
        purchase_order_id: id,
        facility_id: fid,
        action: wasSent ? 'recall_edit' : 'edit',
        from_status: detail.po.status,
        to_status: afterDetail.po.status,
        note: editNote || 'PO updated',
        snapshot_json: { before: beforeSnap, after: poSnapshot(afterDetail) },
        performed_by: uid,
      });

      const msg = wasSent
        ? 'PO recalled and updated — re-approve before sending to vendor again.'
        : 'PO updated.';
      return res.redirect('/procurement/purchase-orders/' + id + '?msg=' + encodeURIComponent(msg));
    } catch (e) {
      return res.redirect('/procurement/purchase-orders/' + id + '?edit=1&err=' + encodeURIComponent(e.message || 'Update failed.'));
    }
  });

  app.post('/procurement/purchase-orders/:id(\\d+)/recall', requireAuth, procureWrite, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const fid = facilityId(req);
    const uid = parseInt(req.session.userId || req.session.user?.id, 10) || 0;
    const reason = String(req.body.recall_reason || '').trim().slice(0, 512);
    if (!reason) {
      return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent('Recall reason is required.'));
    }
    const detail = await loadPoDetail(pool, fid, id);
    if (!detail) {
      return res.redirect('/procurement/purchase-orders?err=' + encodeURIComponent('PO not found.'));
    }
    if (!['approved', 'issued'].includes(String(detail.po.status))) {
      return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent('Only approved or issued POs can be recalled.'));
    }
    const fromStatus = detail.po.status;
    try {
      await pool.query(
        `UPDATE tbl_purchase_order SET status='draft', recalled_at=NOW(), recalled_by=?, recall_reason=?
         WHERE id=? AND facility_id=?`,
        [uid, reason, id, fid]
      );
      await insertPoAudit(pool, {
        purchase_order_id: id,
        facility_id: fid,
        action: 'recall',
        from_status: fromStatus,
        to_status: 'draft',
        note: reason,
        snapshot_json: poSnapshot(detail),
        performed_by: uid,
      });
      return res.redirect('/procurement/purchase-orders/' + id + '/edit?msg=' + encodeURIComponent('PO recalled for correction. Edit and re-approve before sending again.'));
    } catch (e) {
      return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent(e.message || 'Recall failed.'));
    }
  });

  app.post('/procurement/purchase-orders/:id(\\d+)/attachments', requireAuth, procureWrite, procurementPoUploadMw('attachment'), async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const fid = facilityId(req);
    const uid = parseInt(req.session.userId || req.session.user?.id, 10) || 0;
    const detail = await loadPoDetail(pool, fid, id);
    if (!detail) {
      return res.redirect('/procurement/purchase-orders?err=' + encodeURIComponent('PO not found.'));
    }
    if (!req.file) {
      return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent('No file uploaded.'));
    }
    try {
      await pool.query(
        `INSERT INTO tbl_procurement_po_attachment
          (purchase_order_id, facility_id, original_name, stored_name, mime_type, doc_type, file_size, uploaded_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          id,
          fid,
          req.file.originalname.slice(0, 255),
          path.basename(req.file.path),
          req.file.mimetype || null,
          String(req.body.doc_type || 'other').slice(0, 32),
          req.file.size || null,
          uid,
        ]
      );
      await insertPoAudit(pool, {
        purchase_order_id: id,
        facility_id: fid,
        action: 'attach',
        from_status: detail.po.status,
        to_status: detail.po.status,
        note: `Attached ${req.file.originalname}`,
        performed_by: uid,
      });
      return res.redirect('/procurement/purchase-orders/' + id + '?msg=' + encodeURIComponent('Attachment uploaded.'));
    } catch (e) {
      return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent(e.message || 'Upload failed.'));
    }
  });

  app.get('/procurement/purchase-orders/:id(\\d+)/attachments/:aid(\\d+)/download', requireAuth, procureRead, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const aid = parseInt(req.params.aid, 10) || 0;
    const fid = facilityId(req);
    const [[att]] = await pool.query(
      'SELECT * FROM tbl_procurement_po_attachment WHERE id = ? AND purchase_order_id = ? AND facility_id = ? LIMIT 1',
      [aid, id, fid]
    );
    if (!att) {
      return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent('Attachment not found.'));
    }
    const filePath = path.join(PROCUREMENT_PO_UPLOAD_DIR, att.stored_name);
    if (!fs.existsSync(filePath)) {
      return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent('File missing on server.'));
    }
    return res.download(filePath, att.original_name);
  });

  app.post('/procurement/purchase-orders/:id(\\d+)/generate-lines', requireAuth, procureWrite, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const aid = parseInt(req.body.attachment_id, 10) || 0;
    const fid = facilityId(req);
    const uid = parseInt(req.session.userId || req.session.user?.id, 10) || 0;
    const detail = await loadPoDetail(pool, fid, id);
    if (!detail) {
      return res.redirect('/procurement/purchase-orders?err=' + encodeURIComponent('PO not found.'));
    }
    if (!['draft', 'approved', 'issued'].includes(String(detail.po.status))) {
      return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent('Cannot generate lines in current status.'));
    }
    const [[att]] = await pool.query(
      'SELECT * FROM tbl_procurement_po_attachment WHERE id = ? AND purchase_order_id = ? AND facility_id = ? LIMIT 1',
      [aid, id, fid]
    );
    if (!att) {
      return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent('Attachment not found.'));
    }
    const filePath = path.join(PROCUREMENT_PO_UPLOAD_DIR, att.stored_name);
    try {
      const buf = fs.readFileSync(filePath);
      const parsed = await parsePoLinesFromFile(buf, att.original_name);
      if (!parsed.rows.length) {
        return res.redirect('/procurement/purchase-orders/' + id + '/edit?err=' + encodeURIComponent('No lines could be parsed from attachment.'));
      }
      await replacePoLines(pool, id, parsed.rows);
      const total = sumPoLineTotal(parsed.rows);
      await pool.query(
        "UPDATE tbl_purchase_order SET po_mode='lined', total_amount=?, summary_description=COALESCE(summary_description, ?) WHERE id=? AND facility_id=?",
        [total, detail.po.summary_description, id, fid]
      );
      await pool.query('UPDATE tbl_procurement_po_attachment SET import_parsed=1 WHERE id=?', [aid]);
      await insertPoAudit(pool, {
        purchase_order_id: id,
        facility_id: fid,
        action: 'generate_lines',
        from_status: detail.po.status,
        to_status: detail.po.status,
        note: `Generated ${parsed.rows.length} line(s) from ${att.original_name}`,
        snapshot_json: { lines: parsed.rows, warnings: parsed.warnings },
        performed_by: uid,
      });
      return res.redirect('/procurement/purchase-orders/' + id + '/edit?msg=' + encodeURIComponent(`Generated ${parsed.rows.length} line(s) from attachment.`));
    } catch (e) {
      return res.redirect('/procurement/purchase-orders/' + id + '?err=' + encodeURIComponent(e.message || 'Generate lines failed.'));
    }
  });

  // --- Purchase Requests ---
  app.get('/procurement/purchase-requests', requireAuth, procureRead, async (req, res) => {
    await ensureSchemas();
    const fid = facilityId(req);
    const allPr = await loadPrList(pool, fid, 200);
    const status = String(req.query.status || '').trim().toLowerCase();
    const dept = String(req.query.dept || '').trim().toLowerCase();
    const search = String(req.query.q || '').trim();
    const qLower = search.toLowerCase();
    let prList = allPr;
    if (status) {
      prList = prList.filter((row) => String(row.status || '').toLowerCase() === status);
    }
    if (dept) {
      prList = prList.filter((row) => String(row.source_department || '').toLowerCase() === dept);
    }
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
    const vendors = await loadActiveVendors(pool, fid);
    res.render('procurement-pr', {
      title: 'Purchase requests - ZAIZENS',
      flash: req.query.msg || null,
      error: req.query.err || null,
      prList,
      prStats,
      prFilter: status,
      prDeptFilter: dept,
      prSearch: search,
      pr: null,
      lines: [],
      vendors,
      canWrite: userCanProcureWrite(req, res),
    });
  });

  app.get('/procurement/purchase-requests/:id', requireAuth, procureRead, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const fid = facilityId(req);
    await ensureSchemas();
    const detail = await loadPrDetail(pool, fid, id);
    if (!detail) {
      return res.redirect('/procurement/purchase-requests?err=' + encodeURIComponent('Purchase request not found.'));
    }
    const vendors = await loadActiveVendors(pool, fid);
    const inventoryItems = await loadInventoryPickList(pool, 400);
    res.render('procurement-pr', {
      title: `PR ${detail.pr.pr_number} - ZAIZENS`,
      flash: req.query.msg || null,
      error: req.query.err || null,
      prList: [],
      prStats: null,
      prFilter: '',
      prSearch: '',
      pr: detail.pr,
      lines: detail.lines,
      vendors,
      inventoryItems,
      units: PROCUREMENT_UNITS,
      canWrite: userCanProcureWrite(req, res),
    });
  });

  app.get('/procurement/purchase-requests/:id/print', requireAuth, procureRead, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const fid = facilityId(req);
    const detail = await loadPrDetail(pool, fid, id);
    if (!detail) {
      return res.redirect('/procurement/purchase-requests?err=' + encodeURIComponent('Purchase request not found.'));
    }
    res.render('procurement-pr-print', {
      title: `PR ${detail.pr.pr_number}`,
      pr: detail.pr,
      lines: detail.lines,
      autoPrint: req.query.print === '1',
    });
  });

  app.post('/procurement/purchase-requests', requireAuth, procureWrite, async (req, res) => {
    const fid = facilityId(req);
    const uid = parseInt(req.session.userId || req.session.user?.id, 10) || 0;
    const act = String(req.body.pr_action || 'create').trim();
    const prId = parseInt(req.body.pr_id, 10) || 0;
    await ensureSchemas();

    try {
      if (act === 'create') {
        const title = String(req.body.title || 'Purchase request').trim().slice(0, 255) || 'Purchase request';
        let neededBy = String(req.body.needed_by || '').trim().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) neededBy = null;
        const vendorId = parseInt(req.body.vendor_id, 10) || null;
        const summaryDescription = String(req.body.summary_description || '').trim() || null;
        const estimatedTotal = parseFloat(String(req.body.estimated_total || '0').replace(',', '.')) || null;
        const notes = String(req.body.notes || '').trim().slice(0, 512) || null;
        const num = await nextPrNumber(pool, fid);
        const [ins] = await pool.query(
          `INSERT INTO tbl_procurement_purchase_request
            (facility_id, pr_number, title, status, vendor_id, needed_by, summary_description, estimated_total, notes, created_by)
           VALUES (?,?,?,'draft',?,?,?,?,?,?)`,
          [fid, num, title, vendorId, neededBy, summaryDescription, estimatedTotal, notes, uid]
        );
        return res.redirect('/procurement/purchase-requests/' + ins.insertId + '?msg=' + encodeURIComponent('Draft purchase request created.'));
      }

      if (prId < 1) {
        return res.redirect('/procurement/purchase-requests?err=' + encodeURIComponent('Invalid purchase request.'));
      }

      const detail = await loadPrDetail(pool, fid, prId);
      if (!detail) {
        return res.redirect('/procurement/purchase-requests?err=' + encodeURIComponent('Purchase request not found.'));
      }

      if (act === 'add_line' && detail.pr.status === 'draft') {
        const desc = String(req.body.line_desc || '').trim();
        if (!desc) {
          return res.redirect('/procurement/purchase-requests/' + prId + '?err=' + encodeURIComponent('Line description required.'));
        }
        const { quantity: qty, uom } = parseQtyWithUom(req.body.line_qty, req.body.line_uom);
        const invId = parseInt(req.body.line_inventory_item_id, 10) || null;
        const [[mx]] = await pool.query(
          'SELECT COALESCE(MAX(line_no),0)+1 AS n FROM tbl_procurement_purchase_request_line WHERE purchase_request_id=?',
          [prId]
        );
        await pool.query(
          `INSERT INTO tbl_procurement_purchase_request_line
            (purchase_request_id, line_no, description, quantity, uom, inventory_item_id)
           VALUES (?,?,?,?,?,?)`,
          [prId, parseInt(mx?.n, 10) || 1, desc.slice(0, 512), qty, uom, invId]
        );
        return res.redirect('/procurement/purchase-requests/' + prId + '?msg=' + encodeURIComponent('Line added.'));
      }

      if (act === 'issue' && detail.pr.status === 'draft') {
        await pool.query(
          "UPDATE tbl_procurement_purchase_request SET status='issued', issued_at=NOW() WHERE id=? AND facility_id=?",
          [prId, fid]
        );
        return res.redirect('/procurement/purchase-requests/' + prId + '?msg=' + encodeURIComponent('Purchase request issued — download and send to vendor.'));
      }

      if (act === 'review' && detail.pr.status === 'issued') {
        await pool.query(
          "UPDATE tbl_procurement_purchase_request SET status='reviewed', reviewed_at=NOW(), reviewed_by=? WHERE id=? AND facility_id=?",
          [uid, prId, fid]
        );
        return res.redirect('/procurement/purchase-requests/' + prId + '?msg=' + encodeURIComponent('Purchase request marked reviewed.'));
      }

      if (act === 'convert_po' && ['issued', 'reviewed'].includes(detail.pr.status)) {
        return res.redirect('/procurement/purchase-orders/new?from_pr=' + prId + '&msg=' + encodeURIComponent('Create draft PO from this purchase request.'));
      }

      return res.redirect('/procurement/purchase-requests/' + prId + '?err=' + encodeURIComponent('Action not allowed.'));
    } catch (e) {
      const u = prId > 0 ? '/procurement/purchase-requests/' + prId : '/procurement/purchase-requests';
      return res.redirect(u + '?err=' + encodeURIComponent(e.message || 'Action failed.'));
    }
  });
};
