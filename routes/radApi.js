/**
 * Radiology test templates API (rad technicians + workbench).
 * Mount: app.use('/api/rad', requireAuth, requirePerm(...), require('./routes/labApi')(pool))
 */

const express = require('express');
const {
  RAD_TEST_TEMPLATES,
  getAllTests,
  getTestById,
  getTestsByCategory,
  getCategories,
  suggestTemplateForOrderName,
  generateReportObject
} = require('../lib/radTestTemplates');
const ensureFacilityRow = require('../lib/ensureFacilityRow');
const { ensureDiagnosticCorrectionSchema, insertDiagnosticCorrectionAudit } = require('../lib/ensureDiagnosticCorrectionSchema');
const { authorizeServiceCodeValidate } = require('../lib/authorizeLabTest');
const { isPaymentCodeFormat } = require('../lib/paymentTicketCode');
const {
  assertDiagnosticWorkbenchAccess,
  workbenchParamsFromQuery,
} = require('../lib/diagnosticWorkbenchGate');
const { externalUploadArrayMw } = require('../lib/diagnosticUploadMulter');
const { attachFileToResult, fetchAttachmentsForResult } = require('../lib/diagnosticResultAttachment');
const {
  mergeTemplateBundle,
  mergeTemplateFields,
  loadOverrides,
  saveOverrides,
  refsForEditUi,
} = require('../lib/diagnosticTemplateRefs');
const { extractTextFromBuffer } = require('../lib/diagnosticOcrExtract');
const { mapToTemplateFields } = require('../lib/diagnosticOcrMap');

function parsePatientId(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Compute age string like "34y" from a DOB value (Date object or ISO string). */
function computeAge(dob) {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age + 'y' : '';
}

const { patientDisplayAgeYears, isAgeOnlyPatient } = require('../lib/patientAge');

/** Age label for API payloads (respects age-only registration). */
function computeAgeFromPatientRow(row) {
  if (!row) return '';
  const yrs = patientDisplayAgeYears(row);
  if (yrs == null) return '';
  if (isAgeOnlyPatient(row)) return yrs + 'y';
  const fromDob = computeAge(row.dob);
  if (fromDob) return fromDob;
  return yrs + 'y';
}

/**
 * Fetch a single patient row, trying COALESCE(dob, date_of_birth) so the
 * result always comes back as `dob` regardless of which column the schema uses.
 */
async function fetchPatientRow(pool, patientId) {
  try {
    const [[row]] = await pool.query(
      `SELECT id, first_name, last_name,
              COALESCE(dob, date_of_birth) AS dob,
              gender, age_years
         FROM tbl_patient WHERE id = ? LIMIT 1`,
      [patientId]
    );
    return row || null;
  } catch (_) {
    try {
      const [[row2]] = await pool.query(
        `SELECT id, first_name, last_name,
                COALESCE(dob, date_of_birth) AS dob,
                gender
           FROM tbl_patient WHERE id = ? LIMIT 1`,
        [patientId]
      );
      return row2 || null;
    } catch (_) {
      const [[row3]] = await pool
        .query('SELECT id, first_name, last_name, dob, gender FROM tbl_patient WHERE id = ? LIMIT 1', [patientId])
        .catch(() => [[null]]);
      return row3 || null;
    }
  }
}

function formatFindingsFromReport(rep) {
  const lines = [];
  lines.push('[' + rep.testName + ']  Template: ' + rep.testId);
  if (rep.patientInfo) {
    const p = rep.patientInfo;
    lines.push('Patient: ' + (p.name || '') + '  (ID ' + (p.id || '—') + ')  ' + (p.ageSex || '') + '  Ref: ' + (p.doctor || '—'));
  }
  for (const row of rep.results || []) {
    lines.push('• ' + row.label + ': ' + row.value);
  }
  if (rep.conclusion) lines.push('Impression: ' + rep.conclusion);
  lines.push('Recorded (radiology template workbench) at ' + (rep.generatedAt || new Date().toISOString()));
  return lines.join('\n');
}

async function radResultColumns(pool) {
  const [rows] = await pool
    .query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_radiology_result'`
    )
    .catch(() => [[]]);
  return new Set((rows || []).map((r) => r.COLUMN_NAME));
}

function buildRadInsertRow(cols, row) {
  const keys = [];
  const vals = [];
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (!cols.has(k)) continue;
    keys.push(k);
    vals.push(v);
  }
  return { keys, vals };
}

function structuredJsonColumn(cols) {
  if (cols.has('structured_result')) return 'structured_result';
  if (cols.has('result_template_json')) return 'result_template_json';
  return null;
}

function applyRadReportFields(cols, report, notesText, conclusionDb, structuredJson, templateIdVal, target) {
  const structCol = structuredJsonColumn(cols);
  if (structCol && structuredJson) target[structCol] = structuredJson;
  if (cols.has('template_test_id') && templateIdVal != null) target.template_test_id = templateIdVal;
  if (cols.has('exam_name')) target.exam_name = report.testName;
  else if (cols.has('test_name')) target.test_name = report.testName;
  if (cols.has('modality') && report.category) target.modality = String(report.category).slice(0, 50);
  if (cols.has('body_part') && target.body_part === undefined) target.body_part = '';
  if (cols.has('findings')) target.findings = notesText;
  if (cols.has('notes')) target.notes = notesText;
  if (cols.has('conclusion_code')) target.conclusion_code = conclusionDb || null;
}

function radFindingsSelect(cols) {
  if (cols.has('findings')) return 'findings';
  if (cols.has('notes')) return 'notes';
  return null;
}

function radGateOpts(req, extra) {
  const base = workbenchParamsFromQuery(req.query, 'radiology');
  if (extra && typeof extra === 'object') Object.assign(base, extra);
  base.facilityId = Math.max(1, parseInt(String(req.session?.facilityId || 1), 10) || 1);
  return base;
}

async function enforceRadWorkbenchGate(pool, req, res, extra) {
  const gate = await assertDiagnosticWorkbenchAccess(pool, radGateOpts(req, extra));
  if (!gate.ok) {
    res.status(403).json({
      success: false,
      message: gate.error,
      code: gate.code,
      requireValidation: !!gate.requireValidation,
    });
    return null;
  }
  return gate;
}

/** Pick the best radiology order line for a shared RAD- service code. */
async function resolveRadOrderItemForCode(pool, code, preferredOi) {
  const c = String(code || '').trim().toUpperCase();
  const pref = parseInt(String(preferredOi || ''), 10) || 0;
  if (!c || !c.startsWith('RAD-')) return null;

  if (pref > 0) {
    const [[row]] = await pool
      .query(
        `SELECT id, item_name, status, patient_id, service_code
           FROM tbl_opd_order_item
          WHERE id = ? AND item_type = 'radiology' LIMIT 1`,
        [pref]
      )
      .catch(() => [[null]]);
    if (row && String(row.service_code || '').trim().toUpperCase() === c) return row;
  }

  const [rows] = await pool
    .query(
      `SELECT id, item_name, status, patient_id, service_code
         FROM tbl_opd_order_item
        WHERE service_code = ? AND item_type = 'radiology'
        ORDER BY FIELD(status,'paid','pending','served'), id ASC`,
      [c]
    )
    .catch(() => [[]]);
  return rows && rows[0] ? rows[0] : null;
}

module.exports = function createRadApi(pool) {
  const router = express.Router();

  if (!pool) {
    router.use((req, res) => {
      res.status(503).json({ success: false, message: 'Database unavailable' });
    });
    return router;
  }

  router.get('/workbench-access', async (req, res) => {
    try {
      const opts = radGateOpts(req);
      const gate = await assertDiagnosticWorkbenchAccess(pool, opts);
      if (gate.ok) {
        return res.json({
          success: true,
          access: true,
          bypass: !!gate.bypass,
          reason: gate.reason || null,
        });
      }
      return res.json({
        success: true,
        access: false,
        requireValidation: true,
        message: gate.error,
        prefillCode: opts.code || '',
      });
    } catch (e) {
      console.error('rad workbench-access:', e);
      res.status(500).json({ success: false, message: e.message || 'Access check failed' });
    }
  });

  router.get('/validate-code', async (req, res) => {
    try {
      const code = String(req.query.code || '').trim().toUpperCase();
      if (!code) {
        return res.status(400).json({ success: false, message: 'Enter a RAD service code from the patient ticket.' });
      }
      if (!isPaymentCodeFormat(code, 'RAD')) {
        return res.status(400).json({ success: false, message: 'Format: RAD-####-XXXXXXXX (e.g. RAD-1038-X2TN8W4P).' });
      }
      const fid = Math.max(1, parseInt(String(req.session.facilityId || 1), 10) || 1);
      const auth = await authorizeServiceCodeValidate(pool, code, fid);
      if (!auth.ok) {
        return res.status(400).json({
          success: false,
          message: auth.error || 'Code not valid for radiology work.',
          code: auth.code || null,
        });
      }
      return res.json({
        success: true,
        code,
        redirectUrl: '/radiology/validate/' + encodeURIComponent(code),
      });
    } catch (e) {
      console.error('rad validate-code:', e);
      res.status(500).json({ success: false, message: e.message || 'Validation failed' });
    }
  });

  router.get('/bundle', async (req, res) => {
    try {
      const fid = Math.max(1, parseInt(String(req.session.facilityId || 1), 10) || 1);
      const overrides = await loadOverrides(pool, fid, 'radiology');
      const data = mergeTemplateBundle(RAD_TEST_TEMPLATES, overrides);
      res.json({ success: true, data });
    } catch (e) {
      console.error('rad bundle:', e);
      res.json({ success: true, data: RAD_TEST_TEMPLATES });
    }
  });

  router.get('/categories', (req, res) => {
    res.json({ success: true, data: getCategories() });
  });

  router.get('/tests', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    let tests = getAllTests();
    if (q) {
      tests = tests.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.categoryLabel.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q)
      );
    }
    res.json({ success: true, total: tests.length, data: tests });
  });

  router.get('/tests/category/:categoryKey', (req, res) => {
    const tests = getTestsByCategory(req.params.categoryKey);
    if (!tests.length) {
      return res.status(404).json({ success: false, message: 'Category not found or empty' });
    }
    res.json({ success: true, data: tests });
  });

  router.get('/template/:testId', async (req, res) => {
    const template = getTestById(req.params.testId);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Test template not found' });
    }
    try {
      const fid = Math.max(1, parseInt(String(req.session.facilityId || 1), 10) || 1);
      const overrides = await loadOverrides(pool, fid, 'radiology', template.id);
      res.json({ success: true, data: mergeTemplateFields(template, overrides) });
    } catch (e) {
      res.json({ success: true, data: template });
    }
  });

  router.get('/template/:testId/refs', async (req, res) => {
    try {
      const template = getTestById(req.params.testId);
      if (!template) {
        return res.status(404).json({ success: false, message: 'Test template not found' });
      }
      const fid = Math.max(1, parseInt(String(req.session.facilityId || 1), 10) || 1);
      const overrides = await loadOverrides(pool, fid, 'radiology', template.id);
      res.json({
        success: true,
        data: {
          templateKey: template.id,
          templateName: template.name,
          fields: refsForEditUi(template, overrides),
        },
      });
    } catch (e) {
      console.error('rad template refs get:', e);
      res.status(500).json({ success: false, message: e.message || 'Server error' });
    }
  });

  router.put('/template/:testId/refs', async (req, res) => {
    try {
      const perms = req.session?.perms || [];
      const canWrite =
        perms.includes('*') || perms.some((p) => /radiology\.write/.test(String(p)));
      if (!canWrite) {
        return res.status(403).json({ success: false, message: 'Radiology write permission required.' });
      }
      const template = getTestById(req.params.testId);
      if (!template) {
        return res.status(404).json({ success: false, message: 'Test template not found' });
      }
      const fid = Math.max(1, parseInt(String(req.session.facilityId || 1), 10) || 1);
      const rows = await saveOverrides(
        pool,
        fid,
        'radiology',
        template.id,
        req.body && req.body.fields,
        req.session.userId
      );
      res.json({
        success: true,
        data: {
          templateKey: template.id,
          fields: refsForEditUi(template, rows),
        },
      });
    } catch (e) {
      console.error('rad template refs put:', e);
      res.status(400).json({ success: false, message: e.message || 'Save failed' });
    }
  });

  router.get('/resolve-order-line', async (req, res) => {
    try {
      const gate = await enforceRadWorkbenchGate(pool, req, res);
      if (!gate) return;
      const code = String(req.query.code || '').trim().toUpperCase();
      const oi = await resolveRadOrderItemForCode(pool, code, req.query.oi);
      if (!oi) {
        return res.status(404).json({
          success: false,
          message: 'No radiology order line found for this service code.',
        });
      }
      return res.json({
        success: true,
        opdOrderItemId: oi.id,
        item_name: oi.item_name,
        status: oi.status,
      });
    } catch (e) {
      console.error('rad resolve-order-line:', e);
      res.status(500).json({ success: false, message: e.message || 'Server error' });
    }
  });

  /**
   * Prefill patient + order line for /radiology/templates?code=RAD-…&oi=…
   */
  router.get('/order-context', async (req, res) => {
    try {
      const gate = await enforceRadWorkbenchGate(pool, req, res);
      if (!gate) return;
      const code = String(req.query.code || '').trim().toUpperCase();
      if (!code) {
        return res.status(400).json({ success: false, message: 'Query param code is required' });
      }
      const oiRow = await resolveRadOrderItemForCode(pool, code, req.query.oi);
      if (!oiRow) {
        return res.status(404).json({
          success: false,
          message: 'No radiology order line found for this service code',
        });
      }
      const oid = oiRow.id;
      const prefix = code.split('-')[0];
      if (prefix !== 'RAD') {
        return res.status(400).json({ success: false, message: 'Only RAD-… service codes are supported here' });
      }
      const [[oi]] = await pool.query(
        `SELECT oi.id, oi.patient_id, oi.item_name, oi.service_code, oi.item_type, oi.consultation_id,
                e.first_name AS doc_fn, e.last_name AS doc_ln
           FROM tbl_opd_order_item oi
           LEFT JOIN tbl_consultation c ON c.id = oi.consultation_id
           LEFT JOIN tbl_employee e ON e.id = c.created_by
          WHERE oi.id = ? AND oi.item_type = 'radiology'`,
        [oid]
      );
      if (!oi) {
        return res.status(404).json({ success: false, message: 'Radiology order item not found' });
      }
      const patRow = await fetchPatientRow(pool, oi.patient_id);
      const docPart = [oi.doc_fn, oi.doc_ln].filter(Boolean).join(' ').trim();
      const requestingDoctor = docPart ? `Dr. ${docPart}` : '';
      const suggestedTemplate = suggestTemplateForOrderName(oi.item_name);
      const [[existingResult]] = await pool
        .query('SELECT id, status FROM tbl_radiology_result WHERE opd_order_item_id = ? LIMIT 1', [oid])
        .catch(() => [[null]]);
      const radiologyResultId = existingResult ? existingResult.id : null;
      if (
        radiologyResultId &&
        String(existingResult.status || '').toLowerCase() === 'pending'
      ) {
        await pool
          .query(
            `UPDATE tbl_radiology_result SET status = 'in_progress', updated_at = NOW()
             WHERE id = ? AND LOWER(TRIM(COALESCE(status,''))) = 'pending'`,
            [radiologyResultId]
          )
          .catch(() => {});
      }
      let attachments = [];
      if (radiologyResultId) {
        attachments = await fetchAttachmentsForResult(pool, 'radiology', radiologyResultId);
      }
      res.json({
        success: true,
        patient: patRow
          ? {
              id: patRow.id,
              first_name: patRow.first_name,
              last_name: patRow.last_name,
              dob: patRow.dob,
              age_years: patRow.age_years,
              gender: patRow.gender,
              age_sex: [computeAgeFromPatientRow(patRow), patRow.gender].filter(Boolean).join(' / ')
            }
          : null,
        orderItem: {
          id: oi.id,
          item_name: oi.item_name,
          service_code: oi.service_code
        },
        requesting_doctor: requestingDoctor,
        suggestedTemplate,
        radiologyResultId,
        attachments
      });
    } catch (e) {
      console.error('rad order-context:', e);
      res.status(500).json({ success: false, message: e.message || 'Server error' });
    }
  });

  /**
   * Prefill patient info for /radiology/templates when arriving from a clinical-dept alert
   * (no order item — uses the alert row + tbl_patient join).
   * GET /api/rad/alert-context?alert_id=123
   */
  router.get('/alert-context', async (req, res) => {
    try {
      const gate = await enforceRadWorkbenchGate(pool, req, res);
      if (!gate) return;
      const alertId = parseInt(String(req.query.alert_id || ''), 10) || 0;
      if (!alertId) {
        return res.status(400).json({ success: false, message: 'alert_id is required' });
      }
      const [[alert]] = await pool
        .query('SELECT * FROM tbl_clinical_dept_alert WHERE id = ? LIMIT 1', [alertId])
        .catch(() => [[null]]);
      if (!alert) {
        return res.status(404).json({ success: false, message: 'Alert not found' });
      }
      const patientRow = alert.patient_id
        ? await fetchPatientRow(pool, alert.patient_id)
        : null;
      const suggestedTemplate = alert.test_display
        ? suggestTemplateForOrderName(alert.test_display)
        : null;
      res.json({
        success: true,
        patient: patientRow
          ? {
              id: patientRow.id,
              first_name: patientRow.first_name,
              last_name: patientRow.last_name,
              dob: patientRow.dob,
              age_years: patientRow.age_years,
              gender: patientRow.gender,
              age_sex: [computeAgeFromPatientRow(patientRow), patientRow.gender].filter(Boolean).join(' / ')
            }
          : null,
        requesting_doctor: alert.doctor_display || '',
        suggestedTemplate
      });
    } catch (e) {
      console.error('rad alert-context:', e);
      res.status(500).json({ success: false, message: e.message || 'Server error' });
    }
  });

  /**
   * Load a standalone registry row for correction prefill (templates workbench).
   */
  router.get('/registry-result-context', async (req, res) => {
    try {
      const id = parseInt(String(req.query.radiology_result_id || req.query.id || ''), 10) || 0;
      if (id < 1) {
        return res.status(400).json({ success: false, message: 'Invalid rad result id' });
      }
      const cols = await radResultColumns(pool);
      const structCol = structuredJsonColumn(cols);
      const structSel = structCol ? `lr.${structCol}` : 'NULL';
      const nameSel = cols.has('exam_name') ? 'lr.exam_name' : 'lr.test_name';
      const [[row]] = await pool
        .query(
          `SELECT lr.id, lr.patient_id, ${nameSel} AS exam_name, ${structSel} AS structured_result, lr.opd_order_item_id,
                  COALESCE(lr.revision_pending,0) AS revision_pending
             FROM tbl_radiology_result lr WHERE lr.id = ? LIMIT 1`,
          [id]
        )
        .catch(() => [[null]]);
      if (!row) {
        return res.status(404).json({ success: false, message: 'Radiology result not found' });
      }
      if (row.opd_order_item_id) {
        return res.status(400).json({
          success: false,
          message: 'This result is linked to an order; use validate-by-code to edit.'
        });
      }
      const patient = await fetchPatientRow(pool, row.patient_id);
      if (!patient) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }
      let structured = null;
      if (row.structured_result) {
        try {
          structured = JSON.parse(row.structured_result);
        } catch (_) {
          structured = null;
        }
      }
      const attachments = await fetchAttachmentsForResult(pool, 'radiology', row.id);
      res.json({
        success: true,
        data: {
          radiologyResultId: row.id,
          revision_pending: Number(row.revision_pending) || 0,
          test_name: row.exam_name || '',
          patient: {
            id: patient.id,
            first_name: patient.first_name,
            last_name: patient.last_name,
            dob: patient.dob,
            age_years: patient.age_years,
            gender: patient.gender,
            age_sex: [computeAgeFromPatientRow(patient), patient.gender].filter(Boolean).join(' / ')
          },
          structured,
          attachments
        }
      });
    } catch (e) {
      console.error('rad registry-result-context:', e);
      res.status(500).json({ success: false, message: e.message || 'Server error' });
    }
  });

  router.post('/report/generate', (req, res) => {
    try {
      const report = generateReportObject(req.body);
      res.json({ success: true, data: report });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  /** All printable patient-copy payloads for a RAD service code (validate hub batch print). */
  router.get('/print-payload-by-code/:code', async (req, res) => {
    try {
      const code = String(req.params.code || '').trim().toUpperCase();
      if (!code) {
        return res.status(400).json({ success: false, message: 'Service code is required.' });
      }
      const fid = Math.max(1, parseInt(String(req.session.facilityId || 1), 10) || 1);
      const auth = await authorizeServiceCodeValidate(pool, code, fid);
      if (!auth.ok) {
        return res.status(400).json({
          success: false,
          message: auth.error || 'Code not valid for radiology work.',
        });
      }
      const {
        loadRadPrintPayloadsByCode,
        buildBatchPrintResponse,
      } = require('../lib/diagnosticReportPrintPayload');
      const reports = await loadRadPrintPayloadsByCode(pool, code);
      return res.json({
        success: true,
        data: buildBatchPrintResponse('radiology', code, reports),
      });
    } catch (e) {
      console.error('rad print-payload-by-code:', e);
      res.status(500).json({ success: false, message: e.message || 'Server error' });
    }
  });

  /** All printable patient-copy payloads for a patient (registry / chart batch print). */
  router.get('/print-batch-by-patient/:patientId', async (req, res) => {
    try {
      const patientId = parseInt(String(req.params.patientId || ''), 10) || 0;
      if (patientId < 1) {
        return res.status(400).json({ success: false, message: 'Valid patient id is required.' });
      }
      const [[pat]] = await pool
        .query('SELECT id, first_name, last_name FROM tbl_patient WHERE id = ? LIMIT 1', [patientId])
        .catch(() => [[null]]);
      if (!pat) {
        return res.status(404).json({ success: false, message: 'Patient not found.' });
      }
      const {
        loadRadPrintPayloadsByPatient,
        buildBatchPrintResponse,
      } = require('../lib/diagnosticReportPrintPayload');
      const reports = await loadRadPrintPayloadsByPatient(pool, patientId);
      const patientName = [pat.first_name, pat.last_name].filter(Boolean).join(' ').trim();
      return res.json({
        success: true,
        data: buildBatchPrintResponse('radiology', null, reports, {
          batchType: 'patient',
          patientNumericId: patientId,
          patientName,
          patientId: `#P-${patientId}`,
        }),
      });
    } catch (e) {
      console.error('rad print-batch-by-patient:', e);
      res.status(500).json({ success: false, message: e.message || 'Server error' });
    }
  });

  router.post('/report/ocr-prefill', externalUploadArrayMw('result_file', 1), async (req, res) => {
    try {
      const fs = require('fs');
      const file = (req.files && req.files[0]) || req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: 'Upload a PDF or image file.' });
      }
      const buffer = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
      if (!buffer || !buffer.length) {
        return res.status(400).json({ success: false, message: 'Could not read uploaded file.' });
      }
      const testId = String(req.body.testId || req.body.template_key || '').trim();
      const template = testId ? getTestById(testId) : null;
      if (!template) {
        return res.status(400).json({ success: false, message: 'testId is required for OCR mapping.' });
      }
      const fid = Math.max(1, parseInt(String(req.session.facilityId || 1), 10) || 1);
      const overrides = await loadOverrides(pool, fid, 'radiology', template.id);
      const merged = mergeTemplateFields(template, overrides);
      const extracted = await extractTextFromBuffer(buffer, {
        mime: file.mimetype,
        originalName: file.originalname,
      });
      const fields = mapToTemplateFields(extracted.text, merged);
      res.json({
        success: true,
        data: {
          testId: template.id,
          fields,
          textPreview: String(extracted.text || '').slice(0, 4000),
          source: extracted.source,
        },
      });
    } catch (e) {
      console.error('rad report/ocr-prefill:', e);
      res.status(400).json({ success: false, message: e.message || 'OCR prefill failed' });
    }
  });

  /** Patient handover print payload for a saved registry row. */
  router.get('/print-payload/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10) || 0;
      if (id < 1) {
        return res.status(400).json({ success: false, message: 'Invalid radiology result id' });
      }
      const { loadRadPrintPayload } = require('../lib/diagnosticReportPrintPayload');
      const data = await loadRadPrintPayload(pool, id);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Radiology result not found' });
      }
      return res.json({ success: true, data });
    } catch (e) {
      console.error('rad print-payload:', e);
      res.status(500).json({ success: false, message: e.message || 'Server error' });
    }
  });

  /**
   * Save template-filled report into tbl_radiology_result (standalone or linked to OPD order line).
   */
  router.post('/report/persist', async (req, res) => {
    try {
      await ensureDiagnosticCorrectionSchema(pool);
      const techRaw = req.session.userId != null ? req.session.userId : req.session.user && req.session.user.id;
      const technicianId = techRaw != null ? String(techRaw) : '';
      const report = generateReportObject({ ...req.body, technicianId });

      let serviceCode = String(req.body.serviceCode || '').trim().toUpperCase();
      let opdOrderItemId = parseInt(String(req.body.opdOrderItemId || ''), 10) || 0;
      if (serviceCode && !opdOrderItemId) {
        const resolved = await resolveRadOrderItemForCode(pool, serviceCode, 0);
        if (resolved) opdOrderItemId = resolved.id;
      }
      if (!serviceCode && opdOrderItemId) {
        const [[oiCode]] = await pool
          .query('SELECT service_code FROM tbl_opd_order_item WHERE id = ? LIMIT 1', [opdOrderItemId])
          .catch(() => [[null]]);
        if (oiCode && oiCode.service_code) {
          serviceCode = String(oiCode.service_code).trim().toUpperCase();
        }
      }
      const radiologyResultIdArg =
        parseInt(String(req.body.radiologyResultId || req.body.rad_result_id || ''), 10) || 0;

      const gate = await assertDiagnosticWorkbenchAccess(pool, {
        dept: 'radiology',
        code: serviceCode,
        opdOrderItemId,
        alertId: req.body.alertId,
        fromAlert: !!req.body.fromAlert,
        facilityId: req.session?.facilityId || 1,
        standalone: !serviceCode && !opdOrderItemId && !req.body.alertId && radiologyResultIdArg > 0,
      });
      if (!gate.ok) {
        return res.status(403).json({
          success: false,
          message: gate.error,
          code: gate.code,
          requireValidation: true,
        });
      }

      const notesText = formatFindingsFromReport(report);
      const conclusionText = String(report.conclusion || '').trim();
      const conclusionDb = conclusionText.slice(0, 255);
      const hasResultValue = (report.results || []).some((r) => String(r.value || '').trim());
      if (!hasResultValue && !conclusionText) {
        return res.status(400).json({
          success: false,
          message:
            'Enter at least one result field (e.g. findings or impression) or a conclusion before saving to the registry.',
        });
      }

      const cols = await radResultColumns(pool);
      if (!cols.size) {
        return res.status(500).json({ success: false, message: 'tbl_radiology_result not found in database' });
      }

      const structCol = structuredJsonColumn(cols);
      const structuredJson = structCol ? JSON.stringify(report) : null;
      const templateIdVal = cols.has('template_test_id') ? report.testId : null;
      const findingsCol = radFindingsSelect(cols);

      let patientId = 0;
      let oiRow = null;

      if (serviceCode && opdOrderItemId) {
        const [[oi]] = await pool.query(
          `SELECT oi.id, oi.patient_id, oi.item_name, oi.facility_id, oi.service_code, oi.item_type,
                  c.created_by AS consult_doctor_id
             FROM tbl_opd_order_item oi
             LEFT JOIN tbl_consultation c ON c.id = oi.consultation_id
            WHERE oi.id = ?`,
          [opdOrderItemId]
        );
        if (!oi || String(oi.item_type) !== 'radiology') {
          return res.status(400).json({ success: false, message: 'Invalid radiology order item' });
        }
        if (String(oi.service_code || '').trim().toUpperCase() !== serviceCode) {
          return res.status(400).json({ success: false, message: 'Service code does not match order line' });
        }
        const pidForm = parsePatientId(req.body.patientInfo && req.body.patientInfo.id);
        if (pidForm && pidForm !== oi.patient_id) {
          return res.status(400).json({ success: false, message: 'Patient ID does not match this order' });
        }
        patientId = oi.patient_id;
        oiRow = oi;
      } else {
        patientId = parsePatientId(req.body.patientInfo && req.body.patientInfo.id);
        if (!patientId) {
          return res.status(400).json({ success: false, message: 'Patient id is required (enter #P-… or numeric id)' });
        }
        const [[p]] = await pool.query('SELECT id FROM tbl_patient WHERE id = ? LIMIT 1', [patientId]);
        if (!p) {
          return res.status(404).json({ success: false, message: 'Patient not found' });
        }
      }

      const fid = Math.max(
        1,
        parseInt(String((oiRow && oiRow.facility_id) || req.session.facilityId || 1), 10) || 1
      );
      await ensureFacilityRow(pool, fid);
      const appt = new Date().toISOString().slice(0, 10);
      const uid = parseInt(String(techRaw || ''), 10) || null;
      const uidAudit = parseInt(String(techRaw || ''), 10) || 1;

      let radiologyResultId = null;

      if (opdOrderItemId && oiRow) {
        const referredByFromOrder = oiRow.consult_doctor_id
          ? parseInt(String(oiRow.consult_doctor_id), 10) || null
          : null;

        const [[existing]] = await pool.query(
          'SELECT id FROM tbl_radiology_result WHERE opd_order_item_id = ? LIMIT 1',
          [opdOrderItemId]
        );

        const setParts = ["status = 'received'", "source = 'template_workbench'"];
        const setVals = [];
        if (findingsCol) {
          setParts.push(`${findingsCol} = ?`);
          setVals.push(notesText);
        }
        setParts.push('conclusion_code = ?');
        setVals.push(conclusionDb || null);
        const updateBag = {};
        applyRadReportFields(cols, report, notesText, conclusionDb, structuredJson, templateIdVal, updateBag);
        for (const [k, v] of Object.entries(updateBag)) {
          if (k === 'findings' || k === 'notes' || k === 'conclusion_code') continue;
          setParts.push(`${k} = ?`);
          setVals.push(v);
        }
        if (cols.has('updated_at')) setParts.push('updated_at = NOW()');
        if (cols.has('referred_by_id') && referredByFromOrder) {
          setParts.push('referred_by_id = ?');
          setVals.push(referredByFromOrder);
        }

        if (existing && existing.id) {
          setVals.push(existing.id);
          await pool.query(`UPDATE tbl_radiology_result SET ${setParts.join(', ')} WHERE id = ?`, setVals);
          radiologyResultId = existing.id;
        } else {
          const insert = {
            patient_id: patientId,
            referred_by_id: cols.has('referred_by_id') ? referredByFromOrder || null : undefined,
            appointment_date: appt,
            status: 'received',
            opd_order_item_id: opdOrderItemId,
            source: 'template_workbench',
            body_part: ''
          };
          if (cols.has('facility_id')) insert.facility_id = fid;
          applyRadReportFields(cols, report, notesText, conclusionDb, structuredJson, templateIdVal, insert);
          const { keys, vals } = buildRadInsertRow(cols, insert);
          if (!keys.length) {
            return res.status(500).json({ success: false, message: 'No insertable columns for tbl_radiology_result' });
          }
          const ph = keys.map(() => '?').join(',');
          const [ins] = await pool.query(
            `INSERT INTO tbl_radiology_result (${keys.join(',')}, created_at) VALUES (${ph}, NOW())`,
            vals
          );
          radiologyResultId = ins.insertId;
        }

        await pool
          .query(
            `UPDATE tbl_opd_order_item SET served_at = NOW(), served_by = ?, served_notes = ? WHERE id = ?`,
            [uid, notesText.slice(0, 5000), opdOrderItemId]
          )
          .catch(() => {});
      } else if (radiologyResultIdArg > 0) {
        await ensureDiagnosticCorrectionSchema(pool);
        const structSel = structCol ? structCol : 'NULL AS structured_result';
        const [[ex]] = await pool
          .query(
            `SELECT id, patient_id, findings, notes, conclusion_code, opd_order_item_id, ${structSel} AS structured_result
               FROM tbl_radiology_result WHERE id = ? LIMIT 1`,
            [radiologyResultIdArg]
          )
          .catch(() => [[null]]);
        if (!ex) {
          return res.status(404).json({ success: false, message: 'Radiology result not found' });
        }
        if (ex.opd_order_item_id) {
          return res.status(400).json({
            success: false,
            message: 'This result is order-linked; persist with serviceCode and opdOrderItemId.'
          });
        }
        if (parseInt(String(ex.patient_id), 10) !== patientId) {
          return res.status(400).json({ success: false, message: 'Patient does not match this registry row' });
        }

        const oldFindings = (ex.findings || ex.notes || '').toString();
        const oldConc = (ex.conclusion_code || '').toString();
        const newNotes = notesText;
        let structChanged = false;
        if (structCol) {
          const oldS = ex.structured_result != null ? String(ex.structured_result) : '';
          const newS = structuredJson != null ? String(structuredJson) : '';
          structChanged = oldS !== newS;
        }
        const changed = oldFindings !== newNotes || oldConc !== (conclusionDb || '').toString() || structChanged;
        if (changed && ex.id) {
          try {
            await insertDiagnosticCorrectionAudit(pool, {
              module: 'radiology',
              lab_result_id: null,
              radiology_result_id: ex.id,
              opd_order_item_id: null,
              event_type: 'correct',
              superseded_findings: oldFindings,
              superseded_conclusion: oldConc || null,
              new_findings: newNotes,
              new_conclusion: conclusionDb || null,
              reason: null,
              performed_by: uidAudit
            });
          } catch (aerr) {
            console.error('rad standalone correction audit', aerr);
          }
        }

        const setParts = ["status = 'received'"];
        const setVals = [];
        if (cols.has('source')) setParts.push("source = 'template_workbench'");
        if (cols.has('revision_pending')) setParts.push('revision_pending = 0');
        if (findingsCol) {
          setParts.push(`${findingsCol} = ?`);
          setVals.push(notesText);
        }
        setParts.push('conclusion_code = ?');
        setVals.push(conclusionDb || null);
        const corrBag = {};
        applyRadReportFields(cols, report, notesText, conclusionDb, structuredJson, templateIdVal, corrBag);
        for (const [k, v] of Object.entries(corrBag)) {
          if (k === 'findings' || k === 'notes' || k === 'conclusion_code') continue;
          setParts.push(`${k} = ?`);
          setVals.push(v);
        }
        if (cols.has('updated_at')) setParts.push('updated_at = NOW()');
        setVals.push(ex.id);
        await pool.query(`UPDATE tbl_radiology_result SET ${setParts.join(', ')} WHERE id = ?`, setVals);
        radiologyResultId = ex.id;
      } else {
        const insert = {
          patient_id: patientId,
          referred_by_id: null,
          appointment_date: appt,
          status: 'received',
          source: 'template_workbench',
          body_part: ''
        };
        if (cols.has('facility_id')) insert.facility_id = fid;
        if (cols.has('opd_order_item_id')) insert.opd_order_item_id = null;
        applyRadReportFields(cols, report, notesText, conclusionDb, structuredJson, templateIdVal, insert);
        const { keys, vals } = buildRadInsertRow(cols, insert);
        const ph = keys.map(() => '?').join(',');
        const [ins] = await pool.query(
          `INSERT INTO tbl_radiology_result (${keys.join(',')}, created_at) VALUES (${ph}, NOW())`,
          vals
        );
        radiologyResultId = ins.insertId;
      }

      res.json({ success: true, data: { report, radiologyResultId } });
    } catch (e) {
      console.error('rad report/persist:', e);
      res.status(400).json({ success: false, message: e.message || 'Persist failed' });
    }
  });

  router.post('/report/attach', (req, res, next) => {
    externalUploadArrayMw('result_files', 8)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
      }
      next();
    });
  }, async (req, res) => {
    try {
      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) {
        return res.status(400).json({ success: false, message: 'No files received.' });
      }
      const serviceCode = String(req.body.serviceCode || '').trim().toUpperCase();
      const opdOrderItemId = parseInt(String(req.body.opdOrderItemId || ''), 10) || 0;
      const radiologyResultId = parseInt(String(req.body.radiologyResultId || ''), 10) || 0;
      const gate = await assertDiagnosticWorkbenchAccess(pool, {
        dept: 'radiology',
        code: serviceCode,
        opdOrderItemId,
        alertId: req.body.alertId,
        fromAlert: !!req.body.fromAlert,
        facilityId: req.session?.facilityId || 1,
        standalone: !serviceCode && !opdOrderItemId && !req.body.alertId && radiologyResultId > 0,
      });
      if (!gate.ok) {
        return res.status(403).json({
          success: false,
          message: gate.error,
          code: gate.code,
          requireValidation: true,
        });
      }
      const uid = req.session.userId != null ? req.session.userId : req.session.user && req.session.user.id;
      const uploaded = [];
      let resolvedRadResultId = radiologyResultId;
      for (const file of files) {
        const out = await attachFileToResult(pool, {
          kind: 'radiology',
          file,
          radiologyResultId: resolvedRadResultId || undefined,
          opdOrderItemId: opdOrderItemId || undefined,
          testName: String(req.body.testName || '').trim(),
          facilityId: req.session?.facilityId || 1,
          userId: uid,
        });
        if (out.radiologyResultId) resolvedRadResultId = out.radiologyResultId;
        uploaded.push(out);
      }
      res.json({
        success: true,
        data: { radiologyResultId: resolvedRadResultId, attachments: uploaded },
      });
    } catch (e) {
      console.error('rad report/attach:', e);
      res.status(400).json({ success: false, message: e.message || 'Attach failed' });
    }
  });

  router.get('/report/attachments', async (req, res) => {
    try {
      const radiologyResultId = parseInt(String(req.query.radiology_result_id || req.query.id || ''), 10) || 0;
      if (radiologyResultId < 1) {
        return res.status(400).json({ success: false, message: 'radiology_result_id is required' });
      }
      const attachments = await fetchAttachmentsForResult(pool, 'radiology', radiologyResultId);
      res.json({ success: true, data: { radiologyResultId, attachments } });
    } catch (e) {
      console.error('rad report/attachments:', e);
      res.status(500).json({ success: false, message: e.message || 'Server error' });
    }
  });

  return router;
};
