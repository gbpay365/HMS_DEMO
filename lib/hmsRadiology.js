'use strict';

const ensureRadiologySchema = require('./ensureRadiologySchema');

let _radColsCache = null;

async function getRadiologyColumns(pool) {
  if (_radColsCache) return _radColsCache;
  try {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tbl_radiology_result'`
    );
    _radColsCache = new Set(rows.map((r) => r.COLUMN_NAME));
  } catch {
    _radColsCache = new Set();
  }
  return _radColsCache;
}

function radExamExpr(cols, alias) {
  const a = alias || 'rr';
  if (cols.has('exam_name') && cols.has('test_name')) {
    return `COALESCE(${a}.exam_name, ${a}.test_name)`;
  }
  if (cols.has('exam_name')) return `${a}.exam_name`;
  if (cols.has('test_name')) return `${a}.test_name`;
  return "''";
}

async function nextRequestNo(pool) {
  const [[row]] = await pool.query(
    `SELECT request_no FROM tbl_radiology_request ORDER BY id DESC LIMIT 1`
  ).catch(() => [[null]]);
  let n = 1;
  if (row?.request_no) {
    const m = String(row.request_no).match(/(\d+)\s*$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return 'RAD-REQ-' + String(n).padStart(5, '0');
}

async function listRooms(pool, activeOnly) {
  const sql =
    'SELECT * FROM tbl_radiology_room' + (activeOnly ? ' WHERE active=1' : '') + ' ORDER BY name';
  const [rows] = await pool.query(sql).catch(() => [[]]);
  return rows;
}

async function listTestGroups(pool, withLines) {
  const [groups] = await pool
    .query('SELECT * FROM tbl_radiology_test_group ORDER BY name')
    .catch(() => [[]]);
  if (!withLines) return groups;
  const [lines] = await pool
    .query('SELECT * FROM tbl_radiology_test_group_line ORDER BY group_id, sort_order, id')
    .catch(() => [[]]);
  const byG = {};
  for (const ln of lines) {
    if (!byG[ln.group_id]) byG[ln.group_id] = [];
    byG[ln.group_id].push(ln);
  }
  return groups.map((g) => ({ ...g, lines: byG[g.id] || [] }));
}

async function getTestGroupLines(pool, groupId) {
  const [rows] = await pool.query(
    'SELECT * FROM tbl_radiology_test_group_line WHERE group_id=? ORDER BY sort_order, id',
    [groupId]
  );
  return rows;
}

async function saveRoom(pool, body) {
  const id = parseInt(body.id, 10) || 0;
  const code = String(body.code || '').trim().slice(0, 20);
  const name = String(body.name || '').trim().slice(0, 120);
  const modality = String(body.modality || '').trim().slice(0, 40) || null;
  const active = body.active === '0' || body.active === 0 ? 0 : 1;
  const notes = String(body.notes || '').trim().slice(0, 255) || null;
  if (!code || !name) throw new Error('Room code and name are required.');
  if (id) {
    await pool.query(
      'UPDATE tbl_radiology_room SET code=?, name=?, modality=?, active=?, notes=? WHERE id=?',
      [code, name, modality, active, notes, id]
    );
    return id;
  }
  const [r] = await pool.query(
    'INSERT INTO tbl_radiology_room (code, name, modality, active, notes) VALUES (?,?,?,?,?)',
    [code, name, modality, active, notes]
  );
  return r.insertId;
}

async function saveTestGroup(pool, body) {
  const id = parseInt(body.id, 10) || 0;
  const name = String(body.name || '').trim().slice(0, 120);
  const description = String(body.description || '').trim().slice(0, 255) || null;
  const active = body.active === '0' || body.active === 0 ? 0 : 1;
  if (!name) throw new Error('Test group name is required.');
  let groupId = id;
  if (id) {
    await pool.query(
      'UPDATE tbl_radiology_test_group SET name=?, description=?, active=? WHERE id=?',
      [name, description, active, id]
    );
    await pool.query('DELETE FROM tbl_radiology_test_group_line WHERE group_id=?', [id]);
  } else {
    const [r] = await pool.query(
      'INSERT INTO tbl_radiology_test_group (name, description, active) VALUES (?,?,?)',
      [name, description, active]
    );
    groupId = r.insertId;
  }
  const exams = []
    .concat(body.exam_name || [])
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  const modalities = [].concat(body.line_modality || []);
  const parts = [].concat(body.line_body_part || []);
  for (let i = 0; i < exams.length; i++) {
    await pool.query(
      `INSERT INTO tbl_radiology_test_group_line (group_id, exam_name, modality, body_part, sort_order)
       VALUES (?,?,?,?,?)`,
      [
        groupId,
        exams[i],
        String(modalities[i] || '').trim().slice(0, 40) || null,
        String(parts[i] || '').trim().slice(0, 80) || null,
        i,
      ]
    );
  }
  return groupId;
}

async function insertResultLine(pool, cols, vals) {
  const fields = [];
  const placeholders = [];
  const params = [];
  const push = (col, val) => {
    if (!cols.has(col)) return;
    fields.push(col);
    placeholders.push('?');
    params.push(val);
  };
  for (const [col, val] of Object.entries(vals)) push(col, val);
  if (!fields.length) throw new Error('No writable radiology result columns.');
  const [r] = await pool.query(
    `INSERT INTO tbl_radiology_result (${fields.join(',')}) VALUES (${placeholders.join(',')})`,
    params
  );
  return r.insertId;
}

async function createRequest(pool, data, userId) {
  const cols = await getRadiologyColumns(pool);
  const patientId = parseInt(data.patient_id, 10) || 0;
  if (!patientId) throw new Error('Patient is required.');
  const submitNow = data.submit === '1' || data.submit === true || data.action === 'submit';
  const requestNo = await nextRequestNo(pool);
  const scheduledAt = data.scheduled_at
    ? String(data.scheduled_at).replace('T', ' ').slice(0, 19)
    : null;
  const referredBy = parseInt(data.referred_by_id, 10) || null;
  const roomId = parseInt(data.room_id, 10) || null;
  const testGroupId = parseInt(data.test_group_id, 10) || null;
  const isGroup = data.is_group_request === '1' || data.is_group_request === true ? 1 : 0;
  let groupPatients = null;
  if (isGroup && data.group_patient_ids) {
    const ids = []
      .concat(data.group_patient_ids)
      .map((x) => parseInt(x, 10))
      .filter((x) => x > 0);
    if (ids.length) groupPatients = JSON.stringify(ids);
  }
  const notes = String(data.notes || '').trim() || null;
  const status = submitNow ? 'submitted' : 'draft';

  const [ins] = await pool.query(
    `INSERT INTO tbl_radiology_request
     (request_no, patient_id, status, scheduled_at, referred_by_id, room_id, test_group_id,
      is_group_request, group_patient_ids, notes, created_by, submitted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      requestNo,
      patientId,
      status,
      scheduledAt,
      referredBy,
      roomId,
      testGroupId || null,
      isGroup,
      groupPatients,
      notes,
      userId || null,
      submitNow ? new Date() : null,
    ]
  );
  const requestId = ins.insertId;

  let exams = []
    .concat(data.exam_name || [])
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  const modalities = [].concat(data.line_modality || []);
  const bodyParts = [].concat(data.line_body_part || []);
  const catalogIds = [].concat(data.service_catalog_id || []);

  if (!exams.length && testGroupId) {
    const gl = await getTestGroupLines(pool, testGroupId);
    exams = gl.map((l) => l.exam_name);
    for (const l of gl) {
      modalities.push(l.modality || '');
      bodyParts.push(l.body_part || '');
      catalogIds.push(l.service_catalog_id || '');
    }
  }

  if (!exams.length) throw new Error('Add at least one imaging exam to the request.');

  const apptDate = scheduledAt
    ? scheduledAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  for (let i = 0; i < exams.length; i++) {
    const lineVals = {
      patient_id: patientId,
      request_id: requestId,
      referred_by_id: referredBy,
      room_id: roomId,
      scheduled_at: scheduledAt,
      appointment_date: apptDate,
      notes,
      status: submitNow ? 'pending' : 'pending',
      line_sort: i,
      created_by: userId || null,
    };
    const exam = exams[i];
    if (cols.has('exam_name')) lineVals.exam_name = exam;
    else if (cols.has('test_name')) lineVals.test_name = exam;
    if (cols.has('modality')) lineVals.modality = String(modalities[i] || 'X-Ray').trim() || 'X-Ray';
    if (cols.has('body_part')) lineVals.body_part = String(bodyParts[i] || '').trim() || null;
    await insertResultLine(pool, cols, lineVals);
  }

  if (submitNow) {
    await pool.query(
      `UPDATE tbl_radiology_request SET status='submitted', submitted_at=NOW() WHERE id=?`,
      [requestId]
    );
  }

  return { id: requestId, requestNo };
}

async function getRequest(pool, id) {
  const rid = parseInt(id, 10) || 0;
  if (!rid) return null;
  const [[req]] = await pool.query(
    `SELECT rq.*,
            p.first_name AS p_fn, p.last_name AS p_ln,
            e.first_name AS ref_fn, e.last_name AS ref_ln,
            rm.name AS room_name, rm.code AS room_code,
            tg.name AS group_name
     FROM tbl_radiology_request rq
     JOIN tbl_patient p ON p.id = rq.patient_id
     LEFT JOIN tbl_employee e ON e.id = rq.referred_by_id
     LEFT JOIN tbl_radiology_room rm ON rm.id = rq.room_id
     LEFT JOIN tbl_radiology_test_group tg ON tg.id = rq.test_group_id
     WHERE rq.id = ? LIMIT 1`,
    [rid]
  ).catch(() => [[null]]);
  if (!req) return null;
  const cols = await getRadiologyColumns(pool);
  const examCol = radExamExpr(cols, 'rr') + ' AS exam_name';
  const [lines] = await pool.query(
    `SELECT rr.*, ${examCol}
     FROM tbl_radiology_result rr
     WHERE rr.request_id = ?
     ORDER BY rr.line_sort, rr.id`,
    [rid]
  ).catch(() => [[]]);
  return { request: req, lines };
}

async function listWorklist(pool, opts) {
  const filter = String(opts.filter || 'all');
  const status = String(opts.status || '').trim();
  const q = String(opts.q || '').trim();
  const includeLegacy = opts.legacy !== '0';

  const params = [];
  let where = '1=1';
  if (filter === 'today') {
    where += " AND (DATE(COALESCE(rq.scheduled_at, rq.created_at)) = CURDATE() OR rq.status IN ('submitted','draft','in_progress'))";
  }
  if (status) {
    where += ' AND rq.status = ?';
    params.push(status);
  }
  if (q) {
    where += ' AND (rq.request_no LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ?)';
    const like = '%' + q + '%';
    params.push(like, like, like);
  }

  const [requests] = await pool
    .query(
      `SELECT rq.id, rq.request_no, rq.patient_id, rq.status, rq.scheduled_at, rq.created_at,
              rq.is_group_request, rq.invoice_ref,
              p.first_name AS p_fn, p.last_name AS p_ln,
              e.first_name AS ref_fn, e.last_name AS ref_ln,
              rm.name AS room_name,
              (SELECT COUNT(*) FROM tbl_radiology_result rr WHERE rr.request_id = rq.id) AS line_count,
              (SELECT COUNT(*) FROM tbl_radiology_result rr WHERE rr.request_id = rq.id AND rr.status='received') AS done_count,
              'request' AS row_kind
       FROM tbl_radiology_request rq
       JOIN tbl_patient p ON p.id = rq.patient_id
       LEFT JOIN tbl_employee e ON e.id = rq.referred_by_id
       LEFT JOIN tbl_radiology_room rm ON rm.id = rq.room_id
       WHERE ${where}
       ORDER BY COALESCE(rq.scheduled_at, rq.created_at) DESC, rq.id DESC
       LIMIT 200`,
      params
    )
    .catch(() => [[]]);

  let legacy = [];
  if (includeLegacy) {
    const cols = await getRadiologyColumns(pool);
    const examCol = radExamExpr(cols, 'rr');
    const lp = [];
    let lw = 'rr.request_id IS NULL';
    if (filter === 'today') {
      lw += " AND (DATE(COALESCE(rr.scheduled_at, rr.appointment_date, rr.created_at)) = CURDATE() OR rr.status IN ('pending','in_progress'))";
    }
    if (status === 'submitted' || status === 'pending') lw += " AND rr.status='pending'";
    else if (status === 'accepted' || status === 'in_progress') lw += " AND rr.status='in_progress'";
    else if (status === 'done' || status === 'received') lw += " AND rr.status='received'";
    if (q) {
      lw += ' AND (p.first_name LIKE ? OR p.last_name LIKE ?)';
      const like = '%' + q + '%';
      lp.push(like, like);
    }
    const [lr] = await pool
      .query(
        `SELECT rr.id, CONCAT('RAD-', LPAD(rr.id, 5, '0')) AS request_no, rr.patient_id,
                CASE
                  WHEN COALESCE(rr.revision_pending,0)=1 THEN 'revision'
                  WHEN rr.status='received' THEN 'done'
                  WHEN rr.status='in_progress' THEN 'in_progress'
                  ELSE 'submitted'
                END AS status,
                COALESCE(rr.scheduled_at, CONCAT(rr.appointment_date, ' 00:00:00')) AS scheduled_at,
                rr.created_at, 0 AS is_group_request, NULL AS invoice_ref,
                p.first_name AS p_fn, p.last_name AS p_ln,
                e.first_name AS ref_fn, e.last_name AS ref_ln,
                NULL AS room_name, 1 AS line_count,
                IF(rr.status='received',1,0) AS done_count,
                'legacy' AS row_kind, ${examCol} AS legacy_exam
         FROM tbl_radiology_result rr
         JOIN tbl_patient p ON p.id = rr.patient_id
         LEFT JOIN tbl_employee e ON e.id = rr.referred_by_id
         WHERE ${lw}
         ORDER BY rr.id DESC LIMIT 100`,
        lp
      )
      .catch(() => [[]]);
    legacy = lr;
  }

  const orderParams = [];
  let orderWhere = "oi.item_type='radiology'";
  if (filter === 'today') {
    orderWhere += " AND (DATE(COALESCE(oi.paid_at, oi.created_at)) = CURDATE() OR oi.status IN ('pending','paid') OR rr.status IN ('pending','in_progress'))";
  }
  if (status) {
    if (status === 'submitted' || status === 'pending') orderWhere += " AND oi.status IN ('pending','paid')";
    else if (status === 'done' || status === 'received') orderWhere += " AND rr.status='received'";
    else if (status === 'accepted' || status === 'in_progress') orderWhere += " AND rr.status='in_progress'";
    else orderWhere += ' AND 1=0';
  }
  if (q) {
    orderWhere += ' AND (p.first_name LIKE ? OR p.last_name LIKE ? OR oi.item_name LIKE ? OR oi.service_code LIKE ?)';
    const like = '%' + q + '%';
    orderParams.push(like, like, like, like);
  }
  const [opdOrders] = await pool
    .query(
      `SELECT oi.id,
              COALESCE(oi.service_code, CONCAT('RAD-ORDER-', LPAD(oi.id, 5, '0'))) AS request_no,
              oi.patient_id,
              CASE
                WHEN COALESCE(rr.revision_pending,0)=1 THEN 'revision'
                WHEN rr.status='received' THEN 'done'
                WHEN rr.status='in_progress' THEN 'in_progress'
                WHEN rr.status='pending' THEN 'submitted'
                WHEN oi.status='paid' OR oi.status='served' THEN 'submitted'
                ELSE 'awaiting_payment'
              END AS status,
              COALESCE(oi.paid_at, oi.created_at) AS scheduled_at,
              oi.created_at,
              0 AS is_group_request,
              NULL AS invoice_ref,
              p.first_name AS p_fn,
              p.last_name AS p_ln,
              e.first_name AS ref_fn,
              e.last_name AS ref_ln,
              NULL AS room_name,
              1 AS line_count,
              IF(rr.status='received',1,0) AS done_count,
              'opd_order' AS row_kind,
              oi.item_name AS legacy_exam,
              oi.status AS order_status,
              rr.id AS radiology_result_id,
              oi.service_code,
              COALESCE(rr.revision_pending,0) AS revision_pending
         FROM tbl_opd_order_item oi
         JOIN tbl_patient p ON p.id = oi.patient_id
         LEFT JOIN tbl_consultation c ON c.id = oi.consultation_id
         LEFT JOIN tbl_employee e ON e.id = COALESCE(c.created_by, oi.created_by)
         LEFT JOIN tbl_radiology_result rr ON rr.opd_order_item_id = oi.id
        WHERE ${orderWhere}
        ORDER BY COALESCE(oi.paid_at, oi.created_at) DESC, oi.id DESC
        LIMIT 100`,
      orderParams
    )
    .catch(() => [[]]);

  return { requests, legacy: [...legacy, ...(opdOrders || [])] };
}

async function submitRequest(pool, id) {
  const rid = parseInt(id, 10) || 0;
  const [[req]] = await pool.query('SELECT status FROM tbl_radiology_request WHERE id=?', [rid]);
  if (!req) throw new Error('Request not found.');
  if (!['draft', 'submitted'].includes(req.status)) throw new Error('Request cannot be submitted.');
  await pool.query(
    `UPDATE tbl_radiology_request SET status='submitted', submitted_at=NOW() WHERE id=?`,
    [rid]
  );
  await pool.query(
    `UPDATE tbl_radiology_result SET status='pending' WHERE request_id=? AND (status IS NULL OR status='')`,
    [rid]
  ).catch(() => {});
  return true;
}

async function acceptRequest(pool, id) {
  const rid = parseInt(id, 10) || 0;
  const [[req]] = await pool.query('SELECT status FROM tbl_radiology_request WHERE id=?', [rid]);
  if (!req) throw new Error('Request not found.');
  if (!['submitted', 'draft'].includes(req.status)) throw new Error('Only submitted requests can be accepted.');
  await pool.query(
    `UPDATE tbl_radiology_request SET status='in_progress', accepted_at=NOW() WHERE id=?`,
    [rid]
  );
  await pool.query(
    `UPDATE tbl_radiology_result SET status='in_progress' WHERE request_id=? AND status='pending'`,
    [rid]
  );
  return true;
}

async function syncRequestStatus(pool, requestId) {
  const [[c]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(status='received') AS done
     FROM tbl_radiology_result WHERE request_id=?`,
    [requestId]
  );
  const total = Number(c?.total || 0);
  const done = Number(c?.done || 0);
  if (total > 0 && done >= total) {
    await pool.query(
      `UPDATE tbl_radiology_request SET status='done', completed_at=NOW() WHERE id=?`,
      [requestId]
    );
  }
}

async function listConsolidatedResults(pool, opts) {
  const cols = await getRadiologyColumns(pool);
  const examCol = radExamExpr(cols, 'rr') + ' AS exam_name';
  const q = String(opts.q || '').trim();
  const params = [];
  let where = "rr.status='received'";
  if (q) {
    const like = '%' + q + '%';
    if (cols.has('exam_name') || cols.has('test_name')) {
      const ex = cols.has('exam_name') ? 'rr.exam_name' : 'rr.test_name';
      const ex2 = cols.has('test_name') && cols.has('exam_name') ? 'COALESCE(rr.exam_name, rr.test_name)' : ex;
      where += ` AND (p.first_name LIKE ? OR p.last_name LIKE ? OR ${ex2} LIKE ?)`;
      params.push(like, like, like);
    } else {
      where += ' AND (p.first_name LIKE ? OR p.last_name LIKE ?)';
      params.push(like, like);
    }
  }
  const [rows] = await pool.query(
    `SELECT rr.*, ${examCol},
            p.first_name AS p_fn, p.last_name AS p_ln,
            rq.request_no,
            e.first_name AS ref_fn, e.last_name AS ref_ln
     FROM tbl_radiology_result rr
     JOIN tbl_patient p ON p.id = rr.patient_id
     LEFT JOIN tbl_radiology_request rq ON rq.id = rr.request_id
     LEFT JOIN tbl_employee e ON e.id = rr.referred_by_id
     WHERE ${where}
     ORDER BY rr.updated_at DESC, rr.id DESC
     LIMIT 300`,
    params
  ).catch(() => [[]]);
  return rows;
}

async function listRegistryResults(pool, opts = {}) {
  const cols = await getRadiologyColumns(pool);
  const examCol = radExamExpr(cols, 'rr');
  const limit = Math.min(5000, Math.max(1, parseInt(String(opts.limit || 2500), 10) || 2500));
  const [rows] = await pool
    .query(
      `SELECT rr.id, rr.id AS radiology_result_id, rr.patient_id, rr.status,
              COALESCE(rr.revision_pending, 0) AS revision_pending,
              ${examCol} AS exam_name,
              rr.appointment_date, rr.scheduled_at, rr.created_at, rr.updated_at,
              p.first_name AS p_fn, p.last_name AS p_ln,
              e.first_name AS ref_fn, e.last_name AS ref_ln,
              oi_ref.first_name AS oi_ref_fn, oi_ref.last_name AS oi_ref_ln,
              oi.service_code, rq.request_no
         FROM tbl_radiology_result rr
         JOIN tbl_patient p ON p.id = rr.patient_id
         LEFT JOIN tbl_employee e ON e.id = rr.referred_by_id
         LEFT JOIN tbl_opd_order_item oi ON oi.id = rr.opd_order_item_id
         LEFT JOIN tbl_consultation cons ON cons.id = oi.consultation_id
         LEFT JOIN tbl_employee oi_ref ON oi_ref.id = cons.created_by
         LEFT JOIN tbl_radiology_request rq ON rq.id = rr.request_id
        ORDER BY rr.id DESC
        LIMIT ?`,
      [limit]
    )
    .catch(() => [[]]);
  return rows || [];
}

async function worklistStats(pool) {
  const [[today]] = await pool.query(
    `SELECT SUM(c) AS c
       FROM (
        SELECT COUNT(*) AS c FROM tbl_radiology_request
         WHERE (DATE(COALESCE(scheduled_at, created_at)) = CURDATE() OR status IN ('submitted','draft','in_progress'))
           AND status NOT IN ('done','cancelled')
        UNION ALL
        SELECT COUNT(*) AS c FROM tbl_radiology_result
         WHERE request_id IS NULL
           AND (DATE(COALESCE(scheduled_at, appointment_date, created_at)) = CURDATE() OR status IN ('pending','in_progress'))
           AND status <> 'received'
       ) x`
  ).catch(() => [[{ c: 0 }]]);
  const [[pending]] = await pool.query(
    `SELECT SUM(c) AS c
       FROM (
        SELECT COUNT(*) AS c FROM tbl_radiology_request WHERE status IN ('submitted','draft')
        UNION ALL
        SELECT COUNT(*) AS c FROM tbl_radiology_result WHERE request_id IS NULL AND status='pending'
       ) x`
  ).catch(() => [[{ c: 0 }]]);
  const [[prog]] = await pool.query(
    `SELECT SUM(c) AS c
       FROM (
        SELECT COUNT(*) AS c FROM tbl_radiology_request WHERE status='in_progress'
        UNION ALL
        SELECT COUNT(*) AS c FROM tbl_radiology_result WHERE request_id IS NULL AND status='in_progress'
       ) x`
  ).catch(() => [[{ c: 0 }]]);
  return {
    today_open: Number(today?.c || 0),
    pending_submit: Number(pending?.c || 0),
    in_progress: Number(prog?.c || 0),
  };
}

function statusLabel(st) {
  const m = {
    draft: 'Draft',
    submitted: 'Submitted',
    accepted: 'Accepted',
    in_progress: 'In progress',
    done: 'Done',
    cancelled: 'Cancelled',
  };
  return m[st] || st;
}

function statusVariant(st) {
  if (st === 'done') return 'success';
  if (st === 'in_progress' || st === 'accepted') return 'info';
  if (st === 'submitted') return 'warning';
  if (st === 'cancelled') return 'danger';
  return 'secondary';
}

module.exports = {
  ensureRadiologySchema,
  getRadiologyColumns,
  radExamExpr,
  listRooms,
  listTestGroups,
  getTestGroupLines,
  saveRoom,
  saveTestGroup,
  createRequest,
  getRequest,
  listWorklist,
  submitRequest,
  acceptRequest,
  syncRequestStatus,
  listConsolidatedResults,
  listRegistryResults,
  worklistStats,
  statusLabel,
  statusVariant,
};
