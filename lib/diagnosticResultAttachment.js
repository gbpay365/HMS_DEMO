/**
 * Attach scanned lab results / radiology images to tbl_lab_result / tbl_radiology_result.
 */
const { publicPathFromDisk } = require('./diagnosticUploadMulter');

function linkNote(kind, resultId) {
  const prefix = kind === 'laboratory' ? 'lab_result' : 'rad_result';
  return `hms_link:${prefix}:${resultId}`;
}

function resultTable(kind) {
  return kind === 'laboratory' ? 'tbl_lab_result' : 'tbl_radiology_result';
}

function docKind(kind, inHouse) {
  if (kind === 'laboratory') return inHouse ? 'lab_attachment_inhouse' : 'lab';
  return inHouse ? 'radiology_image_inhouse' : 'radiology';
}

/**
 * @returns {Promise<{ docId: number, filePath: string, originalName: string|null, mime: string }>}
 */
async function attachFileToResult(pool, opts) {
  const kind = opts.kind === 'radiology' ? 'radiology' : 'laboratory';
  const file = opts.file;
  if (!file || !file.path) throw new Error('No file received.');

  const labResultId = parseInt(String(opts.labResultId || ''), 10) || 0;
  const radiologyResultId = parseInt(String(opts.radiologyResultId || ''), 10) || 0;
  const resultId = kind === 'laboratory' ? labResultId : radiologyResultId;
  const opdOrderItemId = parseInt(String(opts.opdOrderItemId || ''), 10) || 0;

  let patientId = parseInt(String(opts.patientId || ''), 10) || 0;
  let consultationId = opts.consultationId != null ? parseInt(String(opts.consultationId), 10) || null : null;
  let facilityId = Math.max(1, parseInt(String(opts.facilityId || 1), 10) || 1);
  let testName = String(opts.testName || '').trim();
  let doctorId = opts.doctorId != null ? parseInt(String(opts.doctorId), 10) || null : null;

  const tbl = resultTable(kind);
  let row = null;

  if (resultId > 0) {
    const [[r]] = await pool.query(`SELECT * FROM ${tbl} WHERE id = ? LIMIT 1`, [resultId]).catch(() => [[null]]);
    if (!r) throw new Error('Result row not found.');
    row = r;
    patientId = r.patient_id;
    facilityId = r.facility_id || facilityId;
    testName = testName || r.test_name || r.exam_name || 'Diagnostic';
  } else if (opdOrderItemId > 0) {
    const [[oi]] = await pool
      .query(
        `SELECT oi.id, oi.patient_id, oi.item_name, oi.facility_id, oi.consultation_id,
                c.created_by AS consult_doctor_id
           FROM tbl_opd_order_item oi
           LEFT JOIN tbl_consultation c ON c.id = oi.consultation_id
          WHERE oi.id = ? LIMIT 1`,
        [opdOrderItemId]
      )
      .catch(() => [[null]]);
    if (!oi) throw new Error('Order item not found.');
    patientId = oi.patient_id;
    facilityId = oi.facility_id || facilityId;
    consultationId = oi.consultation_id || consultationId;
    testName = testName || oi.item_name || 'Diagnostic';
    doctorId = doctorId || oi.consult_doctor_id || null;
    const [[ex]] = await pool
      .query(`SELECT * FROM ${tbl} WHERE opd_order_item_id = ? LIMIT 1`, [opdOrderItemId])
      .catch(() => [[null]]);
    row = ex || null;
  }

  if (!patientId) throw new Error('Patient is required to attach a file.');

  const uid = opts.userId != null ? parseInt(String(opts.userId), 10) || 0 : 0;
  const relPath = publicPathFromDisk(file.path);
  const resolvedResultId = row ? row.id : resultId;

  const titlePrefix = kind === 'laboratory' ? 'Lab result' : 'Imaging';
  const noteLink = resolvedResultId > 0 ? linkNote(kind, resolvedResultId) : `In-house upload · item #${opdOrderItemId}`;

  const [docIns] = await pool.query(
    `INSERT INTO tbl_patient_external_document
      (facility_id, patient_id, consultation_id, doc_kind, title, notes, file_path, mime, file_size, original_name, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
    [
      facilityId,
      patientId,
      consultationId,
      docKind(kind, true),
      `${titlePrefix} · ${testName}`.slice(0, 255),
      noteLink,
      relPath,
      file.mimetype || 'application/octet-stream',
      file.size || 0,
      file.originalname || null,
      uid,
    ]
  );
  const docId = docIns.insertId;

  if (!row && opdOrderItemId > 0) {
    if (kind === 'laboratory') {
      const [ins] = await pool.query(
        `INSERT INTO tbl_lab_result
           (facility_id, patient_id, test_name, referred_by_id, appointment_date, notes,
            status, created_at, opd_order_item_id, source, external_doc_id)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(), ?, 'in_house', ?)`,
        [
          facilityId,
          patientId,
          testName,
          doctorId,
          new Date().toISOString().slice(0, 10),
          'File attached from template workbench.',
          opdOrderItemId,
          docId,
        ]
      );
      row = { id: ins.insertId };
    } else {
      const [ins] = await pool.query(
        `INSERT INTO tbl_radiology_result
           (facility_id, patient_id, exam_name, modality, body_part, referred_by_id, appointment_date,
            findings, notes, status, created_at, opd_order_item_id, source, external_doc_id)
         VALUES (?, ?, ?, 'X-Ray', '', ?, ?, ?, NULL, 'pending', NOW(), ?, 'in_house', ?)`,
        [
          facilityId,
          patientId,
          testName,
          doctorId,
          new Date().toISOString().slice(0, 10),
          'Image attached from template workbench.',
          opdOrderItemId,
          docId,
        ]
      );
      row = { id: ins.insertId };
    }
    await pool.query(
      `UPDATE tbl_patient_external_document SET notes = ? WHERE id = ?`,
      [linkNote(kind, row.id), docId]
    );
  } else if (row) {
    await pool.query(`UPDATE ${tbl} SET external_doc_id = ?, updated_at = NOW() WHERE id = ?`, [
      docId,
      row.id,
    ]);
    if (resolvedResultId > 0 && noteLink !== linkNote(kind, row.id)) {
      await pool.query(`UPDATE tbl_patient_external_document SET notes = ? WHERE id = ?`, [
        linkNote(kind, row.id),
        docId,
      ]);
    }
  } else if (resultId > 0) {
    await pool.query(`UPDATE ${tbl} SET external_doc_id = ?, updated_at = NOW() WHERE id = ?`, [
      docId,
      resultId,
    ]);
  }

  const finalResultId = row ? row.id : resultId;
  return {
    docId,
    labResultId: kind === 'laboratory' ? finalResultId : undefined,
    radiologyResultId: kind === 'radiology' ? finalResultId : undefined,
    filePath: relPath,
    originalName: file.originalname || null,
    mime: file.mimetype || 'application/octet-stream',
  };
}

async function fetchAttachmentsForResult(pool, kind, resultId) {
  const id = parseInt(String(resultId || ''), 10) || 0;
  if (id < 1) return [];
  const tbl = resultTable(kind);
  const [[res]] = await pool
    .query(`SELECT external_doc_id FROM ${tbl} WHERE id = ? LIMIT 1`, [id])
    .catch(() => [[null]]);
  if (!res) return [];
  const note = linkNote(kind, id);
  const [rows] = await pool
    .query(
      `SELECT id, file_path, original_name, mime, file_size, created_at
         FROM tbl_patient_external_document
        WHERE notes = ? OR id = ?
        ORDER BY id ASC`,
      [note, res.external_doc_id || 0]
    )
    .catch(() => [[]]);
  const seen = new Set();
  return (rows || []).filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

module.exports = {
  attachFileToResult,
  fetchAttachmentsForResult,
  linkNote,
};
