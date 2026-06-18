'use strict';

async function nextRequestNo(db) {
  const y = new Date().getFullYear();
  const prefix = `LR-${y}-`;
  const [[row]] = await db.query(
    `SELECT request_no FROM tbl_lab_request WHERE request_no LIKE ? ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  ).catch(() => [[null]]);
  let n = 1;
  if (row && row.request_no) {
    const m = String(row.request_no).match(/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return prefix + String(n).padStart(5, '0');
}

async function createLabResultForLine(db, opts) {
  const {
    facilityId,
    patientId,
    testName,
    referredById,
    appointmentDate,
    notes,
    createdBy,
  } = opts;
  const [ins] = await db.query(
    `INSERT INTO tbl_lab_result
     (facility_id, patient_id, test_name, referred_by_id, appointment_date, notes, status, source, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 'lims_request', ?, NOW())`,
    [
      facilityId || 1,
      patientId,
      testName,
      referredById || null,
      appointmentDate,
      notes || null,
      createdBy || null,
    ]
  );
  return ins.insertId;
}

async function loadRequestDetail(pool, requestId) {
  const [[req]] = await pool.query(
    `SELECT r.*, p.first_name, p.last_name, p.phone,
            doc.first_name AS doc_fn, doc.last_name AS doc_ln,
            cc.name AS collection_center_name,
            tg.name AS test_group_name
     FROM tbl_lab_request r
     JOIN tbl_patient p ON p.id = r.patient_id
     LEFT JOIN tbl_employee doc ON doc.id = r.prescribing_doctor_id
     LEFT JOIN tbl_lab_collection_center cc ON cc.id = r.collection_center_id
     LEFT JOIN tbl_lab_test_group tg ON tg.id = r.test_group_id
     WHERE r.id = ? LIMIT 1`,
    [requestId]
  );
  if (!req) return null;

  const [lines] = await pool.query(
    `SELECT l.*, lr.status AS result_status, lr.id AS lr_id
     FROM tbl_lab_request_line l
     LEFT JOIN tbl_lab_result lr ON lr.id = l.lab_result_id
     WHERE l.request_id = ?
     ORDER BY l.sort_order, l.id`,
    [requestId]
  );

  const [samples] = await pool.query(
    `SELECT s.*, st.name AS sample_type_name
     FROM tbl_lab_sample s
     LEFT JOIN tbl_lab_sample_type st ON st.id = s.sample_type_id
     WHERE s.request_id = ?
     ORDER BY s.id`,
    [requestId]
  );

  return { req, lines: lines || [], samples: samples || [] };
}

async function getGroupLines(db, groupId) {
  if (!groupId) return [];
  const [rows] = await db.query(
    `SELECT catalog_id, test_name, template_test_id, sort_order
     FROM tbl_lab_test_group_line WHERE group_id=? ORDER BY sort_order, id`,
    [groupId]
  );
  return rows || [];
}

module.exports = {
  nextRequestNo,
  createLabResultForLine,
  loadRequestDetail,
  getGroupLines,
};
