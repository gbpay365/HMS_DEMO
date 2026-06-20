'use strict';

const betterPayQr = require('./betterPayQr');
const betterPayPayment = require('./betterPayPayment');
const { allocateUniquePaymentCode } = require('./paymentTicketCode');
const {
  catalogItemNeedsDoctor,
  effectivePrepayServiceType,
  doctorFilterDepartment,
  isGeneralConsultationService,
  isSpecialistConsultationService,
  doctorMatchesGeneralConsultation,
  doctorMatchesSpecialistConsultation,
} = require('./cashierConsultServices');

const PAYMENT_NOT_RECEIVED_MSG = 'Ticket cannot be issued, payment not received';

function prepayBodySnapshot(body) {
  body = coalescePrepayBody(body);
  const snap = {
    prepay_patient_id: body.prepay_patient_id,
    prepay_payment_method: 'BetterPay',
    manual_insurance_check: body.manual_insurance_check,
    manual_insurance_pct: body.manual_insurance_pct,
    prepay_betterpay_ref: body.prepay_betterpay_ref,
  };
  const lines = parsePrepayLineRequests(body);
  if (lines.length) {
    snap.prepay_lines = lines;
    if (lines.length === 1) {
      snap.prepay_service_type = lines[0].prepay_service_type;
      snap.prepay_catalog_id = lines[0].prepay_catalog_id;
      snap.prepay_assigned_doctor_id = lines[0].prepay_assigned_doctor_id;
      snap.prepay_specialist_spec = lines[0].prepay_specialist_spec;
    }
  } else {
    snap.prepay_service_type = body.prepay_service_type;
    snap.prepay_catalog_id = body.prepay_catalog_id;
    snap.prepay_assigned_doctor_id = body.prepay_assigned_doctor_id;
    snap.prepay_specialist_spec = body.prepay_specialist_spec;
  }
  return snap;
}

function extractBracketPrepayLines(body) {
  if (!body || typeof body !== 'object') return [];
  const lines = [];
  for (const key of Object.keys(body)) {
    const m = key.match(/^prepay_lines\[(\d+)\]\[(.+)\]$/);
    if (!m) continue;
    const idx = parseInt(m[1], 10);
    if (!lines[idx]) lines[idx] = {};
    lines[idx][m[2]] = body[key];
  }
  return lines.filter(Boolean);
}

function coalescePrepayBody(body) {
  if (!body || typeof body !== 'object') return body;
  const fromJson = normalizePrepayLinesRaw(body.prepay_lines);
  const fromBrackets = extractBracketPrepayLines(body);
  const merged = fromJson.length ? fromJson : fromBrackets;
  if (merged.length) {
    return { ...body, prepay_lines: merged };
  }
  return body;
}

function normalizePrepayLinesRaw(raw) {
  if (raw == null || raw === '') return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return [];
    }
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw.trim());
      } catch {
        return [];
      }
    }
  }
  if (Array.isArray(raw)) {
    return raw.map((row) => {
      if (typeof row === 'string') {
        try {
          return JSON.parse(row);
        } catch {
          return null;
        }
      }
      return row && typeof row === 'object' ? row : null;
    }).filter(Boolean);
  }
  if (raw && typeof raw === 'object') {
    const keys = Object.keys(raw).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
    if (keys.length) {
      return keys.map((k) => raw[k]).filter((row) => row && typeof row === 'object');
    }
  }
  return [];
}

function normalizePrepayCatalogId(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s || s === 'undefined' || s === 'null') return '';
  return s;
}

function parsePrepayLineRequests(body) {
  const normalized = normalizePrepayLinesRaw(body?.prepay_lines);
  if (normalized.length) {
    return normalized.map((row) => ({
      prepay_service_type: row.prepay_service_type || row.service_type || row.serviceType,
      prepay_catalog_id: normalizePrepayCatalogId(
        row.prepay_catalog_id ?? row.catalog_id ?? row.catalogId ?? row.service_id ?? row.serviceId
      ),
      prepay_assigned_doctor_id: row.prepay_assigned_doctor_id || row.assigned_doctor_id || row.doctorId,
      prepay_specialist_spec: row.prepay_specialist_spec || row.specialist_spec || row.specialistSpec,
      prepay_static_name: row.prepay_static_name,
      prepay_static_price: row.prepay_static_price,
      prepay_static_dept: row.prepay_static_dept,
    })).filter((row) => row.prepay_catalog_id);
  }
  const catalogId = normalizePrepayCatalogId(body?.prepay_catalog_id);
  if (catalogId) {
    return [{
      prepay_service_type: body.prepay_service_type,
      prepay_catalog_id: catalogId,
      prepay_assigned_doctor_id: body.prepay_assigned_doctor_id,
      prepay_specialist_spec: body.prepay_specialist_spec,
      prepay_static_name: body.prepay_static_name,
      prepay_static_price: body.prepay_static_price,
      prepay_static_dept: body.prepay_static_dept,
    }];
  }
  return [];
}

async function resolveCoveragePct(pool, pid, body) {
  if (body.manual_insurance_check && body.manual_insurance_pct) {
    return Math.min(100, Math.max(0, parseInt(body.manual_insurance_pct, 10) || 0));
  }
  const today = new Date().toISOString().split('T')[0];
  const [insRows] = await pool
    .query(
      `SELECT insurer_covered_percent FROM tbl_patient_insurance
       WHERE patient_id = ? AND is_primary = 1
       AND (effective_from IS NULL OR effective_from <= ?)
       AND (effective_to IS NULL OR effective_to >= ?)
       LIMIT 1`,
      [pid, today, today]
    )
    .catch(() => [[]]);
  if (insRows && insRows.length > 0) return parseInt(insRows[0].insurer_covered_percent || 0, 10) || 0;
  return 0;
}

async function loadPrepayCatalogRow(pool, lineReq) {
  const rawCatalogId = normalizePrepayCatalogId(lineReq.prepay_catalog_id);
  if (!rawCatalogId) {
    return { ok: false, error: 'Select a valid service from the catalog', status: 400 };
  }
  const catalogId = parseInt(rawCatalogId, 10) || 0;
  const isStaticHosp = rawCatalogId.startsWith('hosp-');
  if (catalogId < 1 && !isStaticHosp) {
    return { ok: false, error: 'Select a valid service from the catalog', status: 400 };
  }
  if (isStaticHosp) {
    return {
      ok: true,
      catalogId: null,
      cat: {
        id: null,
        name: String(lineReq.prepay_static_name || 'Hospitalisation Service').trim(),
        price: parseFloat(lineReq.prepay_static_price || 0),
        department_name: String(lineReq.prepay_static_dept || 'Admissions').trim(),
      },
    };
  }
  const [catRows] = await pool.query(
    'SELECT * FROM tbl_service_catalog WHERE id = ? AND status = 1 LIMIT 1',
    [catalogId]
  );
  if (!catRows.length) return { ok: false, error: 'Service not found in catalog', status: 400 };
  return { ok: true, catalogId, cat: catRows[0] };
}

async function validatePrepayDoctor(pool, cat, lineReq) {
  const serviceName = cat.name || 'Service';
  const needsDoctor = catalogItemNeedsDoctor(cat);
  const doctorId = parseInt(lineReq.prepay_assigned_doctor_id, 10) || 0;
  const specialistSpec = String(lineReq.prepay_specialist_spec || '').trim();
  const dept = (cat.department_name || '').trim();

  if (!needsDoctor) {
    return { ok: true, needsDoctor: false, doctorId: 0, specialistSpec: null, assignedDoctorName: null };
  }
  if (doctorId < 1) {
    return { ok: false, error: 'Select an assigned physician', status: 400 };
  }

  const { employeeMatchesDepartment, employeeMatchesSpecialisation } = require('./hmsDoctorClinicalFilter');
  const hmsDoctorStaff = require('./hmsDoctorStaff');

  if (isSpecialistConsultationService(serviceName)) {
    if (!specialistSpec) return { ok: false, error: 'Select specialist specialisation', status: 400 };
    const specOk = await employeeMatchesSpecialisation(pool, doctorId, specialistSpec);
    if (!specOk) return { ok: false, error: 'Physician does not match specialisation', status: 400 };
  } else if (isGeneralConsultationService(serviceName)) {
    const doctors = await hmsDoctorStaff.fetchActiveDoctorsWithClinicalLinks(
      pool,
      'e.id, e.first_name, e.last_name, COALESCE(e.specialisation,"") AS specialisation, COALESCE(e.primary_department,"") AS primary_department'
    );
    const doc = (doctors || []).find((d) => parseInt(d.id, 10) === doctorId);
    if (!doc || !doctorMatchesGeneralConsultation(doc)) {
      return { ok: false, error: 'Physician not eligible for general consultation', status: 400 };
    }
  } else {
    const filterDept = doctorFilterDepartment(serviceName, dept);
    if (filterDept) {
      const deptOk = await employeeMatchesDepartment(pool, doctorId, filterDept);
      if (!deptOk) {
        return { ok: false, error: `Physician not assigned to ${filterDept}`, status: 400 };
      }
    }
  }

  const [[docRow]] = await pool.query(
    'SELECT first_name, last_name FROM tbl_employee WHERE id = ? AND status = 1 LIMIT 1',
    [doctorId]
  );
  const assignedDoctorName = docRow
    ? `${docRow.first_name || ''} ${docRow.last_name || ''}`.trim() || null
    : null;

  return {
    ok: true,
    needsDoctor: true,
    doctorId,
    specialistSpec: /specialist\s+consultation/i.test(String(serviceName || '')) ? specialistSpec || null : null,
    assignedDoctorName,
  };
}

async function buildPrepayTicketLine(pool, lineReq, ctx) {
  let serviceType = ['consultation', 'laboratory', 'radiology', 'hospitalisation', 'maternity', 'surgery', 'scan'].includes(
    lineReq.prepay_service_type
  )
    ? lineReq.prepay_service_type
    : 'hospitalisation';
  if (serviceType === 'scan') serviceType = 'radiology';

  const loaded = await loadPrepayCatalogRow(pool, lineReq);
  if (!loaded.ok) return loaded;
  const { catalogId, cat } = loaded;

  const doctorCheck = await validatePrepayDoctor(pool, cat, lineReq);
  if (!doctorCheck.ok) return doctorCheck;

  const resolvedType = effectivePrepayServiceType(cat, serviceType);
  const basePrice = parseFloat(cat.price || 0);
  const serviceName = cat.name || 'Service';
  const dept = (cat.department_name || '').trim();
  const insurerAmount = Math.round(basePrice * ctx.coveragePct / 100);
  const patientDue = basePrice - insurerAmount;

  return {
    ok: true,
    line: {
      kind: resolvedType,
      description: serviceName,
      department: dept,
      unit_price: basePrice,
      list_unit_price: basePrice,
      quantity: 1,
      insurer_amount: insurerAmount,
      patient_due: patientDue,
      catalog_id: catalogId,
      payment_method: ctx.payMethod,
      assigned_doctor_id: doctorCheck.needsDoctor ? doctorCheck.doctorId : null,
      assigned_doctor_name: doctorCheck.assignedDoctorName,
      specialist_spec: doctorCheck.specialistSpec,
    },
    serviceName,
    resolvedType,
  };
}

async function ensurePendingPaymentTicket(pool, ctx, session) {
  const fid = session?.facilityId || 1;
  const userId = session?.userId || session?.user?.id || null;
  const amtDue = parseFloat(ctx.patientDue) || 0;
  await pool.query('ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS payment_method VARCHAR(40) DEFAULT NULL').catch(() => {});

  const [existing] = await pool.query(
    'SELECT id, status FROM tbl_payment_ticket WHERE ticket_code = ? LIMIT 1',
    [ctx.ticket_code]
  );
  if (existing.length) {
    if (String(existing[0].status) === 'paid') {
      return { ok: false, error: 'This payment reference is already settled', status: 409 };
    }
    await pool.query(
      `UPDATE tbl_payment_ticket
       SET patient_id = ?, total_amount = ?, status = 'pending', payment_method = 'BetterPay',
           lines_json = ?, created_by = COALESCE(created_by, ?), created_at = COALESCE(created_at, NOW()),
           source_module = COALESCE(source_module, ?), source_pk = COALESCE(source_pk, ?),
           maternity_event = COALESCE(maternity_event, ?)
       WHERE ticket_code = ?`,
      [
        ctx.pid,
        amtDue,
        JSON.stringify(ctx.lines),
        userId,
        ctx.maternityPatientId ? 'maternity' : null,
        ctx.maternityPatientId || null,
        ctx.maternityEvent || null,
        ctx.ticket_code,
      ]
    );
    return { ok: true, ticket_id: existing[0].id };
  }

  const [ins] = await pool.query(
    `INSERT INTO tbl_payment_ticket
     (facility_id, ticket_code, patient_id, total_amount, status, payment_method, lines_json, created_by, created_at,
      source_module, source_pk, maternity_event)
     VALUES (?, ?, ?, ?, 'pending', 'BetterPay', ?, ?, NOW(), ?, ?, ?)`,
    [
      fid,
      ctx.ticket_code,
      ctx.pid,
      amtDue,
      JSON.stringify(ctx.lines),
      userId,
      ctx.maternityPatientId ? 'maternity' : null,
      ctx.maternityPatientId || null,
      ctx.maternityEvent || null,
    ]
  );
  return { ok: true, ticket_id: ins.insertId };
}

/**
 * Validate prepay form body and compute ticket lines / amount.
 * @returns {Promise<{ ok: true, ... } | { ok: false, error: string, status?: number }>}
 */
async function resolvePrepayContext(pool, body) {
  body = coalescePrepayBody(body);
  const maternityPatientId = parseInt(body.prepay_maternity_patient_id, 10) || 0;
  const maternityEvent = String(body.prepay_maternity_event || '').trim() || null;
  const lineRequests = parsePrepayLineRequests(body);

  let pid = parseInt(body.prepay_patient_id, 10) || 0;
  const payMethod = betterPayQr.normalizePaymentMethod(body.prepay_payment_method || 'Cash');

  if (pid < 1) return { ok: false, error: 'Select a valid patient', status: 400 };
  if (!lineRequests.length) {
    return { ok: false, error: 'Add at least one service to the ticket', status: 400 };
  }

  const coveragePct = await resolveCoveragePct(pool, pid, body);
  const lines = [];
  let patientDue = 0;
  let primaryServiceType = null;
  const serviceNames = [];

  for (const lineReq of lineRequests) {
    const built = await buildPrepayTicketLine(pool, lineReq, { coveragePct, payMethod });
    if (!built.ok) return built;
    lines.push(built.line);
    patientDue += parseFloat(built.line.patient_due) || 0;
    serviceNames.push(built.serviceName);
    if (!primaryServiceType) primaryServiceType = built.resolvedType;
  }

  const matBilling = require('./maternityBilling');
  pid = await matBilling.resolveBillingPatientId(pool, pid, { name: serviceNames[0] });

  let resolvedMaternityId = maternityPatientId;
  if (resolvedMaternityId < 1 && lineRequests.some((r) => r.prepay_service_type === 'maternity')) {
    const lookupPid = parseInt(body.prepay_patient_id, 10) || pid;
    const [[mp]] = await pool
      .query('SELECT id FROM maternity_patients WHERE patient_id = ? ORDER BY id DESC LIMIT 1', [lookupPid])
      .catch(() => [[null]]);
    resolvedMaternityId = parseInt(mp?.id, 10) || 0;
  }

  const existingRef = String(body.prepay_betterpay_ref || '').trim();
  let ticket_code;
  if (existingRef && payMethod === 'BetterPay') {
    ticket_code = existingRef;
  } else {
    ticket_code = await allocateUniquePaymentCode(pool, lines.length > 1 ? lines : (primaryServiceType || lines[0]?.kind));
  }

  const [[patient]] = await pool.query(
    'SELECT id, first_name, last_name, phone, patient_code FROM tbl_patient WHERE id = ? LIMIT 1',
    [pid]
  );

  const serviceName = serviceNames.length === 1
    ? serviceNames[0]
    : `${serviceNames.length} services`;

  return {
    ok: true,
    pid,
    payMethod,
    ticket_code,
    patientDue,
    lines,
    patient: patient || { id: pid },
    serviceName,
    maternityPatientId: resolvedMaternityId > 0 ? resolvedMaternityId : null,
    maternityEvent,
  };
}

/**
 * Issue a paid prepay ticket after payment verification (Wallet / BetterPay).
 */
async function issuePrepayTicket(pool, ctx, session) {
  const fid = session.facilityId || 1;
  const userId = session.userId || session.user?.id || null;
  const payMethod = ctx.payMethod;
  const amtDue = parseFloat(ctx.patientDue) || 0;

  await pool.query('ALTER TABLE tbl_payment_ticket ADD COLUMN IF NOT EXISTS payment_method VARCHAR(40) DEFAULT NULL').catch(() => {});

  if (payMethod === 'BetterPay') {
    if (!(await betterPayQr.isBetterPayConfigured(pool))) {
      return { ok: false, error: betterPayQr.NOT_CONFIGURED_MSG, status: 400 };
    }
    const paidCheck = await betterPayPayment.assertPaidForAmount(pool, ctx.ticket_code, amtDue);
    if (!paidCheck.ok) {
      return { ok: false, error: PAYMENT_NOT_RECEIVED_MSG, status: 402 };
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let walletHold = null;
    let walletNewBal = null;

    if (payMethod === 'Wallet') {
      const [[wallet]] = await conn.query(
        `SELECT id, balance FROM tbl_patient_wallet
         WHERE patient_id = ? AND status = 'active'
         FOR UPDATE`,
        [ctx.pid]
      );
      if (!wallet) {
        await conn.rollback();
        return { ok: false, error: PAYMENT_NOT_RECEIVED_MSG, status: 402 };
      }
      const walletBal = parseFloat(wallet.balance);
      if (walletBal < amtDue) {
        await conn.rollback();
        return { ok: false, error: PAYMENT_NOT_RECEIVED_MSG, status: 402 };
      }
      walletHold = wallet;
      walletNewBal = walletBal - amtDue;
    }

    const [pendingRows] = await conn.query(
      `SELECT id, status FROM tbl_payment_ticket WHERE ticket_code = ? LIMIT 1 FOR UPDATE`,
      [ctx.ticket_code]
    );
    let newTicketId;
    if (pendingRows.length && String(pendingRows[0].status) === 'pending') {
      newTicketId = pendingRows[0].id;
      await conn.query(
        `UPDATE tbl_payment_ticket
         SET total_amount = ?, status = 'paid', payment_method = ?, lines_json = ?, paid_at = NOW(), created_by = COALESCE(created_by, ?)
         WHERE id = ?`,
        [amtDue, payMethod, JSON.stringify(ctx.lines), userId, newTicketId]
      );
    } else if (!pendingRows.length) {
      const [insResult] = await conn.query(
        `INSERT INTO tbl_payment_ticket
         (facility_id, ticket_code, patient_id, total_amount, status, payment_method, lines_json, created_by, paid_at, created_at)
         VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, NOW(), NOW())`,
        [fid, ctx.ticket_code, ctx.pid, amtDue, payMethod, JSON.stringify(ctx.lines), userId]
      );
      newTicketId = insResult.insertId;
    } else {
      await conn.rollback();
      return { ok: false, error: 'Payment reference already used', status: 409 };
    }

    if (payMethod === 'Wallet' && walletHold) {
      await conn.query('UPDATE tbl_patient_wallet SET balance = ? WHERE id = ?', [walletNewBal, walletHold.id]);
      await conn.query(
        `INSERT INTO tbl_patient_wallet_txn
         (wallet_id, txn_type, direction, amount, balance_after, reference_id, notes, created_by)
         VALUES (?, 'deduct_cashier', 'dr', ?, ?, ?, ?, ?)`,
        [walletHold.id, amtDue, walletNewBal, String(newTicketId), `Payment ticket ${ctx.ticket_code}`, userId]
      );
    }

    await conn.commit();

    if (ctx.maternityPatientId) {
      await require('./maternityBilling')
        .tagMaternityTicket(conn, newTicketId, ctx.maternityPatientId, ctx.maternityEvent)
        .catch(() => {});
    }

    return { ok: true, ticket_code: ctx.ticket_code, ticket_id: newTicketId };
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

async function startBetterPayPayment(pool, body, session = {}) {
  const ctx = await resolvePrepayContext(pool, body);
  if (!ctx.ok) return ctx;
  if (ctx.payMethod !== 'BetterPay') {
    return { ok: false, error: 'Payment method must be BetterPay', status: 400 };
  }
  if (!(await betterPayQr.isBetterPayConfigured(pool))) {
    return { ok: false, error: betterPayQr.NOT_CONFIGURED_MSG, status: 400 };
  }
  if ((parseFloat(ctx.patientDue) || 0) <= 0) {
    return { ok: false, error: 'Amount must be greater than zero', status: 400 };
  }

  const paymentUrl = await betterPayQr.buildBetterPayPaymentUrl(pool, {
    ref: ctx.ticket_code,
    amount: ctx.patientDue,
    first_name: ctx.patient.first_name,
    last_name: ctx.patient.last_name,
    phone: ctx.patient.phone,
    patient_code: ctx.patient.patient_code,
    patient_id: ctx.patient.id,
    lines: ctx.lines,
    description: ctx.serviceName,
  });

  if (!paymentUrl) {
    return { ok: false, error: betterPayQr.NOT_CONFIGURED_MSG, status: 400 };
  }

  const ticketOut = await ensurePendingPaymentTicket(pool, ctx, session);
  if (!ticketOut.ok) return ticketOut;

  await betterPayPayment.upsertPending(pool, {
    ref: ctx.ticket_code,
    patientId: ctx.pid,
    amount: ctx.patientDue,
    meta: {
      service: ctx.serviceName,
      payment_url: paymentUrl,
      prepay: prepayBodySnapshot(body),
      patient_name: betterPayQr.patientFullName(ctx.patient),
    },
  });

  return {
    ok: true,
    ref: ctx.ticket_code,
    paymentUrl,
    amount: ctx.patientDue,
    patientName: betterPayQr.patientFullName(ctx.patient),
    serviceName: ctx.serviceName,
    timeoutSec: betterPayPayment.WAIT_TIMEOUT_SEC,
  };
}

async function markBetterPayTimeout(pool, ref) {
  const refStr = String(ref || '').trim();
  if (!refStr) return { ok: false, error: 'Missing ref', status: 400 };
  const row = await betterPayPayment.getRow(pool, refStr);
  if (!row) return { ok: false, error: 'Payment not found', status: 404 };
  if (String(row.status).toLowerCase() === 'paid') {
    return { ok: true, status: 'paid', alreadyPaid: true };
  }
  await betterPayPayment.markTimeout(pool, refStr);
  return { ok: true, status: 'timeout' };
}

async function retryBetterPayPayment(pool, ref) {
  const refStr = String(ref || '').trim();
  if (!refStr) return { ok: false, error: 'Missing ref', status: 400 };
  const row = await betterPayPayment.getRow(pool, refStr);
  if (!row) return { ok: false, error: 'Payment not found', status: 404 };
  const st = String(row.status).toLowerCase();
  if (st === 'paid') return { ok: false, error: 'Payment already received', status: 409 };
  if (!['timeout', 'failed', 'pending'].includes(st)) {
    return { ok: false, error: 'Payment cannot be retried', status: 400 };
  }

  const meta = betterPayPayment.parseMeta(row);
  const prepay = meta.prepay || {};
  prepay.prepay_betterpay_ref = refStr;
  prepay.prepay_payment_method = 'BetterPay';

  const ctx = await resolvePrepayContext(pool, prepay);
  if (!ctx.ok) return ctx;

  const paymentUrl = await betterPayQr.buildBetterPayPaymentUrl(pool, {
    ref: ctx.ticket_code,
    amount: ctx.patientDue,
    first_name: ctx.patient.first_name,
    last_name: ctx.patient.last_name,
    phone: ctx.patient.phone,
    patient_code: ctx.patient.patient_code,
    patient_id: ctx.patient.id,
    lines: ctx.lines,
    description: ctx.serviceName,
  });
  if (!paymentUrl) return { ok: false, error: betterPayQr.NOT_CONFIGURED_MSG, status: 400 };

  await betterPayPayment.resetForRetry(pool, refStr, {
    ...meta,
    payment_url: paymentUrl,
    service: ctx.serviceName,
  });

  await pool.query(
    `UPDATE tbl_payment_ticket SET status = 'pending', payment_method = 'BetterPay', total_amount = ?, lines_json = ?
     WHERE ticket_code = ? AND status IN ('pending')`,
    [ctx.patientDue, JSON.stringify(ctx.lines), refStr]
  ).catch(() => {});

  return {
    ok: true,
    ref: refStr,
    paymentUrl,
    amount: ctx.patientDue,
    patientName: betterPayQr.patientFullName(ctx.patient),
    serviceName: ctx.serviceName,
    prepay,
    timeoutSec: betterPayPayment.WAIT_TIMEOUT_SEC,
  };
}

async function getBetterPayRetryInfo(pool, ref) {
  const refStr = String(ref || '').trim();
  const row = await betterPayPayment.getRow(pool, refStr);
  if (!row) return { ok: false, error: 'Payment not found', status: 404 };
  const meta = betterPayPayment.parseMeta(row);
  return {
    ok: true,
    ref: refStr,
    status: row.status,
    amount: parseFloat(row.amount) || 0,
    paymentUrl: meta.payment_url || null,
    serviceName: meta.service || null,
    patientName: meta.patient_name || null,
    prepay: meta.prepay || null,
  };
}

module.exports = {
  PAYMENT_NOT_RECEIVED_MSG,
  resolvePrepayContext,
  issuePrepayTicket,
  startBetterPayPayment,
  markBetterPayTimeout,
  retryBetterPayPayment,
  getBetterPayRetryInfo,
  ensurePendingPaymentTicket,
};
