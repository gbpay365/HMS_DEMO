'use strict';

const { allocateUniquePaymentCode, assignServiceCodesForOrderItems } = require('./paymentTicketCode');
const { ensureOpdOrderItemsSchema } = require('./ensureOpdOrderItemsSchema');

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function nextWalkinNo(pool) {
  const prefix = `WLR-${new Date().getFullYear().toString().slice(-2)}`;
  const [[r]] = await pool.query(
    `SELECT registration_no FROM tbl_lab_walkin
     WHERE registration_no LIKE ?
     ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  ).catch(() => [[null]]);
  let seq = 1;
  if (r?.registration_no) {
    const m = String(r.registration_no).match(/(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}-${String(seq).padStart(5, '0')}`;
}

async function listLaboratoryServiceCatalog(pool) {
  const [rows] = await pool.query(
    `SELECT id, name, price, COALESCE(department_name, '') AS department_name
     FROM tbl_service_catalog
     WHERE status = 1 AND LOWER(TRIM(category)) = 'laboratory'
     ORDER BY name
     LIMIT 500`
  ).catch(() => [[]]);
  return rows || [];
}

async function loadServiceCatalogLines(pool, catalogIds) {
  const ids = [...new Set(catalogIds.map((x) => parseInt(x, 10)).filter((n) => n > 0))];
  if (!ids.length) return [];
  const [rows] = await pool.query(
    `SELECT id, name, price FROM tbl_service_catalog
     WHERE id IN (${ids.map(() => '?').join(',')})
       AND status = 1 AND LOWER(TRIM(category)) = 'laboratory'
     ORDER BY name`,
    ids
  );
  return rows || [];
}

async function registerWalkin(pool, body, userId, facilityId = 1) {
  const mobile = String(body.mobile || '').trim();
  const firstName = String(body.first_name || body.name || '').trim();
  const lastName = String(body.last_name || '').trim();
  const rawIds = Array.isArray(body.catalog_id)
    ? body.catalog_id
    : Array.isArray(body.service_catalog_id)
      ? body.service_catalog_id
      : body.catalog_id || body.service_catalog_id
        ? [body.catalog_id || body.service_catalog_id]
        : [];
  if (!mobile || !firstName) return { ok: false, error: 'Mobile and patient name are required' };

  const catRows = await loadServiceCatalogLines(pool, rawIds);
  if (!catRows.length) return { ok: false, error: 'Select at least one laboratory test from the service catalog' };

  const regNo = await nextWalkinNo(pool);
  const total = catRows.reduce((s, c) => s + (parseFloat(c.price || 0) || 0), 0);
  const referrerId = parseInt(body.referrer_id, 10) || null;
  const creditProviderId = parseInt(body.credit_provider_id, 10) || null;
  const priority = body.priority === 'emergency' ? 'emergency' : 'normal';

  const [ins] = await pool.query(
    `INSERT INTO tbl_lab_walkin
     (facility_id, registration_no, first_name, last_name, mobile, referrer_id, credit_provider_id,
      priority, visit_type, notes, status, total_amount, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'pending_payment', ?, ?)`,
    [
      facilityId,
      regNo,
      firstName,
      lastName || '',
      mobile,
      referrerId,
      creditProviderId,
      priority,
      String(body.visit_type || 'OP').slice(0, 8),
      String(body.notes || 'Lab walk-in').trim(),
      total,
      userId || null,
    ]
  );
  const walkinId = ins.insertId;
  let ord = 0;
  for (const c of catRows) {
    await pool.query(
      `INSERT INTO tbl_lab_walkin_line
       (walkin_id, service_catalog_id, test_name, unit_price, quantity, sort_order)
       VALUES (?,?,?,?,1,?)`,
      [walkinId, c.id, c.name, parseFloat(c.price || 0) || 0, ord++]
    );
  }

  return {
    ok: true,
    walkinId,
    registrationNo: regNo,
    redirect: `/cashier?tab=lab_walkin&walkin_id=${walkinId}&msg=${encodeURIComponent('Walk-in registered — collect payment at cashier')}`,
  };
}

async function listPendingWalkins(pool, opts = {}) {
  const limit = Math.min(parseInt(opts.limit, 10) || 100, 200);
  const [rows] = await pool.query(
    `SELECT w.*,
            (SELECT COUNT(*) FROM tbl_lab_walkin_line l WHERE l.walkin_id = w.id) AS line_count,
            (SELECT GROUP_CONCAT(CONCAT(l.test_name, ' (', CAST(ROUND(l.unit_price) AS CHAR), ')') ORDER BY l.sort_order SEPARATOR ', ')
             FROM tbl_lab_walkin_line l WHERE l.walkin_id = w.id) AS tests_summary,
            t.status AS ticket_status, t.ticket_code
     FROM tbl_lab_walkin w
     LEFT JOIN tbl_payment_ticket t ON t.id = w.payment_ticket_id
     WHERE w.status IN ('pending_payment', 'billed')
       AND (t.id IS NULL OR t.status = 'pending')
     ORDER BY w.created_at DESC
     LIMIT ?`,
    [limit]
  ).catch(() => [[]]);
  return rows || [];
}

async function resolveWalkinPatient(conn, walkin) {
  const mobile = String(walkin.mobile || '').trim();
  const [[dup]] = await conn.query(
    'SELECT id FROM tbl_patient WHERE phone=? AND status=1 LIMIT 1',
    [mobile]
  ).catch(() => [[null]]);
  if (dup?.id) return dup.id;

  const [ins] = await conn.query(
    `INSERT INTO tbl_patient (first_name, last_name, phone, status, created_at)
     VALUES (?,?,?,1,NOW())`,
    [walkin.first_name, walkin.last_name || '', mobile]
  );
  return ins.insertId;
}

async function createBillFromWalkin(pool, walkinId, userId, facilityId = 1) {
  const id = parseInt(walkinId, 10) || 0;
  if (id < 1) return { ok: false, error: 'Invalid walk-in id' };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await ensureOpdOrderItemsSchema(conn);

    const [[w]] = await conn.query('SELECT * FROM tbl_lab_walkin WHERE id=? FOR UPDATE', [id]);
    if (!w) throw new Error('Walk-in registration not found');
    if (w.status === 'paid') throw new Error('This walk-in is already paid');
    if (w.payment_ticket_id) {
      const [[tk]] = await conn.query(
        'SELECT id, status FROM tbl_payment_ticket WHERE id=? LIMIT 1',
        [w.payment_ticket_id]
      );
      if (tk && tk.status === 'pending') {
        await conn.commit();
        return { ok: true, ticketId: tk.id, redirect: `/cashier/settle/${tk.id}` };
      }
    }

    const [lines] = await conn.query(
      'SELECT * FROM tbl_lab_walkin_line WHERE walkin_id=? ORDER BY sort_order, id',
      [id]
    );
    if (!lines.length) throw new Error('No tests on this walk-in');

    const patientId = w.patient_id || (await resolveWalkinPatient(conn, w));
    const labCode = await allocateUniquePaymentCode(conn, 'laboratory');
    const orderItemIds = [];
    let total = 0;

    for (const ln of lines) {
      const price = parseFloat(ln.unit_price || 0) || 0;
      total += price;
      const [oiIns] = await conn.query(
        `INSERT INTO tbl_opd_order_item
         (facility_id, patient_id, opd_visit_id, consultation_id, item_type, catalog_id,
          item_name, unit_price, quantity, status, service_code, created_by, created_at)
         VALUES (?,?,NULL,NULL,'laboratory',?,?,?,1,'pending',?,?,NOW())`,
        [facilityId, patientId, ln.service_catalog_id, ln.test_name, price, labCode, userId || null]
      );
      orderItemIds.push(oiIns.insertId);
      await conn.query('UPDATE tbl_lab_walkin_line SET opd_order_item_id=? WHERE id=?', [
        oiIns.insertId,
        ln.id,
      ]);
    }

    await assignServiceCodesForOrderItems(conn, orderItemIds);

    const ticketLines = lines.map((ln, i) => ({
      kind: 'laboratory',
      description: ln.test_name,
      unit_price: parseFloat(ln.unit_price || 0) || 0,
      quantity: 1,
      catalog_id: ln.service_catalog_id,
      source_module: 'opd_order_item',
      source_pk: orderItemIds[i],
    }));

    const [tkIns] = await conn.query(
      `INSERT INTO tbl_payment_ticket
       (facility_id, ticket_code, patient_id, total_amount, status, lines_json, created_by, created_at,
        source_module, source_pk, ticket_category)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, NOW(), 'lab_walkin', ?, 'laboratory')`,
      [
        facilityId,
        labCode,
        patientId,
        total,
        JSON.stringify(ticketLines),
        userId || null,
        id,
      ]
    );

    await conn.query(
      `UPDATE tbl_lab_walkin SET patient_id=?, payment_ticket_id=?, service_code=?, status='billed', total_amount=? WHERE id=?`,
      [patientId, tkIns.insertId, labCode, total, id]
    );

    await conn.commit();
    return { ok: true, ticketId: tkIns.insertId, ticketCode: labCode, redirect: `/cashier/settle/${tkIns.insertId}` };
  } catch (e) {
    await conn.rollback().catch(() => {});
    return { ok: false, error: e.message || 'Could not create bill' };
  } finally {
    conn.release();
  }
}

async function finalizeWalkinAfterCollect(pool, ticket) {
  const walkinId = parseInt(ticket?.source_pk, 10) || 0;
  if (String(ticket?.source_module || '') !== 'lab_walkin' || walkinId < 1) return;

  const [[w]] = await pool.query('SELECT * FROM tbl_lab_walkin WHERE id=? LIMIT 1', [walkinId]).catch(() => [[null]]);
  if (!w || w.status === 'paid') return;

  const labLims = require('./labLims');
  let requestId = w.lab_request_id;
  if (!requestId) {
    const requestNo = await labLims.nextRequestNo(pool);
    const [insReq] = await pool.query(
      `INSERT INTO tbl_lab_request
       (facility_id, request_no, patient_id, referrer_id, credit_provider_id, priority, visit_type,
        scheduled_date, status, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        w.facility_id || 1,
        requestNo,
        w.patient_id,
        w.referrer_id,
        w.credit_provider_id,
        w.priority || 'normal',
        w.visit_type || 'OP',
        todayIso(),
        'submitted',
        `Walk-in ${w.registration_no}`,
        w.created_by,
      ]
    );
    requestId = insReq.insertId;
  }

  const [wLines] = await pool.query(
    'SELECT * FROM tbl_lab_walkin_line WHERE walkin_id=? ORDER BY sort_order, id',
    [walkinId]
  );

  let ord = 0;
  for (const ln of wLines || []) {
    const oiId = parseInt(ln.opd_order_item_id, 10) || 0;
    let lrId = null;
    if (oiId > 0) {
      const [[lr]] = await pool.query(
        'SELECT id FROM tbl_lab_result WHERE opd_order_item_id=? LIMIT 1',
        [oiId]
      );
      lrId = lr?.id || null;
    }
    const [[existingLine]] = await pool.query(
      'SELECT id FROM tbl_lab_request_line WHERE request_id=? AND lab_result_id=? LIMIT 1',
      [requestId, lrId || 0]
    ).catch(() => [[null]]);
    if (existingLine?.id) continue;
    const [[lc]] = await pool.query(
      `SELECT lc.id FROM tbl_lab_catalog lc
       INNER JOIN tbl_service_catalog sc ON sc.code = lc.code
       WHERE sc.id=? LIMIT 1`,
      [ln.service_catalog_id]
    ).catch(() => [[null]]);
    await pool.query(
      `INSERT INTO tbl_lab_request_line
       (request_id, catalog_id, test_name, lab_result_id, line_status, sort_order)
       VALUES (?,?,?,?,'pending',?)`,
      [requestId, lc?.id || null, ln.test_name, lrId, ord++]
    );
  }

  await pool.query(
    `UPDATE tbl_lab_walkin SET status='paid', paid_at=NOW(), lab_request_id=? WHERE id=?`,
    [requestId, walkinId]
  );
}

module.exports = {
  registerWalkin,
  listPendingWalkins,
  listLaboratoryServiceCatalog,
  createBillFromWalkin,
  finalizeWalkinAfterCollect,
  loadServiceCatalogLines,
};
