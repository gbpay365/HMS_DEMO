/** Cashier payment modal: services that require an assigned physician. */
const {
  doctorClinicalSpecialisations,
} = require('./hmsDoctorClinicalFilter');

const CONSULT_DOCTOR_SERVICE_NAMES = new Set([
  'general consultation',
  'specialist consultation',
]);

function isConsultDoctorServiceName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (CONSULT_DOCTOR_SERVICE_NAMES.has(n)) return true;
  if (/\bgeneral\s+consultation\b/.test(n)) return true;
  if (/\bspecialist\s+consultation\b/.test(n)) return true;
  return false;
}

function catalogItemNeedsDoctor(cat) {
  return !!(cat && isConsultDoctorServiceName(cat.name));
}

/** Departments that are not clinical OPD units — never use for physician filtering. */
const NON_PHYSICIAN_DEPT_PATTERNS = [
  /^nursing\b/i,
  /ward\s+service/i,
  /^general\s+medicine$/i,
];

function isBroadConsultationService(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return n === 'general consultation' || n === 'specialist consultation';
}

function isGeneralConsultationService(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return n === 'general consultation' || /\bgeneral\s+consultation\b/.test(n);
}

function isSpecialistConsultationService(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return n === 'specialist consultation' || /\bspecialist\s+consultation\b/.test(n);
}

/** Specialisations treated as general / GP for General Consultation tickets. */
const GENERAL_CONSULT_SPEC_PATTERNS = [
  /^general\s+medicine$/i,
  /^general\s+practitioner$/i,
  /^general\s+practice$/i,
  /^family\s+medicine$/i,
  /^internal\s+medicine$/i,
  /^primary\s+care$/i,
  /^gp$/i,
  /generalist/i,
  /^odp$/i,
  /^out\s*patient/i,
  /^outpatient/i,
];

function normClinicianSpec(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isGeneralConsultSpecialisation(spec) {
  const s = normClinicianSpec(spec).toLowerCase();
  if (!s) return false;
  return GENERAL_CONSULT_SPEC_PATTERNS.some((re) => re.test(s));
}

function clinicianSpecLabel(doc) {
  if (!doc) return '';
  const specs = doctorClinicalSpecialisations(doc);
  if (specs.length) return specs[0];
  return normClinicianSpec(doc.primary_department);
}

function doctorMatchesGeneralConsultation(doc) {
  return doctorClinicalSpecialisations(doc).some((label) => isGeneralConsultSpecialisation(label))
    || isGeneralConsultSpecialisation(doc && doc.primary_department);
}

function doctorMatchesSpecialistConsultation(doc, specialistSpec) {
  const want = normClinicianSpec(specialistSpec).toLowerCase();
  if (!want) return false;
  return doctorClinicalSpecialisations(doc).some((label) => {
    const l = normClinicianSpec(label).toLowerCase();
    return l === want || l.includes(want) || want.includes(l);
  });
}

/** Specialist dropdown options: specialisation catalog + doctor profiles only (no departments). */
function listSpecialistSpecialisationsForCashier(doctors, catalogSpecs, opts = {}) {
  const deptBlock = opts.departmentNames instanceof Set
    ? opts.departmentNames
    : new Set(
        (opts.departmentNames || [])
          .map((name) => normClinicianSpec(name).toLowerCase())
          .filter(Boolean)
      );
  const isDepartmentLabel = (label) => deptBlock.has(normClinicianSpec(label).toLowerCase());

  const seen = new Map();
  for (const d of doctors || []) {
    for (const label of doctorClinicalSpecialisations(d)) {
      if (!label || isGeneralConsultSpecialisation(label) || isDepartmentLabel(label)) continue;
      seen.set(label.toLowerCase(), label);
    }
  }
  for (const s of catalogSpecs || []) {
    const label = normClinicianSpec(s);
    if (!label || isGeneralConsultSpecialisation(label) || isDepartmentLabel(label)) continue;
    seen.set(label.toLowerCase(), label);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function generalConsultSpecPatternSources() {
  return GENERAL_CONSULT_SPEC_PATTERNS.map((re) => re.source);
}

/**
 * Department used to filter the assigned-physician dropdown in cashier prepay.
 * General/specialist consults and nursing-tagged rows show all active doctors.
 */
function doctorFilterDepartment(name, departmentName) {
  if (isBroadConsultationService(name)) return '';
  const dept = String(departmentName || '').trim();
  if (!dept) return '';
  if (NON_PHYSICIAN_DEPT_PATTERNS.some((re) => re.test(dept))) return '';
  return dept;
}

const { CONSULTATION_CATALOG_2026 } = require('./consultationCatalogSeedData');

const BASIC_CONSULTATION_CATALOG = CONSULTATION_CATALOG_2026.map((item) => ({
  name: item.name,
  subcategory: item.subcategory === 'General Consultation' ? 'General' : 'Specialist',
  department_name: item.department_name,
  cpt_code: item.code,
  legacyCpt: item.legacyCpt,
  price: item.price,
}));

function normCatalogName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Ensure core consultation rows exist (category: consultation) and retire duplicates under nursing ward service.
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureBasicConsultationCatalog(pool) {
  const category = 'consultation';
  let inserted = 0;
  let updated = 0;

  for (const item of BASIC_CONSULTATION_CATALOG) {
    const key = normCatalogName(item.name);
    const [[row]] = await pool.query(
      `SELECT id, price FROM tbl_service_catalog
       WHERE LOWER(TRIM(category)) = ? AND LOWER(TRIM(name)) = ? LIMIT 1`,
      [category, key]
    );
    const [[nwDup]] = await pool.query(
      `SELECT id, price FROM tbl_service_catalog
       WHERE cpt_code = ? LIMIT 1`,
      [item.legacyCpt]
    );
    const price = nwDup && nwDup.price != null ? Number(nwDup.price) : item.price;

    if (row) {
      await pool.query(
        `UPDATE tbl_service_catalog
         SET subcategory = ?, department_name = ?, cpt_code = ?, price = ?, status = 1
         WHERE id = ? LIMIT 1`,
        [item.subcategory, item.department_name, item.cpt_code, price, row.id]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO tbl_service_catalog
         (facility_id, category, subcategory, name, department_name, cpt_code, price, currency, status)
         VALUES (0, ?, ?, ?, ?, ?, ?, 'XAF', 1)`,
        [category, item.subcategory, item.name, item.department_name, item.cpt_code, price]
      );
      inserted++;
    }
  }

  const [retire] = await pool.query(
    `UPDATE tbl_service_catalog SET status = 0
     WHERE LOWER(TRIM(category)) = 'service'
       AND (cpt_code IN ('NW_GEN_CONS', 'NW_SPEC_CONS')
         OR (LOWER(TRIM(name)) IN ('general consultation', 'specialist consultation')
             AND LOWER(TRIM(department_name)) LIKE '%nursing%'))`
  );

  return { inserted, updated, retired: retire.affectedRows || 0 };
}

/** Ticket lines_json kind for OPD / consultation desk. */
function effectivePrepayServiceType(cat, requestedType) {
  const req = String(requestedType || 'hospitalisation').toLowerCase();
  if (req === 'consultation') return 'consultation';
  const catType = String(cat?.category || '').trim().toLowerCase();
  if (catType === 'consultation' && isConsultDoctorServiceName(cat?.name)) return 'consultation';
  if (isConsultDoctorServiceName(cat?.name)) return 'consultation';
  return req;
}

function lineUnitPrice(ln) {
  if (!ln || typeof ln !== 'object') return 0;
  const raw =
    ln.list_unit_price != null && ln.list_unit_price !== ''
      ? ln.list_unit_price
      : ln.unit_price != null && ln.unit_price !== ''
        ? ln.unit_price
        : ln.amount;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isConsultationTicketLine(ln) {
  if (!ln || typeof ln !== 'object') return false;
  const kind = String(ln.kind || '').toLowerCase().trim();
  if (kind === 'consultation') return true;
  return isConsultDoctorServiceName(ln.description);
}

/**
 * Consultation service + assigned physician from cashier payment ticket lines_json.
 * @returns {{ serviceName: string, servicePrice: number, doctorId: number, doctorNameFromLine: string }}
 */
function parsePaymentTicketConsultation(linesJson) {
  let serviceName = '';
  let servicePrice = 0;
  let doctorId = 0;
  let doctorNameFromLine = '';

  try {
    const lines =
      typeof linesJson === 'string' ? JSON.parse(linesJson || '[]') : Array.isArray(linesJson) ? linesJson : [];

    for (const ln of lines) {
      if (!isConsultationTicketLine(ln)) continue;
      serviceName = String(ln.description || '').trim() || serviceName;
      const price = lineUnitPrice(ln);
      if (price > 0) servicePrice = price;
      const id = parseInt(ln.assigned_doctor_id, 10) || 0;
      if (id > 0) doctorId = id;
      if (ln.assigned_doctor_name) doctorNameFromLine = String(ln.assigned_doctor_name).trim();
      break;
    }

    if (!serviceName && lines.length > 0) {
      serviceName = String(lines[0].description || '').trim();
      const price = lineUnitPrice(lines[0]);
      if (price > 0) servicePrice = price;
    }

    if (!doctorId) {
      for (const ln of lines) {
        const id = parseInt(ln.assigned_doctor_id, 10) || 0;
        if (id > 0) {
          doctorId = id;
          if (ln.assigned_doctor_name && !doctorNameFromLine) {
            doctorNameFromLine = String(ln.assigned_doctor_name).trim();
          }
          break;
        }
      }
    }
  } catch (_) {
    /* ignore parse errors */
  }

  return { serviceName, servicePrice, doctorId, doctorNameFromLine };
}

function formatPhysicianDisplayName(nameFromLine, firstName, lastName) {
  let name = String(nameFromLine || '').trim();
  if (!name) {
    name = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
  }
  if (!name) return '';
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

/**
 * Resolve cashier ticket consultation type, fee, and assigned physician for OPD consult UI.
 * @param {import('mysql2/promise').Pool} pool
 * @param {string|object|null} linesJson
 * @param {{ fallbackDoctorId?: number }} [opts]
 */
async function resolveCashierConsultTicketMeta(pool, linesJson, opts = {}) {
  const meta = parsePaymentTicketConsultation(linesJson);
  let doctorId = meta.doctorId || parseInt(opts.fallbackDoctorId, 10) || 0;
  let doctorName = meta.doctorNameFromLine;

  if (!doctorName && doctorId > 0) {
    const [[doc]] = await pool
      .query('SELECT first_name, last_name FROM tbl_employee WHERE id = ? AND status = 1 LIMIT 1', [doctorId])
      .catch(() => [[null]]);
    if (doc) doctorName = formatPhysicianDisplayName('', doc.first_name, doc.last_name);
  } else if (doctorName) {
    doctorName = formatPhysicianDisplayName(doctorName, '', '');
  }

  return {
    serviceName: meta.serviceName,
    servicePrice: meta.servicePrice,
    doctorId,
    doctorName: doctorName || '',
  };
}

function ticketIsConsultation(linesJson) {
  const paymentValidity = require('./paymentValidity');
  return paymentValidity.inferPaymentKind(linesJson) === 'consultation';
}

/**
 * Another open visit for the same patient that already has a payment code (front desk duplicate visit).
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} patientId
 * @param {number} [excludeVisitId]
 */
async function findSiblingActiveVisitPayment(pool, patientId, excludeVisitId) {
  const pid = parseInt(patientId, 10) || 0;
  const vid = parseInt(excludeVisitId, 10) || 0;
  if (pid < 1) return null;
  const [[row]] = await pool
    .query(
      `SELECT payment_code, assigned_doctor_id
         FROM tbl_opd_visit
        WHERE patient_id = ?
          AND (? < 1 OR id <> ?)
          AND payment_code IS NOT NULL AND TRIM(payment_code) <> ''
          AND LOWER(TRIM(COALESCE(queue_status,''))) NOT IN ('completed','cancelled')
        ORDER BY id DESC
        LIMIT 1`,
      [pid, vid, vid]
    )
    .catch(() => [[null]]);
  return row || null;
}

/**
 * Latest paid consultation prepayment for a patient (when visit has no payment_code yet).
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} patientId
 */
async function findLatestPaidConsultationTicketForPatient(pool, patientId) {
  const pid = parseInt(patientId, 10) || 0;
  if (pid < 1) return null;
  const [rows] = await pool
    .query(
      `SELECT * FROM tbl_payment_ticket
        WHERE patient_id = ?
          AND LOWER(TRIM(COALESCE(status,''))) = 'paid'
        ORDER BY COALESCE(paid_at, created_at) DESC, id DESC
        LIMIT 30`,
      [pid]
    )
    .catch(() => [[]]);
  for (const t of rows || []) {
    if (ticketIsConsultation(t.lines_json)) return t;
  }
  return null;
}

/**
 * Billing fields for OPD consultation UI from paid cashier ticket + visit fallbacks.
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ paymentCode?: string, assignedDoctorId?: number, patientId?: number, excludeVisitId?: number, linesJson?: string|object|null }} input
 */
async function resolveOpdConsultBillingMeta(pool, input = {}) {
  const paymentValidity = require('./paymentValidity');
  const patientId = parseInt(input.patientId, 10) || 0;
  let assignedDoctorId = parseInt(input.assignedDoctorId, 10) || 0;
  const normCode = paymentValidity.normalizePaymentCodeInput(input.paymentCode || '');
  let linesJson = input.linesJson || null;
  let ticketRow = null;
  let ticketMeta = { serviceName: '', servicePrice: 0, doctorId: 0, doctorName: '' };

  if (!linesJson && normCode) {
    ticketRow = await paymentValidity
      .findPaidTicketForPatientAndCode(pool, patientId, normCode)
      .catch(() => null);
    if (ticketRow && ticketRow.lines_json) linesJson = ticketRow.lines_json;
  }

  if (!linesJson && patientId > 0) {
    const sibling = await findSiblingActiveVisitPayment(pool, patientId, input.excludeVisitId);
    if (sibling && sibling.payment_code) {
      if (!assignedDoctorId && parseInt(sibling.assigned_doctor_id, 10) > 0) {
        assignedDoctorId = parseInt(sibling.assigned_doctor_id, 10);
      }
      ticketRow = await paymentValidity
        .findPaidTicketForPatientAndCode(pool, patientId, sibling.payment_code)
        .catch(() => null);
      if (ticketRow && ticketRow.lines_json) linesJson = ticketRow.lines_json;
    }
  }

  if (!linesJson && patientId > 0) {
    ticketRow = await findLatestPaidConsultationTicketForPatient(pool, patientId);
    if (ticketRow && ticketRow.lines_json) linesJson = ticketRow.lines_json;
  }

  if (linesJson) {
    ticketMeta = await resolveCashierConsultTicketMeta(pool, linesJson, {
      fallbackDoctorId: assignedDoctorId,
    });
  }

  let doctorId = ticketMeta.doctorId || assignedDoctorId || 0;
  let doctorName = ticketMeta.doctorName || '';
  let serviceName = ticketMeta.serviceName || '';
  let servicePrice = ticketMeta.servicePrice > 0 ? ticketMeta.servicePrice : 0;

  if (servicePrice <= 0 && ticketRow && parseFloat(ticketRow.total_amount) > 0) {
    servicePrice = parseFloat(ticketRow.total_amount);
  }

  if (!doctorName && doctorId > 0) {
    const [[doc]] = await pool
      .query('SELECT first_name, last_name FROM tbl_employee WHERE id = ? AND status = 1 LIMIT 1', [doctorId])
      .catch(() => [[null]]);
    if (doc) doctorName = formatPhysicianDisplayName('', doc.first_name, doc.last_name);
  }

  if (!serviceName) serviceName = 'General Consultation';

  const resolvedCode = ticketRow
    ? String(ticketRow.ticket_code || normCode || '').trim()
    : normCode;

  return {
    serviceName,
    servicePrice,
    doctorId,
    doctorName,
    paymentCode: resolvedCode || '',
    ticketId: ticketRow ? parseInt(ticketRow.id, 10) || null : null,
  };
}

module.exports = {
  CONSULT_DOCTOR_SERVICE_NAMES,
  isConsultDoctorServiceName,
  catalogItemNeedsDoctor,
  doctorFilterDepartment,
  ensureBasicConsultationCatalog,
  effectivePrepayServiceType,
  parsePaymentTicketConsultation,
  formatPhysicianDisplayName,
  resolveCashierConsultTicketMeta,
  resolveOpdConsultBillingMeta,
  findLatestPaidConsultationTicketForPatient,
  findSiblingActiveVisitPayment,
  isConsultationTicketLine,
  lineUnitPrice,
  isGeneralConsultationService,
  isSpecialistConsultationService,
  isGeneralConsultSpecialisation,
  doctorMatchesGeneralConsultation,
  doctorMatchesSpecialistConsultation,
  listSpecialistSpecialisationsForCashier,
  generalConsultSpecPatternSources,
  clinicianSpecLabel,
};
