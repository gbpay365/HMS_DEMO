'use strict';

const hmsFormatDate = require('./hmsFormatDate');
const paymentCodeMessages = require('./paymentCodeMessages');
const hmsI18n = require('./hmsI18n');
const { isConsultDoctorServiceName } = require('./cashierConsultServices');

/**
 * Payment code validity: configurable duration + max uses per payment "kind",
 * with optional blending against the doctor's last documented follow-up interval.
 *
 * Time-based validity (expiry, validity days, doctor follow-up) applies only to
 * consultation and telemedicine tickets. Other kinds (lab, rad, HOS, IPD, etc.)
 * are checked for paid status and usage limits only — no expiration window.
 */

const DEFAULT_KIND = 'general';

/** Consultation-style tickets use expiry dates and validity-day rules. */
function kindUsesConsultationValidity(kind) {
  const k = String(kind || '').toLowerCase().trim();
  return k === 'consultation' || k === 'telemedicine';
}

/** Match normalisation used by `/api/payment/validate` and OPD registration. */
function normalizePaymentCodeInput(raw) {
  return String(raw || '')
    .replace(/[\u2010-\u2015\u2212\u00AD\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/\s+/g, '')
    .toUpperCase();
}

/** @param {unknown} linesJson */
function parseLines(linesJson) {
  try {
    const j = typeof linesJson === 'string' ? JSON.parse(linesJson) : linesJson;
    return Array.isArray(j) ? j : [];
  } catch (_) {
    return [];
  }
}

/**
 * Map ticket line(s) to a coarse rule bucket (matches tbl_payment_validity_rule.payment_kind).
 * @param {unknown} linesJson
 */
function inferPaymentKind(linesJson) {
  const lines = parseLines(linesJson);
  const first = lines[0] || {};
  const k = String(first.kind || '').toLowerCase().trim();
  if (k === 'consultation') return 'consultation';
  for (const ln of lines) {
    if (isConsultDoctorServiceName(ln.description)) return 'consultation';
  }
  if (k === 'telemedicine' || k === 'teleconsultation') return 'telemedicine';
  if (k === 'hospitalisation') return 'hospitalisation';
  if (k === 'laboratory') return 'laboratory';
  if (k === 'radiology') return 'radiology';
  if (k === 'pharmacy') return 'pharmacy';
  if (k === 'ipd_settlement' || k === 'ipd_total' || k === 'ipd_balance') return 'ipd';
  if (k === 'emergency_charge' || k === 'emergency_settlement') return 'emergency';
  if (k === 'service') return 'service';
  if (k) return k;
  return DEFAULT_KIND;
}

const NEXT_CONSULT_DAYS = {
  '1 week': 7,
  '2 weeks': 14,
  '3 weeks': 21,
  '1 month': 30,
  '2 months': 60,
  '3 months': 90,
  '6 months': 180,
  '1 year': 365
};

/** @param {string|null|undefined} label */
function nextConsultationLabelToDays(label) {
  const key = String(label || '')
    .trim()
    .toLowerCase();
  if (!key) return null;
  return NEXT_CONSULT_DAYS[key] != null ? NEXT_CONSULT_DAYS[key] : null;
}

async function ensurePaymentValiditySchema(pool) {
  await pool
    .query(
      `CREATE TABLE IF NOT EXISTS tbl_payment_validity_rule (
      id INT AUTO_INCREMENT PRIMARY KEY,
      facility_id INT NOT NULL DEFAULT 1,
      payment_kind VARCHAR(96) NOT NULL,
      label VARCHAR(255) NOT NULL,
      validity_days INT NOT NULL DEFAULT 14,
      max_uses INT NOT NULL DEFAULT 1,
      interval_policy ENUM(
        'system_only',
        'doctor_shortest',
        'doctor_longest',
        'doctor_overrides',
        'system_overrides_doctor'
      ) NOT NULL DEFAULT 'system_only',
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_fac_kind (facility_id, payment_kind)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch(() => {});

  await pool
    .query(
      "ALTER TABLE tbl_payment_validity_rule MODIFY interval_policy ENUM(" +
        "'system_only','doctor_shortest','doctor_longest','doctor_overrides','system_overrides_doctor'" +
        ") NOT NULL DEFAULT 'system_only'"
    )
    .catch(() => {});
}

/**
 * Insert rows for kinds derived from the service catalog + fixed clinical buckets.
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} facilityId
 */
async function seedMissingPaymentValidityRules(pool, facilityId) {
  await ensurePaymentValiditySchema(pool);

  const fid = Number(facilityId) || 1;

  const seeds = [
    { kind: 'consultation', label: 'Consultation prepayment', days: 14, uses: 2, policy: 'doctor_shortest', so: 10 },
    { kind: 'telemedicine', label: 'Telemedicine / video consultation', days: 14, uses: 2, policy: 'doctor_shortest', so: 12 },
    { kind: 'laboratory', label: 'Laboratory prepayment', days: 30, uses: 1, policy: 'system_only', so: 20 },
    { kind: 'radiology', label: 'Radiology prepayment', days: 30, uses: 1, policy: 'system_only', so: 30 },
    { kind: 'pharmacy', label: 'Pharmacy prepayment', days: 14, uses: 1, policy: 'system_only', so: 40 },
    { kind: 'service', label: 'Other cashier services (catalog)', days: 30, uses: 1, policy: 'system_only', so: 45 },
    { kind: 'hospitalisation', label: 'Hospitalisation prepayment', days: 60, uses: 1, policy: 'system_only', so: 50 },
    { kind: 'ipd', label: 'IPD settlement ticket', days: 90, uses: 5, policy: 'system_only', so: 60 },
    { kind: 'emergency', label: 'Emergency (A&E) charges', days: 7, uses: 3, policy: 'system_only', so: 70 },
    { kind: 'general', label: 'General payment ticket (PAY-…)', days: 30, uses: 1, policy: 'system_only', so: 1000 }
  ];

  for (const s of seeds) {
    await pool
      .query(
        `INSERT IGNORE INTO tbl_payment_validity_rule
        (facility_id, payment_kind, label, validity_days, max_uses, interval_policy, sort_order)
        VALUES (?,?,?,?,?,?,?)`,
        [fid, s.kind, s.label, s.days, s.uses, s.policy, s.so]
      )
      .catch(() => {});
  }

  await pool
    .query(
      `UPDATE tbl_payment_validity_rule SET max_uses = 2
       WHERE facility_id = ? AND payment_kind = 'consultation' AND max_uses < 2`,
      [fid]
    )
    .catch(() => {});

  await pool
    .query(
      `UPDATE tbl_payment_validity_rule SET max_uses = 1
       WHERE facility_id = ? AND payment_kind = 'hospitalisation' AND max_uses > 1`,
      [fid]
    )
    .catch(() => {});

  try {
    const [cats] = await pool.query(
      `SELECT DISTINCT LOWER(TRIM(category)) AS cat
       FROM tbl_service_catalog
       WHERE status = 1 AND TRIM(IFNULL(category,'')) <> ''`
    );
    for (const row of cats || []) {
      const cat = String(row.cat || '').trim();
      if (!cat) continue;
      if (['consultation', 'laboratory', 'radiology', 'pharmacy'].includes(cat)) continue;
      const label = cat.charAt(0).toUpperCase() + cat.slice(1) + ' (catalog)';
      await pool
        .query(
          `INSERT IGNORE INTO tbl_payment_validity_rule
          (facility_id, payment_kind, label, validity_days, max_uses, interval_policy, sort_order)
          VALUES (?,?,?,?,?,'system_only',?)`,
          [fid, cat, label, 30, 1, 500]
        )
        .catch(() => {});
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} facilityId
 */
async function listPaymentValidityRules(pool, facilityId) {
  await seedMissingPaymentValidityRules(pool, facilityId);
  const [rows] = await pool.query(
    `SELECT * FROM tbl_payment_validity_rule
     WHERE facility_id = ?
     ORDER BY sort_order ASC, label ASC`,
    [Number(facilityId) || 1]
  );
  return Array.isArray(rows) ? rows : [];
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} row
 */
async function updatePaymentValidityRule(pool, row) {
  const id = parseInt(String(row.id || ''), 10) || 0;
  if (id < 1) throw new Error('Invalid rule id');
  const days = Math.max(1, Math.min(3650, parseInt(String(row.validity_days || 14), 10) || 14));
  const uses = Math.max(1, Math.min(999, parseInt(String(row.max_uses || 1), 10) || 1));
  const pol = String(row.interval_policy || 'system_only');
  const allowed = new Set([
    'system_only',
    'doctor_shortest',
    'doctor_longest',
    'doctor_overrides',
    'system_overrides_doctor'
  ]);
  const policy = allowed.has(pol) ? pol : 'system_only';
  const label = String(row.label || '').trim().slice(0, 255) || 'Payment type';
  await pool.query(
    `UPDATE tbl_payment_validity_rule
     SET label=?, validity_days=?, max_uses=?, interval_policy=?
     WHERE id=? LIMIT 1`,
    [label, days, uses, policy, id]
  );
}

/**
 * Latest consultation before ticket payment with optional follow-up label.
 * @param {import('mysql2/promise').Pool} pool
 */
async function fetchDoctorFollowupDays(pool, patientId, ticketPaidAt) {
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) return null;
  const anchor = ticketPaidAt instanceof Date ? ticketPaidAt : new Date(ticketPaidAt || Date.now());
  const [rows] = await pool
    .query(
      `SELECT observations_json FROM tbl_consultation
       WHERE patient_id = ? AND created_at <= ?
       ORDER BY id DESC LIMIT 1`,
      [pid, anchor]
    )
    .catch(() => [[]]);
  const raw = rows && rows[0] && rows[0].observations_json;
  let obs = {};
  try {
    obs = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
  } catch (_) {
    obs = {};
  }
  return nextConsultationLabelToDays(obs.next_consultation);
}

/**
 * @param {number} systemDays
 * @param {number|null} doctorDays
 * @param {string} policy
 */
function resolveEffectiveDays(systemDays, doctorDays, policy) {
  const sys = Math.max(1, systemDays);
  const doc = doctorDays != null && doctorDays > 0 ? doctorDays : null;
  if (doc == null || policy === 'system_only' || policy === 'system_overrides_doctor') return sys;
  if (policy === 'doctor_overrides') return doc;
  if (policy === 'doctor_shortest') return Math.min(sys, doc);
  if (policy === 'doctor_longest') return Math.max(sys, doc);
  return sys;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Calendar YYYY-MM-DD in the server local timezone — never use `toISOString().slice(0,10)` for this (UTC shifts the day). */
function toLocalDateISO(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * SQL expression normalising a ticket/visit code column (mirrors `/api/payment/validate`).
 * @param {string} col
 */
function normSqlExpr(col) {
  return `
  UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
   TRIM(IFNULL(${col},'')),
   ' ', ''),
   '\u2010', '-'),
   '\u2011', '-'),
   '\u2012', '-'),
   '\u2013', '-'),
   '\u2014', '-'),
   '\u2015', '-'),
   '\u2212', '-'),
   '\u00AD', ''))
 `;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} normalizedCode
 */
/**
 * Count OPD visits registered against a payment code.
 * Follow-up visits created via `/clinical/follow-up-opd` reuse the same code and
 * count as additional registrations — they consume allowance after the first
 * consultation (see `computePaidTicketValidityWindow` excludeFirstConsultation).
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} codeRaw
 * @param {{ excludeVisitId?: number }} [opts]
 */
async function countVisitUsesForCode(pool, codeRaw, opts) {
  opts = opts || {};
  const code = normalizePaymentCodeInput(codeRaw);
  if (!code) return 0;
  const excludeVisitId = parseInt(String(opts.excludeVisitId || ''), 10) || 0;
  const excludeSql = excludeVisitId > 0 ? ' AND id <> ?' : '';
  const params = excludeVisitId > 0 ? [code, excludeVisitId] : [code];
  const [rows] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_opd_visit WHERE ${normSqlExpr('payment_code')} = ?${excludeSql}`,
      params
    )
    .catch(() => [[{ c: 0 }]]);
  return parseInt(String(rows[0]?.c ?? 0), 10) || 0;
}

/**
 * Count ward admissions registered against a hospitalisation (HOS-…) payment code.
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} codeRaw
 * @param {{ excludeAdmissionId?: number }} [opts]
 */
async function countAdmissionUsesForHospitalisationCode(pool, codeRaw, opts) {
  opts = opts || {};
  const code = normalizePaymentCodeInput(codeRaw);
  if (!code) return 0;
  const excludeAdmissionId = parseInt(String(opts.excludeAdmissionId || ''), 10) || 0;
  const excludeSql = excludeAdmissionId > 0 ? ' AND id <> ?' : '';
  const params = excludeAdmissionId > 0 ? [code, excludeAdmissionId] : [code];
  const [rows] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_admission
       WHERE ${normSqlExpr('hos_payment_code')} = ?${excludeSql}`,
      params
    )
    .catch(() => [[{ c: 0 }]]);
  return parseInt(String(rows[0]?.c ?? 0), 10) || 0;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} rawCode
 */
async function findPaidTicketByNormalizedCode(pool, rawCode) {
  const code = normalizePaymentCodeInput(rawCode);
  if (!code) return null;
  let ticketRows = [];
  try {
    ;[ticketRows] = await pool.query(
      `SELECT t.* FROM tbl_payment_ticket t WHERE ${normSqlExpr('t.ticket_code')} = ? LIMIT 1`,
      [code]
    );
  } catch (colErr) {
    ;[ticketRows] = await pool.query(
      `SELECT t.* FROM tbl_payment_ticket t WHERE ${normSqlExpr('t.code')} = ? LIMIT 1`,
      [code]
    );
  }
  if (!ticketRows.length) {
    try {
      ;[ticketRows] = await pool.query(
        `SELECT t.* FROM tbl_payment_ticket t WHERE ${normSqlExpr('t.code')} = ? LIMIT 1`,
        [code]
      );
    } catch (_) {
      ticketRows = [];
    }
  }
  return ticketRows && ticketRows[0] ? ticketRows[0] : null;
}

/**
 * Paid ticket for a patient + normalized code (preferred over code-only lookup).
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} patientId
 * @param {string} rawCode
 */
async function findPaidTicketForPatientAndCode(pool, patientId, rawCode) {
  const code = normalizePaymentCodeInput(rawCode);
  const pid = parseInt(patientId, 10) || 0;
  if (!code) return null;
  if (pid > 0) {
    let rows = [];
    try {
      ;[rows] = await pool.query(
        `SELECT t.* FROM tbl_payment_ticket t
          WHERE t.patient_id = ?
            AND ${normSqlExpr('t.ticket_code')} = ?
            AND LOWER(TRIM(COALESCE(t.status,''))) = 'paid'
          ORDER BY COALESCE(t.paid_at, t.created_at) DESC, t.id DESC
          LIMIT 1`,
        [pid, code]
      );
    } catch (_) {
      rows = [];
    }
    if (rows && rows[0]) return rows[0];
  }
  const tkt = await findPaidTicketByNormalizedCode(pool, code);
  if (!tkt) return null;
  const st = String(tkt.status || '').trim().toLowerCase();
  if (st !== 'paid') return null;
  if (pid > 0 && parseInt(tkt.patient_id, 10) !== pid) return null;
  return tkt;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} facilityId
 * @param {unknown} linesJson
 */
async function loadValidityRuleForTicket(pool, facilityId, linesJson) {
  const fid = Number(facilityId) || 1;
  await seedMissingPaymentValidityRules(pool, fid);
  const kind = inferPaymentKind(linesJson);
  let rule = null;
  const [kindRows] = await pool
    .query(
      `SELECT * FROM tbl_payment_validity_rule
       WHERE facility_id = ? AND payment_kind = ?
       LIMIT 1`,
      [fid, kind]
    )
    .catch(() => [[]]);
  if (kindRows && kindRows[0]) rule = kindRows[0];
  if (!rule) {
    const [defRows] = await pool
      .query(
        `SELECT * FROM tbl_payment_validity_rule
         WHERE facility_id = ? AND payment_kind = 'general'
         LIMIT 1`,
        [fid]
      )
      .catch(() => [[]]);
    rule = defRows && defRows[0] ? defRows[0] : null;
  }
  const systemDays = rule ? parseInt(String(rule.validity_days || 14), 10) || 14 : 14;
  const maxUses = rule ? parseInt(String(rule.max_uses || 1), 10) || 1 : 1;
  const policy = rule ? String(rule.interval_policy || 'system_only') : 'system_only';
  const ruleLabel = rule ? String(rule.label || '').trim() : '';
  return { fid, kind, rule, systemDays, maxUses, policy, ruleLabel: ruleLabel || kind };
}

/** True if value is a non-zero MySQL/JS datetime we can anchor validity on. */
function isUsableTicketDatetime(val) {
  if (val == null || val === '') return false;
  const s = String(val).trim();
  if (!s || s.startsWith('0000-00-00')) return false;
  const d = val instanceof Date ? val : new Date(val);
  return !Number.isNaN(d.getTime());
}

/**
 * Start of validity window: prefer `paid_at`; if missing on paid tickets, use first cashier receipt;
 * avoid `created_at` when it reflects a long-lived **pending** draft (makes codes look expired early).
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} ticket — tbl_payment_ticket row
 */
async function resolvePaidAtAnchorForTicket(pool, ticket) {
  if (isUsableTicketDatetime(ticket.paid_at)) return ticket.paid_at;
  const tid = parseInt(String(ticket.id || ''), 10) || 0;
  if (tid > 0) {
    try {
      const [rows] = await pool.query(
        `SELECT MIN(created_at) AS first_rcpt
         FROM tbl_billing_document
         WHERE source_module = 'payment_ticket' AND source_pk = ? AND status IN ('paid','completed')`,
        [tid]
      );
      const r = rows && rows[0] && rows[0].first_rcpt;
      if (isUsableTicketDatetime(r)) return r;
    } catch (_) {
      /* missing table / column */
    }
  }
  if (isUsableTicketDatetime(ticket.created_at)) return ticket.created_at;
  return new Date();
}

/**
 * Expiry window + use count for a **paid** ticket (registration / slip).
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} ticket
 * @param {string} rawOrNormalizedCode
 * @param {number} facilityId
 * @param {{ excludeVisitId?: number }} [opts]
 */
async function computePaidTicketValidityWindow(pool, ticket, rawOrNormalizedCode, facilityId, opts) {
  opts = opts || {};
  const { kind, rule, systemDays, maxUses, policy, ruleLabel } = await loadValidityRuleForTicket(
    pool,
    facilityId,
    ticket.lines_json
  );
  const paidAt = await resolvePaidAtAnchorForTicket(pool, ticket);
  const doctorDays = await fetchDoctorFollowupDays(pool, ticket.patient_id, paidAt);
  const effectiveDays = resolveEffectiveDays(systemDays, doctorDays, policy);
  const paidDay = startOfDay(paidAt);
  const expires = new Date(paidDay);
  expires.setDate(expires.getDate() + effectiveDays);
  const registrations =
    kind === 'hospitalisation'
      ? await countAdmissionUsesForHospitalisationCode(pool, rawOrNormalizedCode, opts)
      : await countVisitUsesForCode(pool, rawOrNormalizedCode, opts);
  // Consultation-style prepayment: the first OPD visit on this code is covered by the ticket;
  // `max_uses` applies only to registrations after that first consultation.
  const excludeFirstConsultation = kind === 'consultation' || kind === 'general';
  const uses = excludeFirstConsultation ? Math.max(0, registrations - 1) : registrations;
  return {
    kind,
    rule,
    ruleLabel,
    systemDays,
    maxUses,
    policy,
    doctorDays,
    effectiveDays,
    paidDay,
    expires,
    uses
  };
}

/**
 * Data for printing a payment slip (paid or pending).
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} ticket — tbl_payment_ticket row (+ optional .lines parsed)
 * @param {number} [facilityId]
 */
async function getSlipValidityDisplay(pool, ticket, facilityId) {
  const fid = facilityId != null ? Number(facilityId) || 1 : Number(ticket.facility_id) || 1;
  const st = String(ticket.status || '').trim().toLowerCase();
  const linesJson = ticket.lines_json;
  const { kind, ruleLabel, systemDays, maxUses } = await loadValidityRuleForTicket(pool, fid, linesJson);
  const usesTimeValidity = kindUsesConsultationValidity(kind);

  if (st !== 'paid') {
    return {
      pending_payment: true,
      payment_kind: kind,
      rule_label: ruleLabel,
      validity_days: usesTimeValidity ? systemDays : null,
      max_uses: maxUses,
      expires_dd_mm_yy: null,
      remaining_uses: maxUses,
      uses_time_validity: usesTimeValidity,
    };
  }

  const code = ticket.ticket_code || ticket.code || '';
  const v = await computePaidTicketValidityWindow(pool, ticket, code, fid);
  const remainingUses = Math.max(0, v.maxUses - v.uses);

  if (!usesTimeValidity) {
    return {
      pending_payment: false,
      payment_kind: v.kind,
      rule_label: v.ruleLabel,
      uses_time_validity: false,
      expires_on: null,
      expires_display: null,
      expires_month_year: null,
      expires_dd_mm_yy: null,
      validity_days_effective: null,
      validity_days_system: null,
      max_uses: v.maxUses,
      uses_so_far: v.uses,
      remaining_uses: remainingUses,
      doctor_followup_days: null,
      interval_policy: null,
    };
  }

  const exp = v.expires;
  const dd = String(exp.getDate()).padStart(2, '0');
  const mm = String(exp.getMonth() + 1).padStart(2, '0');
  const yy = String(exp.getFullYear()).slice(-2);
  const expiresDdMmYy = `${dd}:${mm}:${yy}`;
  const expiresMonthYear = hmsFormatDate.formatMonthYear(exp);
  const expiresDisplay = hmsFormatDate.formatDisplayDate(exp);
  return {
    pending_payment: false,
    payment_kind: v.kind,
    rule_label: v.ruleLabel,
    uses_time_validity: true,
    expires_on: toLocalDateISO(v.expires),
    expires_display: expiresDisplay,
    expires_month_year: expiresMonthYear,
    expires_dd_mm_yy: expiresDdMmYy,
    validity_days_effective: v.effectiveDays,
    validity_days_system: v.systemDays,
    max_uses: v.maxUses,
    uses_so_far: v.uses,
    remaining_uses: remainingUses,
    doctor_followup_days: v.doctorDays,
    interval_policy: v.policy
  };
}

/**
 * Short English notice when a code is valid (Front Desk, wards, API).
 * @param {object} meta — from assertPaidTicketValidityForVisit.meta
 */
function buildValidCodeSummary(meta) {
  if (!meta) return 'Payment code is valid.';
  if (meta.uses_time_validity === false) return 'Payment code is valid.';
  const max = meta.max_uses != null ? Number(meta.max_uses) : 1;
  const used = meta.uses_so_far != null ? Number(meta.uses_so_far) : 0;
  const left = Math.max(0, max - used);
  const expRaw = String(meta.expires_on || meta.expires_display || '');
  const expDisplay = expRaw ? hmsFormatDate.formatDisplayDate(expRaw) : '—';
  const useWord = left === 1 ? 'use' : 'uses';
  return `Valid until ${expDisplay} · ${left} ${useWord} remaining.`;
}

/**
 * Short bilingual notice for API / UI when a code is valid.
 * @param {object} meta — from assertPaidTicketValidityForVisit.meta
 */
function buildPatientValidityNotice(meta) {
  if (!meta) return '';
  if (meta.uses_time_validity === false) return '';
  const kind = String(meta.payment_kind || 'general');
  const exp = String(meta.expires_on || '');
  const d = meta.validity_days_effective != null ? Number(meta.validity_days_effective) : 14;
  const max = meta.max_uses != null ? Number(meta.max_uses) : 1;
  const used = meta.uses_so_far != null ? Number(meta.uses_so_far) : 0;
  const left = Math.max(0, max - used);
  const expFr = exp ? hmsFormatDate.formatDisplayDate(exp) : '';

  if ((kind === 'consultation' || kind === 'general') && max <= 1) {
    return (
      `FR: La première consultation enregistrée avec ce code ne compte pas dans la limite. ` +
      `Jusqu'à ${max} enregistrement(s) OPD supplémentaire(s) dans les ${d} jour(s) après paiement (au plus tard le ${expFr}). ` +
      `EN: Your first consultation on this code does not use an allowance slot. ` +
      `Up to ${max} further OPD registration(s) within ${d} day(s) after payment (until ${exp || '—'}).`
    );
  }
  return (
    `FR: Code valide jusqu'au ${expFr} (${d} jour(s) après paiement) · ${left} utilisation(s) restante(s) sur ${max}. ` +
    `EN: Valid until ${exp || '—'} (${d} day(s) after payment) · ${left} of ${max} use(s) remaining.`
  );
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} ticket — row from tbl_payment_ticket
 * @param {string} rawOrNormalizedCode
 * @param {number} [facilityId]
 * @param {{ excludeVisitId?: number }} [opts]
 */
async function assertPaidTicketValidityForVisit(pool, ticket, rawOrNormalizedCode, facilityId, opts) {
  const lang = opts?.lang || hmsI18n.DEFAULT_LANG;
  const st = String(ticket.status || '').trim().toLowerCase();
  if (st !== 'paid') {
    return {
      ok: false,
      error: st === 'pending' ? paymentCodeMessages.msg('PENDING', lang) : paymentCodeMessages.msg('NOT_PAID', lang),
    };
  }

  const fid = facilityId != null ? Number(facilityId) || 1 : Number(ticket.facility_id) || 1;
  const v = await computePaidTicketValidityWindow(pool, ticket, rawOrNormalizedCode, fid, opts);
  const today = startOfDay(new Date());
  const usesTimeValidity = kindUsesConsultationValidity(v.kind);
  if (usesTimeValidity && today > v.expires) {
    return {
      ok: false,
      error: paymentCodeMessages.msg('EXPIRED', lang),
    };
  }

  if (v.uses >= v.maxUses) {
    return {
      ok: false,
      consumed: true,
      error:
        v.maxUses <= 1
          ? paymentCodeMessages.msg('ALREADY_VALIDATED', lang)
          : paymentCodeMessages.msg('USAGE_LIMIT', lang),
    };
  }

  const remainingUses = Math.max(0, v.maxUses - v.uses);
  const expiresIso = usesTimeValidity ? toLocalDateISO(v.expires) : null;
  const meta = {
    payment_kind: v.kind,
    uses_time_validity: usesTimeValidity,
    validity_days_system: usesTimeValidity ? v.systemDays : null,
    validity_days_effective: usesTimeValidity ? v.effectiveDays : null,
    doctor_followup_days: usesTimeValidity ? v.doctorDays : null,
    interval_policy: usesTimeValidity ? v.policy : null,
    max_uses: v.maxUses,
    uses_so_far: v.uses,
    remaining_uses: remainingUses,
    expires_on: expiresIso,
    expires_display: expiresIso ? hmsFormatDate.formatDisplayDate(expiresIso) : null,
  };

  const paidOkMsg = hmsI18n.t('payment.paid_valid', lang, {
    ns: 'errors',
    defaultValue: 'Payment code is valid.',
  });

  return {
    ok: true,
    meta,
    validity_message: usesTimeValidity ? paymentCodeMessages.validSummary(meta, lang) : paidOkMsg,
    patient_notice: usesTimeValidity ? buildPatientValidityNotice(meta) : '',
  };
}

/** Human label for `interval_policy` (matches `views/payment-validity.ejs`). */
function intervalPolicyLabel(policy) {
  const p = String(policy || 'system_only');
  const labels = {
    system_only: 'System only',
    doctor_shortest: 'Doctor + system (shortest)',
    doctor_longest: 'Doctor + system (longest)',
    doctor_overrides: 'Doctor overrides',
    system_overrides_doctor: 'System overrides doctor'
  };
  return labels[p] || p;
}

module.exports = {
  ensurePaymentValiditySchema,
  seedMissingPaymentValidityRules,
  listPaymentValidityRules,
  updatePaymentValidityRule,
  inferPaymentKind,
  kindUsesConsultationValidity,
  assertPaidTicketValidityForVisit,
  computePaidTicketValidityWindow,
  getSlipValidityDisplay,
  buildPatientValidityNotice,
  buildValidCodeSummary,
  loadValidityRuleForTicket,
  parseLines,
  nextConsultationLabelToDays,
  findPaidTicketByNormalizedCode,
  findPaidTicketForPatientAndCode,
  countVisitUsesForCode,
  countAdmissionUsesForHospitalisationCode,
  normalizePaymentCodeInput,
  toLocalDateISO,
  intervalPolicyLabel
};
