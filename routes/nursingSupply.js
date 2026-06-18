// Nurse stock / material requests → pharmacy queue
const ensureNursingSupplyRequestSchema = require('../lib/ensureNursingSupplyRequestSchema');

function userId(req) {
  return parseInt(req.session.userId || req.session.user?.id, 10) || 0;
}

function fid(req) {
  return req.session && req.session.facilityId ? Number(req.session.facilityId) : 1;
}

function inferSupplyLineType(categoryName, itemName) {
  const s = `${String(categoryName || '')} ${String(itemName || '')}`.toLowerCase();
  if (
    /\b(drug|medicine|pharmaceutical|pharma|tablet|capsule|injection|inject|syrup|suspension|infusion|ampoule|vial|bottle\s*ml|oral\s*liquid|ophthalmic|topical\s*cream|ointment)\b/.test(
      s
    )
  ) {
    return 'drug';
  }
  return 'material';
}

module.exports = function (app, pool, requireAuth, requirePerm) {
  app.get('/nursing/supply-requests', requireAuth, requirePerm('nursing.read', 'nursing.write'), async (req, res) => {
    try {
      await ensureNursingSupplyRequestSchema(pool);
      const uid = userId(req);
      const ctxAdmissionId = parseInt(req.query.admission_id, 10) || 0;
      let ctxWard = String(req.query.ward || '').trim().slice(0, 120) || null;
      let ctxPatient = String(req.query.patient || '').trim().slice(0, 200) || null;
      if (ctxAdmissionId > 0 && (!ctxWard || !ctxPatient)) {
        const [[adm]] = await pool
          .query(
            `SELECT a.id, b.ward_name, CONCAT(p.first_name,' ',p.last_name) AS patient_name
               FROM tbl_admission a
               JOIN tbl_patient p ON p.id = a.patient_id
               LEFT JOIN tbl_bed b ON b.id = a.bed_id
              WHERE a.id = ? LIMIT 1`,
            [ctxAdmissionId]
          )
          .catch(() => [[null]]);
        if (adm) {
          if (!ctxWard) ctxWard = adm.ward_name || null;
          if (!ctxPatient) ctxPatient = adm.patient_name || null;
        }
      }
      const [mine] = await pool.query(
        `SELECT r.*, e.first_name, e.last_name
           FROM tbl_nursing_supply_request r
           LEFT JOIN tbl_employee e ON e.id = r.requested_by
          WHERE r.requested_by = ?
          ORDER BY r.id DESC LIMIT 80`,
        [uid]
      );
      const mineList = Array.isArray(mine) ? mine : [];
      const reqIds = mineList.map((r) => r.id);
      const linesByReq = {};
      if (reqIds.length) {
        const [lineRows] = await pool.query(
          `SELECT * FROM tbl_nursing_supply_request_line WHERE request_id IN (${reqIds.map(() => '?').join(',')}) ORDER BY request_id, id`,
          reqIds
        );
        for (const ln of lineRows || []) {
          if (!linesByReq[ln.request_id]) linesByReq[ln.request_id] = [];
          linesByReq[ln.request_id].push(ln);
        }
      }
      let inventoryItems = [];
      try {
        const [invRows] = await pool.query(
          `SELECT i.id, i.name, i.sku, i.quantity, COALESCE(i.reorder_level, 0) AS reorder_level,
                  COALESCE(c.name, '') AS category_name
             FROM tbl_inventory_item i
             LEFT JOIN tbl_inventory_category c ON c.id = i.category_id
            ORDER BY (i.quantity > 0) DESC,
                     (i.quantity > 0 AND i.quantity <= COALESCE(i.reorder_level, 0)) DESC,
                     i.name ASC
            LIMIT 800`
        );
        inventoryItems = (Array.isArray(invRows) ? invRows : []).map((r) => {
          const qty = parseInt(r.quantity, 10) || 0;
          const reorder = parseInt(r.reorder_level, 10) || 0;
          const line_type = inferSupplyLineType(r.category_name, r.name);
          let stockLabel = 'In stock';
          if (qty <= 0) stockLabel = 'Out of stock';
          else if (reorder > 0 && qty <= reorder) stockLabel = 'Low stock';
          const sku = String(r.sku || '').trim();
          const label = `${String(r.name || '').trim()} — ${qty} units${sku ? ` · ${sku}` : ''} · ${stockLabel}`;
          return {
            id: r.id,
            name: String(r.name || '').trim(),
            sku,
            qty,
            reorder,
            line_type,
            stockLabel,
            label,
          };
        });
      } catch (e) {
        inventoryItems = [];
      }
      res.render('nursing-supply-requests', {
        title: 'Nursing — Pharmacy requests',
        pageData: {
          requests: mineList.map((r) => ({
            ...r,
            nurse_name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
            lines: linesByReq[r.id] || [],
          })),
          inventoryItems,
          context: {
            admission_id: ctxAdmissionId || null,
            ward_name: ctxWard,
            patient_label: ctxPatient,
          },
          flash: req.query.msg || null,
          error: req.query.err || null,
        },
        flash: req.query.msg || null,
        error: req.query.err || null,
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/nursing/supply-requests', requireAuth, requirePerm('nursing.write'), async (req, res) => {
    try {
      await ensureNursingSupplyRequestSchema(pool);
      const uid = userId(req);
      if (uid < 1) return res.redirect('/nursing/supply-requests?err=' + encodeURIComponent('Not signed in.'));
      const notes = String(req.body.notes || '').trim().slice(0, 2000) || null;
      const admission_id = parseInt(req.body.admission_id, 10) || null;
      const ward_name = String(req.body.ward_name || '').trim().slice(0, 120) || null;
      const patient_label = String(req.body.patient_label || '').trim().slice(0, 200) || null;
      const toArr = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);
      const invIds = toArr(req.body.inventory_item_id);
      const qtys = toArr(req.body.quantity);
      const remarks = toArr(req.body.remarks);

      const lines = [];
      const n = Math.max(invIds.length, qtys.length, remarks.length);
      for (let i = 0; i < n; i++) {
        const iid = parseInt(invIds[i], 10) || 0;
        if (iid < 1) continue;
        const [invLookup] = await pool.query(
          `SELECT i.id, i.name, i.quantity, COALESCE(c.name, '') AS category_name
             FROM tbl_inventory_item i
             LEFT JOIN tbl_inventory_category c ON c.id = i.category_id
            WHERE i.id = ?
            LIMIT 1`,
          [iid]
        );
        const row = invLookup && invLookup[0];
        if (!row) {
          return res.redirect('/nursing/supply-requests?err=' + encodeURIComponent('Unknown inventory item — refresh the page and try again.'));
        }
        const line_type = inferSupplyLineType(row.category_name, row.name);
        const qtyOnHand = parseInt(row.quantity, 10) || 0;
        const item_name = String(row.name || '').trim().slice(0, 255);
        if (!item_name) continue;
        lines.push({
          inventory_item_id: iid,
          line_type,
          item_name,
          quantity: String(qtys[i] || '').trim().slice(0, 64) || null,
          remarks: String(remarks[i] || '').trim().slice(0, 500) || null,
          qty_on_hand_snapshot: qtyOnHand,
        });
      }
      if (!lines.length) {
        return res.redirect(
          '/nursing/supply-requests?err=' +
            encodeURIComponent('Choose at least one item from the pharmacy stock list on each line.')
        );
      }

      const [ins] = await pool.query(
        `INSERT INTO tbl_nursing_supply_request
           (facility_id, requested_by, status, notes, admission_id, ward_name, patient_label)
         VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
        [fid(req), uid, notes, admission_id, ward_name, patient_label]
      );
      const rid = ins.insertId;
      for (const ln of lines) {
        await pool.query(
          `INSERT INTO tbl_nursing_supply_request_line
            (request_id, line_type, item_name, quantity, remarks, inventory_item_id, qty_on_hand_snapshot)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            rid,
            ln.line_type,
            ln.item_name,
            ln.quantity,
            ln.remarks,
            ln.inventory_item_id,
            ln.qty_on_hand_snapshot,
          ]
        );
      }
      res.redirect('/nursing/supply-requests?msg=' + encodeURIComponent('Request sent to pharmacy. They have been notified in the Pharmacy hub.'));
    } catch (e) {
      res.redirect('/nursing/supply-requests?err=' + encodeURIComponent(e.message));
    }
  });

  app.get('/pharmacy/nursing-requests', requireAuth, requirePerm('pharmacy.read', 'pharmacy.write'), async (req, res) => {
    try {
      await ensureNursingSupplyRequestSchema(pool);
      const uid = userId(req);
      const [rows] = await pool.query(
        `SELECT r.*, e.first_name, e.last_name
           FROM tbl_nursing_supply_request r
           LEFT JOIN tbl_employee e ON e.id = r.requested_by
          ORDER BY
            CASE r.status WHEN 'pending' THEN 0 WHEN 'preparing' THEN 1 ELSE 2 END,
            r.id DESC
          LIMIT 200`
      );
      const list = Array.isArray(rows) ? rows : [];
      const ids = list.map((r) => r.id);
      const byReq = {};
      const invIds = new Set();
      if (ids.length) {
        const [lines] = await pool.query(
          `SELECT * FROM tbl_nursing_supply_request_line WHERE request_id IN (${ids.map(() => '?').join(',')}) ORDER BY request_id, id`,
          ids
        );
        for (const ln of lines || []) {
          if (!byReq[ln.request_id]) byReq[ln.request_id] = [];
          const iid = parseInt(ln.inventory_item_id, 10) || 0;
          if (iid > 0) invIds.add(iid);
          byReq[ln.request_id].push(ln);
        }
      }
      const stockNow = new Map();
      if (invIds.size) {
        const idList = [...invIds];
        const [invRows] = await pool
          .query(
            `SELECT id, quantity FROM tbl_inventory_item WHERE id IN (${idList.map(() => '?').join(',')})`,
            idList
          )
          .catch(() => [[]]);
        for (const row of invRows || []) {
          stockNow.set(row.id, parseInt(row.quantity, 10) || 0);
        }
      }
      const requests = list.map((r) => ({
        ...r,
        nurse_name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
        lines: (byReq[r.id] || []).map((ln) => {
          const iid = parseInt(ln.inventory_item_id, 10) || 0;
          const stock_now = iid > 0 && stockNow.has(iid) ? stockNow.get(iid) : null;
          return { ...ln, stock_now };
        }),
      }));
      if (uid > 0) {
        const pendIds = list.filter((r) => r.status === 'pending' && !r.pharmacy_seen_at).map((r) => r.id);
        if (pendIds.length) {
          await pool
            .query(
              `UPDATE tbl_nursing_supply_request
                  SET pharmacy_seen_at = NOW()
                WHERE id IN (${pendIds.map(() => '?').join(',')})`,
              pendIds
            )
            .catch(() => {});
        }
      }
      let nursingSupplyPending = 0;
      try {
        const [[nr]] = await pool.query(
          "SELECT COUNT(*) AS c FROM tbl_nursing_supply_request WHERE status IN ('pending','preparing')"
        );
        nursingSupplyPending = parseInt(nr && nr.c, 10) || 0;
      } catch (_) {
        nursingSupplyPending = 0;
      }
      res.render('pharmacy-nursing-requests', {
        title: 'Nursing requests',
        pharmacyOdooApp: true,
        nursingSupplyPending,
        requests,
        flash: req.query.msg || null,
        error: req.query.err || null,
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/pharmacy/nursing-requests/:id/status', requireAuth, requirePerm('pharmacy.write'), async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    let st = String(req.body.status || '').toLowerCase();
    const allowed = ['pending', 'preparing', 'ready', 'fulfilled', 'dispensed', 'cancelled'];
    if (id < 1 || !allowed.includes(st)) {
      return res.redirect('/pharmacy/nursing-requests?err=' + encodeURIComponent('Invalid request.'));
    }
    try {
      await ensureNursingSupplyRequestSchema(pool);
      if (st === 'dispensed') st = 'fulfilled';
      if (st === 'fulfilled') {
        const { fulfillNursingSupplyRequest } = require('../lib/nursingSupplyDispenseStock');
        const result = await fulfillNursingSupplyRequest(pool, id, userId(req));
        if (!result.ok) {
          return res.redirect('/pharmacy/nursing-requests?err=' + encodeURIComponent(result.error || 'Could not dispense.'));
        }
        const n = (result.deducted || []).length;
        const msg =
          result.alreadyDone
            ? 'Request already dispensed.'
            : n
              ? `Dispensed — stock deducted for ${n} item(s).`
              : 'Request marked as dispensed.';
        return res.redirect('/pharmacy/nursing-requests?msg=' + encodeURIComponent(msg));
      }
      await pool.query(`UPDATE tbl_nursing_supply_request SET status = ? WHERE id = ?`, [st, id]);
      res.redirect('/pharmacy/nursing-requests?msg=' + encodeURIComponent('Status updated.'));
    } catch (e) {
      res.redirect('/pharmacy/nursing-requests?err=' + encodeURIComponent(e.message));
    }
  });
};
