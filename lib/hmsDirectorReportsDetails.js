'use strict';

const { defaultRangeForSection } = require('./hmsDirectorReportsPeriod');
const { formatMoney: hmsFormatMoney } = require('./hmsMoneyFormat');

/** Report id → detail dataset type */
const REPORT_DETAIL_TYPES = Object.freeze({
  daily_txn: 'transactions',
  weekly_txn: 'transactions',
  monthly_pl: 'transactions',
  daily_revenue: 'transactions',
  daily_expense: 'expenses',
  monthly_expenses: 'expenses',
  census: 'census_flow',
  opd_emergency: 'opd_visits',
  pharmacy: 'pharmacy_dispenses',
  theatre: 'surgeries',
  clinical_alerts: 'deaths',
  patient_flow: 'admissions',
  lab_radiology: 'lab_and_radiology',
  quality_safety: 'deaths',
  supply_inventory: 'inventory_movements',
  dept_activity: 'dept_activity',
  clinical_performance: 'deaths',
  weekly_financial: 'transactions',
  laboratory: 'lab_tests',
  radiology: 'radiology_exams',
  ipd: 'ipd_charges',
  icu: 'icu_inpatients',
  emergency: 'opd_emergency_visits',
  hr_staffing: 'leave_requests',
  weekly_procurement: 'purchase_orders',
  monthly_ar: 'payment_tickets',
  dietary: 'dietary_charges',
});

/** Which section default range applies when no explicit periodRange */
const REPORT_RANGE_SECTION = Object.freeze({
  daily_txn: 'daily',
  weekly_txn: 'weekly',
  monthly_pl: 'monthly',
  daily_revenue: 'daily',
  daily_expense: 'daily',
  monthly_expenses: 'monthly',
  census: 'daily',
  opd_emergency: 'daily',
  pharmacy: 'daily',
  theatre: 'daily',
  clinical_alerts: 'daily',
  patient_flow: 'weekly',
  lab_radiology: 'weekly',
  quality_safety: 'weekly',
  supply_inventory: 'weekly',
  dept_activity: 'monthly',
  clinical_performance: 'monthly',
  weekly_financial: 'weekly',
  laboratory: 'financial',
  radiology: 'financial',
  ipd: 'financial',
  icu: 'financial',
  emergency: 'financial',
  hr_staffing: 'weekly',
  weekly_procurement: 'financial',
  monthly_ar: 'monthly',
  dietary: 'financial',
});

const DETAIL_LIMIT = 500;

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtMoney(v) {
  return hmsFormatMoney(v);
}

function fmtInt(v) {
  return n(v).toLocaleString('en-GB');
}

const { formatDisplayDate: fmtDate } = require('./hmsFormatDate');

function fmtTime(dt) {
  if (!dt) return '';
  const x = dt instanceof Date ? dt : new Date(dt);
  if (Number.isNaN(x.getTime())) return '';
  return x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function parseDescription(desc) {
  const s = String(desc || '').trim();
  const parts = s.split('·').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { service: parts[0], reference: parts.slice(1).join(' · ') };
  }
  return { service: s || '—', reference: '' };
}

function patientLabel(row) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  const pid = row.patient_id || row.id;
  if (name) return pid ? `${name} (#${pid})` : name;
  return pid ? 'Patient #' + pid : '—';
}

async function qAll(pool, sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows || [];
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[management-reports] detail query failed:', err.message);
    }
    return null;
  }
}

function buildDetailBlock(id, title, subtitle, columns, rows, summary, truncated) {
  return {
    id,
    title,
    subtitle,
    columns,
    rows,
    summary: summary || [],
    truncated: !!truncated,
    rowCount: rows.length,
  };
}

function rangeForReport(id, periodRange, sectionRanges) {
  if (periodRange && periodRange.start && periodRange.end) return periodRange;
  const sectionKey = REPORT_RANGE_SECTION[id] || 'daily';
  return sectionRanges[sectionKey] || defaultRangeForSection(sectionKey);
}

function fidClause(alias, fid) {
  if (!fid) return { sql: '', params: [] };
  const col = alias ? `${alias}.facility_id` : 'facility_id';
  return { sql: ` AND ${col} = ?`, params: [fid] };
}

function sliceRows(rows) {
  if (!rows) return { slice: [], truncated: false };
  const truncated = rows.length > DETAIL_LIMIT;
  return { slice: truncated ? rows.slice(0, DETAIL_LIMIT) : rows, truncated };
}

async function fetchTransactionDetails(pool, fid, range) {
  const { start, end } = range;
  const f = fid ? ' AND t.facility_id = ?' : '';
  const params = fid ? [start, end, fid] : [start, end];

  const rows = await qAll(
    pool,
    `SELECT t.id, t.transaction_date, t.created_at, t.description, t.amount, t.payment_method, t.status,
            p.first_name, p.last_name, t.patient_id
       FROM tbl_transaction t
       LEFT JOIN tbl_patient p ON p.id = t.patient_id
      WHERE t.status = 'completed'
        AND DATE(t.transaction_date) BETWEEN ? AND ?${f}
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock(
      'transactions',
      'Transaction detail',
      'Line listing for completed receipts',
      [],
      [],
      [],
      false
    );
  }

  const truncated = rows.length > DETAIL_LIMIT;
  const slice = truncated ? rows.slice(0, DETAIL_LIMIT) : rows;
  let total = 0;

  const detailRows = slice.map((r) => {
    total += n(r.amount);
    const { service, reference } = parseDescription(r.description);
    return {
      date: fmtDate(r.transaction_date),
      time: fmtTime(r.created_at),
      patient: patientLabel(r),
      service,
      reference,
      payment: r.payment_method || '—',
      amount: fmtMoney(r.amount),
      amountRaw: n(r.amount),
      status: r.status || '—',
    };
  });

  return buildDetailBlock(
    'transactions',
    'Transaction detail',
    `Completed transactions · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Date' },
      { key: 'time', label: 'Time' },
      { key: 'patient', label: 'Patient' },
      { key: 'service', label: 'Service / description' },
      { key: 'reference', label: 'Receipt ref.' },
      { key: 'payment', label: 'Payment' },
      { key: 'amount', label: 'Amount', align: 'right', cellClass: 'num' },
    ],
    detailRows,
    [
      { label: 'Lines shown', value: String(detailRows.length) },
      { label: 'Total amount', value: fmtMoney(total) },
    ],
    truncated
  );
}

async function fetchExpenseDetails(pool, fid, range) {
  const { start, end } = range;
  const f = fid ? ' AND e.facility_id = ?' : '';
  const params = fid ? [start, end, fid] : [start, end];

  const rows = await qAll(
    pool,
    `SELECT e.id, e.expense_date, e.category, e.payee, e.description, e.amount_xaf, e.payment_method, e.created_at
       FROM tbl_expense e
      WHERE DATE(e.expense_date) BETWEEN ? AND ?${f}
      ORDER BY e.expense_date DESC, e.id DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('expenses', 'Expense detail', '', [], [], [], false);
  }

  const truncated = rows.length > DETAIL_LIMIT;
  const slice = truncated ? rows.slice(0, DETAIL_LIMIT) : rows;
  let total = 0;

  const detailRows = slice.map((r) => {
    total += n(r.amount_xaf);
    return {
      date: fmtDate(r.expense_date),
      category: r.category || '—',
      payee: r.payee || '—',
      description: r.description || '—',
      payment: r.payment_method || '—',
      amount: fmtMoney(r.amount_xaf),
    };
  });

  return buildDetailBlock(
    'expenses',
    'Expense detail',
    `Expense lines · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Date' },
      { key: 'category', label: 'Category' },
      { key: 'payee', label: 'Payee' },
      { key: 'description', label: 'Description' },
      { key: 'payment', label: 'Payment' },
      { key: 'amount', label: 'Amount', align: 'right', cellClass: 'num' },
    ],
    detailRows,
    [
      { label: 'Lines shown', value: String(detailRows.length) },
      { label: 'Total', value: fmtMoney(total) },
    ],
    truncated
  );
}

async function fetchAdmissionDetails(pool, fid, range) {
  const { start, end } = range;
  const f = fid ? ' AND a.facility_id = ?' : '';
  const params = fid ? [start, end, fid] : [start, end];

  const rows = await qAll(
    pool,
    `SELECT a.id, a.admitted_at, a.discharged_at, a.admitting_department, a.admitting_diagnosis, a.ipd_status,
            p.first_name, p.last_name, a.patient_id
       FROM tbl_admission a
       LEFT JOIN tbl_patient p ON p.id = a.patient_id
      WHERE DATE(a.admitted_at) BETWEEN ? AND ?${f}
      ORDER BY a.admitted_at DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('admissions', 'Admission detail', '', [], [], [], false);
  }

  const truncated = rows.length > DETAIL_LIMIT;
  const slice = truncated ? rows.slice(0, DETAIL_LIMIT) : rows;

  const detailRows = slice.map((r) => ({
    date: fmtDate(r.admitted_at),
    time: fmtTime(r.admitted_at),
    patient: patientLabel(r),
    department: r.admitting_department || '—',
    diagnosis: (r.admitting_diagnosis || '—').slice(0, 80),
    status: r.ipd_status || '—',
    discharged: r.discharged_at && String(r.discharged_at).indexOf('0000') !== 0 ? fmtDate(r.discharged_at) : '—',
  }));

  return buildDetailBlock(
    'admissions',
    'Admission detail',
    `Admissions · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Admitted' },
      { key: 'time', label: 'Time' },
      { key: 'patient', label: 'Patient' },
      { key: 'department', label: 'Department' },
      { key: 'diagnosis', label: 'Diagnosis' },
      { key: 'status', label: 'Status' },
      { key: 'discharged', label: 'Discharged' },
    ],
    detailRows,
    [{ label: 'Admissions listed', value: String(detailRows.length) }],
    truncated
  );
}

async function fetchOpdVisitDetails(pool, fid, range) {
  const { start, end } = range;
  const f = fid ? ' AND v.facility_id = ?' : '';
  const params = fid ? [start, end, fid] : [start, end];

  const rows = await qAll(
    pool,
    `SELECT v.id, v.visit_date, v.department, v.queue_status, v.created_at,
            p.first_name, p.last_name, v.patient_id
       FROM tbl_opd_visit v
       LEFT JOIN tbl_patient p ON p.id = v.patient_id
      WHERE v.visit_date BETWEEN ? AND ?${f}
      ORDER BY v.visit_date DESC, v.id DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('opd_visits', 'OPD visit detail', '', [], [], [], false);
  }

  const truncated = rows.length > DETAIL_LIMIT;
  const slice = truncated ? rows.slice(0, DETAIL_LIMIT) : rows;

  const detailRows = slice.map((r) => ({
    date: fmtDate(r.visit_date),
    patient: patientLabel(r),
    department: r.department || '—',
    queue: r.queue_status || '—',
  }));

  return buildDetailBlock(
    'opd_visits',
    'OPD visit detail',
    `Outpatient visits · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Visit date' },
      { key: 'patient', label: 'Patient' },
      { key: 'department', label: 'Department' },
      { key: 'queue', label: 'Queue status' },
    ],
    detailRows,
    [{ label: 'Visits listed', value: String(detailRows.length) }],
    truncated
  );
}

async function fetchPharmacyDispenseDetails(pool, fid, range) {
  const { start, end } = range;
  const ff = fidClause('rx', fid);
  const params = [start, end, start, end, ...ff.params];

  const rows = await qAll(
    pool,
    `SELECT pl.id, pl.medication_name, pl.medication_dose, pl.medication_route, pl.medication_frequency,
            pl.duration_days, pl.dispense_status, pl.dispensed_qty, pl.dispensed_at, pl.instructions,
            rx.created_at AS rx_date, rx.status AS rx_status,
            p.first_name, p.last_name, rx.patient_id,
            COALESCE(inv.name, sc.name) AS product_name
       FROM tbl_prescription_line pl
       INNER JOIN tbl_prescription rx ON rx.id = pl.prescription_id
       LEFT JOIN tbl_patient p ON p.id = rx.patient_id
       LEFT JOIN tbl_inventory_item inv ON inv.id = pl.inventory_item_id
       LEFT JOIN tbl_service_catalog sc ON sc.id = pl.pharmacy_catalog_id
      WHERE pl.line_type = 'medication'
        AND (
          (pl.dispensed_at IS NOT NULL AND DATE(pl.dispensed_at) BETWEEN ? AND ?)
          OR (pl.dispensed_at IS NULL AND DATE(rx.created_at) BETWEEN ? AND ?)
        )${ff.sql}
      ORDER BY COALESCE(pl.dispensed_at, rx.created_at) DESC, pl.id DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('pharmacy_dispenses', 'Pharmacy detail', '', [], [], [], false);
  }

  const { slice, truncated } = sliceRows(rows);
  const detailRows = slice.map((r) => ({
    date: fmtDate(r.dispensed_at || r.rx_date),
    time: fmtTime(r.dispensed_at || r.rx_date),
    patient: patientLabel(r),
    medication: r.medication_name || r.product_name || '—',
    dose: [r.medication_dose, r.medication_route].filter(Boolean).join(' · ') || '—',
    frequency: r.medication_frequency || '—',
    qty: r.dispensed_qty != null ? String(r.dispensed_qty) : '—',
    status: r.dispense_status || r.rx_status || '—',
  }));

  const dispensed = slice.filter((r) => n(r.dispensed_qty) > 0 || r.dispense_status === 'dispensed').length;

  return buildDetailBlock(
    'pharmacy_dispenses',
    'Pharmacy — prescriptions & dispensing',
    `Medication lines · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Date' },
      { key: 'time', label: 'Time' },
      { key: 'patient', label: 'Patient' },
      { key: 'medication', label: 'Medication / product' },
      { key: 'dose', label: 'Dose / route' },
      { key: 'frequency', label: 'Frequency' },
      { key: 'qty', label: 'Qty', align: 'right' },
      { key: 'status', label: 'Status' },
    ],
    detailRows,
    [
      { label: 'Lines shown', value: String(detailRows.length) },
      { label: 'Dispensed lines', value: String(dispensed) },
    ],
    truncated
  );
}

async function fetchLabTestDetails(pool, fid, range) {
  const { start, end } = range;
  const ff = fidClause('lr', fid);
  const params = [start, end, ...ff.params];

  const rows = await qAll(
    pool,
    `SELECT lr.id, lr.test_name, lr.appointment_date, lr.status, lr.conclusion_code,
            lr.payment_ticket_code, lr.created_at, lr.updated_at,
            p.first_name, p.last_name, lr.patient_id
       FROM tbl_lab_result lr
       LEFT JOIN tbl_patient p ON p.id = lr.patient_id
      WHERE DATE(COALESCE(lr.appointment_date, lr.created_at)) BETWEEN ? AND ?${ff.sql}
      ORDER BY lr.appointment_date DESC, lr.id DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('lab_tests', 'Laboratory detail', '', [], [], [], false);
  }

  const { slice, truncated } = sliceRows(rows);
  const detailRows = slice.map((r) => ({
    date: fmtDate(r.appointment_date || r.created_at),
    patient: patientLabel(r),
    test: r.test_name || '—',
    status: r.status || '—',
    result: r.conclusion_code || '—',
    ticket: r.payment_ticket_code || '—',
    updated: fmtDate(r.updated_at),
  }));

  return buildDetailBlock(
    'lab_tests',
    'Laboratory test detail',
    `Lab orders & results · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Date' },
      { key: 'patient', label: 'Patient' },
      { key: 'test', label: 'Test' },
      { key: 'status', label: 'Status' },
      { key: 'result', label: 'Conclusion' },
      { key: 'ticket', label: 'Payment ref.' },
      { key: 'updated', label: 'Last update' },
    ],
    detailRows,
    [{ label: 'Tests listed', value: String(detailRows.length) }],
    truncated
  );
}

async function fetchRadiologyExamDetails(pool, fid, range) {
  const { start, end } = range;
  const ff = fidClause('rr', fid);
  const params = [start, end, ...ff.params];

  const rows = await qAll(
    pool,
    `SELECT rr.id, rr.exam_name, rr.modality, rr.body_part, rr.appointment_date, rr.status,
            rr.conclusion_code, rr.payment_ticket_code, rr.created_at, rr.updated_at,
            p.first_name, p.last_name, rr.patient_id
       FROM tbl_radiology_result rr
       LEFT JOIN tbl_patient p ON p.id = rr.patient_id
      WHERE DATE(COALESCE(rr.appointment_date, rr.created_at)) BETWEEN ? AND ?${ff.sql}
      ORDER BY rr.appointment_date DESC, rr.id DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('radiology_exams', 'Radiology detail', '', [], [], [], false);
  }

  const { slice, truncated } = sliceRows(rows);
  const detailRows = slice.map((r) => ({
    date: fmtDate(r.appointment_date || r.created_at),
    patient: patientLabel(r),
    exam: r.exam_name || '—',
    modality: r.modality || '—',
    body: r.body_part || '—',
    status: r.status || '—',
    conclusion: r.conclusion_code || '—',
    ticket: r.payment_ticket_code || '—',
  }));

  return buildDetailBlock(
    'radiology_exams',
    'Radiology / imaging detail',
    `Imaging studies · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Date' },
      { key: 'patient', label: 'Patient' },
      { key: 'exam', label: 'Exam' },
      { key: 'modality', label: 'Modality' },
      { key: 'body', label: 'Body part' },
      { key: 'status', label: 'Status' },
      { key: 'conclusion', label: 'Conclusion' },
      { key: 'ticket', label: 'Payment ref.' },
    ],
    detailRows,
    [{ label: 'Studies listed', value: String(detailRows.length) }],
    truncated
  );
}

async function fetchLabAndRadiologyDetails(pool, fid, range) {
  const lab = await fetchLabTestDetails(pool, fid, range);
  const rad = await fetchRadiologyExamDetails(pool, fid, range);
  const labRows = lab?.rows || [];
  const radRows = rad?.rows || [];
  const combined = [
    ...labRows.map((r) => ({
      type: 'Lab',
      date: r.date,
      patient: r.patient,
      item: r.test,
      sub: r.ticket || '',
      status: r.status,
      result: r.result,
    })),
    ...radRows.map((r) => ({
      type: 'Radiology',
      date: r.date,
      patient: r.patient,
      item: r.exam,
      sub: [r.modality, r.body].filter(Boolean).join(' · '),
      status: r.status,
      result: r.conclusion,
    })),
  ];

  return buildDetailBlock(
    'lab_and_radiology',
    'Lab & radiology detail',
    `Tests and imaging · ${range.label || range.start + ' – ' + range.end}`,
    [
      { key: 'type', label: 'Type' },
      { key: 'date', label: 'Date' },
      { key: 'patient', label: 'Patient' },
      { key: 'item', label: 'Test / exam' },
      { key: 'sub', label: 'Modality / ref.' },
      { key: 'status', label: 'Status' },
      { key: 'result', label: 'Result' },
    ],
    combined,
    [
      { label: 'Lab tests', value: String(labRows.length) },
      { label: 'Imaging studies', value: String(radRows.length) },
    ],
    (lab?.truncated || rad?.truncated) && combined.length >= DETAIL_LIMIT
  );
}

async function fetchSurgeryDetails(pool, fid, range) {
  const { start, end } = range;
  const ff = fid ? ' AND a.facility_id = ?' : '';
  const params = fid ? [start, end, start, end, fid] : [start, end, start, end];

  const rows = await qAll(
    pool,
    `SELECT s.id, s.title, s.status, s.scheduled_at, s.completed_at, s.charge_amount, s.created_at,
            p.first_name, p.last_name, s.patient_id,
            TRIM(CONCAT(COALESCE(e.first_name,''), ' ', COALESCE(e.last_name,''))) AS surgeon
       FROM tbl_ipd_surgery s
       LEFT JOIN tbl_patient p ON p.id = s.patient_id
       LEFT JOIN tbl_admission a ON a.id = s.admission_id
       LEFT JOIN tbl_employee e ON e.id = s.surgeon_id
      WHERE (
        DATE(s.created_at) BETWEEN ? AND ?
        OR (s.completed_at IS NOT NULL AND DATE(s.completed_at) BETWEEN ? AND ?)
      )${ff}
      ORDER BY COALESCE(s.completed_at, s.scheduled_at, s.created_at) DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('surgeries', 'Surgery detail', '', [], [], [], false);
  }

  const { slice, truncated } = sliceRows(rows);
  const detailRows = slice.map((r) => ({
    date: fmtDate(r.completed_at || r.scheduled_at || r.created_at),
    patient: patientLabel(r),
    procedure: r.title || '—',
    surgeon: (r.surgeon || '').trim() || '—',
    status: r.status || '—',
    charge: n(r.charge_amount) ? fmtMoney(r.charge_amount) : '—',
  }));

  let chargeTotal = 0;
  slice.forEach((r) => {
    chargeTotal += n(r.charge_amount);
  });

  return buildDetailBlock(
    'surgeries',
    'Theatre & procedure detail',
    `Surgeries · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Date' },
      { key: 'patient', label: 'Patient' },
      { key: 'procedure', label: 'Procedure' },
      { key: 'surgeon', label: 'Surgeon' },
      { key: 'status', label: 'Status' },
      { key: 'charge', label: 'Charge', align: 'right', cellClass: 'num' },
    ],
    detailRows,
    [
      { label: 'Procedures listed', value: String(detailRows.length) },
      { label: 'Charges (listed)', value: fmtMoney(chargeTotal) },
    ],
    truncated
  );
}

async function fetchDeathDetails(pool, fid, range) {
  const { start, end } = range;
  const ff = fid ? ' AND a.facility_id = ?' : '';
  const params = fid ? [start, end, fid] : [start, end];

  const rows = await qAll(
    pool,
    `SELECT d.id, d.date_of_death, d.time_of_death, d.cause_of_death, d.source_module,
            p.first_name, p.last_name, d.patient_id,
            a.admitting_department
       FROM tbl_death_registry d
       LEFT JOIN tbl_patient p ON p.id = d.patient_id
       LEFT JOIN tbl_admission a ON a.id = d.admission_id
      WHERE d.date_of_death BETWEEN ? AND ?${ff}
      ORDER BY d.date_of_death DESC, d.id DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('deaths', 'Death registry detail', '', [], [], [], false);
  }

  const { slice, truncated } = sliceRows(rows);
  const detailRows = slice.map((r) => ({
    date: fmtDate(r.date_of_death),
    time: r.time_of_death ? String(r.time_of_death).slice(0, 5) : '—',
    patient: patientLabel(r),
    department: r.admitting_department || (r.source_module ? String(r.source_module).toUpperCase() : '—'),
    cause: (r.cause_of_death || '—').slice(0, 120),
  }));

  return buildDetailBlock(
    'deaths',
    'Death registry detail',
    `Recorded deaths · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Date' },
      { key: 'time', label: 'Time' },
      { key: 'patient', label: 'Patient' },
      { key: 'department', label: 'Department' },
      { key: 'cause', label: 'Cause (summary)' },
    ],
    detailRows,
    [{ label: 'Deaths listed', value: String(detailRows.length) }],
    truncated
  );
}

async function fetchCensusFlowDetails(pool, fid, range) {
  const { start, end } = range;
  const fAdm = fid ? ' AND a.facility_id = ?' : '';
  const admParams = fid ? [start, end, fid] : [start, end];

  const admissions = await qAll(
    pool,
    `SELECT 'Admission' AS movement, a.admitted_at AS when_at, a.admitting_department AS dept,
            a.admitting_diagnosis AS detail, a.ipd_status AS status,
            p.first_name, p.last_name, a.patient_id
       FROM tbl_admission a
       LEFT JOIN tbl_patient p ON p.id = a.patient_id
      WHERE DATE(a.admitted_at) BETWEEN ? AND ?${fAdm}
      ORDER BY a.admitted_at DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    admParams
  );

  const disParams = fid ? [start, end, fid] : [start, end];
  const discharges = await qAll(
    pool,
    `SELECT 'Discharge' AS movement, a.discharged_at AS when_at, a.admitting_department AS dept,
            a.admitting_diagnosis AS detail, a.ipd_status AS status,
            p.first_name, p.last_name, a.patient_id
       FROM tbl_admission a
       LEFT JOIN tbl_patient p ON p.id = a.patient_id
      WHERE a.discharged_at IS NOT NULL
        AND a.discharged_at <> '0000-00-00 00:00:00'
        AND DATE(a.discharged_at) BETWEEN ? AND ?${fAdm}
      ORDER BY a.discharged_at DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    disParams
  );

  if (admissions === null && discharges === null) {
    return buildDetailBlock('census_flow', 'Census movement', '', [], [], [], false);
  }

  const merged = [...(admissions || []), ...(discharges || [])]
    .sort((a, b) => new Date(b.when_at) - new Date(a.when_at))
    .slice(0, DETAIL_LIMIT + 1);

  const { slice, truncated } = sliceRows(merged);
  const detailRows = slice.map((r) => ({
    type: r.movement,
    date: fmtDate(r.when_at),
    time: fmtTime(r.when_at),
    patient: patientLabel(r),
    department: r.dept || '—',
    diagnosis: (r.detail || '—').slice(0, 80),
    status: r.status || '—',
  }));

  return buildDetailBlock(
    'census_flow',
    'Patient census — movements',
    `Admissions & discharges · ${range.label || start + ' – ' + end}`,
    [
      { key: 'type', label: 'Type' },
      { key: 'date', label: 'Date' },
      { key: 'time', label: 'Time' },
      { key: 'patient', label: 'Patient' },
      { key: 'department', label: 'Department' },
      { key: 'diagnosis', label: 'Diagnosis' },
      { key: 'status', label: 'Status' },
    ],
    detailRows,
    [
      { label: 'Lines shown', value: String(detailRows.length) },
      {
        label: 'Admissions / discharges',
        value: `${(admissions || []).length} / ${(discharges || []).length}`,
      },
    ],
    truncated
  );
}

async function fetchInventoryMovementDetails(pool, fid, range) {
  const { start, end } = range;
  void fid;
  const params = [start, end];

  const rows = await qAll(
    pool,
    `SELECT m.id, m.created_at, m.change_qty, m.qty_before, m.qty_after, m.reason, m.note,
            i.name AS item_name, i.sku, i.category
       FROM tbl_inventory_movement m
       INNER JOIN tbl_inventory_item i ON i.id = m.inventory_item_id
      WHERE DATE(m.created_at) BETWEEN ? AND ?
      ORDER BY m.created_at DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('inventory_movements', 'Inventory movement', '', [], [], [], false);
  }

  const { slice, truncated } = sliceRows(rows);
  const detailRows = slice.map((r) => ({
    date: fmtDate(r.created_at),
    time: fmtTime(r.created_at),
    item: r.item_name || '—',
    sku: r.sku || '—',
    category: r.category || '—',
    change: (n(r.change_qty) > 0 ? '+' : '') + fmtInt(r.change_qty),
    qtyAfter: fmtInt(r.qty_after),
    reason: r.reason || '—',
    note: (r.note || '').slice(0, 60),
  }));

  return buildDetailBlock(
    'inventory_movements',
    'Inventory movement detail',
    `Stock movements · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Date' },
      { key: 'time', label: 'Time' },
      { key: 'item', label: 'Item' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'change', label: 'Change', align: 'right' },
      { key: 'qtyAfter', label: 'Qty after', align: 'right' },
      { key: 'reason', label: 'Reason' },
      { key: 'note', label: 'Note' },
    ],
    detailRows,
    [{ label: 'Movements listed', value: String(detailRows.length) }],
    truncated
  );
}

async function fetchDeptActivityDetails(pool, fid, range) {
  const opd = await fetchOpdVisitDetails(pool, fid, range);
  const surg = await fetchSurgeryDetails(pool, fid, range);
  const rows = [
    ...(opd?.rows || []).map((r) => ({
      type: 'OPD visit',
      date: r.date,
      patient: r.patient,
      item: r.department,
      status: r.queue,
    })),
    ...(surg?.rows || []).map((r) => ({
      type: 'Surgery',
      date: r.date,
      patient: r.patient,
      item: r.procedure,
      status: r.status,
    })),
  ].slice(0, DETAIL_LIMIT);

  return buildDetailBlock(
    'dept_activity',
    'Departmental activity detail',
    `OPD visits & procedures · ${range.label || range.start + ' – ' + range.end}`,
    [
      { key: 'type', label: 'Type' },
      { key: 'date', label: 'Date' },
      { key: 'patient', label: 'Patient' },
      { key: 'item', label: 'Department / procedure' },
      { key: 'status', label: 'Status' },
    ],
    rows,
    [
      { label: 'OPD visits', value: String((opd?.rows || []).length) },
      { label: 'Surgeries', value: String((surg?.rows || []).length) },
    ],
    (opd?.truncated || surg?.truncated) && rows.length >= DETAIL_LIMIT
  );
}

async function fetchOpdEmergencyVisitDetails(pool, fid, range) {
  const { start, end } = range;
  const ff = fidClause('v', fid);
  const params = [start, end, ...ff.params];

  const rows = await qAll(
    pool,
    `SELECT v.id, v.visit_date, v.department, v.queue_status, v.created_at,
            p.first_name, p.last_name, v.patient_id
       FROM tbl_opd_visit v
       LEFT JOIN tbl_patient p ON p.id = v.patient_id
      WHERE v.visit_date BETWEEN ? AND ?
        AND (v.department LIKE '%Emergency%' OR v.department LIKE '%A&E%' OR v.department LIKE '%AE%')${ff.sql}
      ORDER BY v.visit_date DESC, v.id DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('opd_emergency_visits', 'Emergency visit detail', '', [], [], [], false);
  }

  const { slice, truncated } = sliceRows(rows);
  const detailRows = slice.map((r) => ({
    date: fmtDate(r.visit_date),
    patient: patientLabel(r),
    department: r.department || '—',
    queue: r.queue_status || '—',
  }));

  return buildDetailBlock(
    'opd_emergency_visits',
    'Emergency / A&E visits',
    `Emergency outpatient visits · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Date' },
      { key: 'patient', label: 'Patient' },
      { key: 'department', label: 'Department' },
      { key: 'queue', label: 'Queue status' },
    ],
    detailRows,
    [{ label: 'Visits listed', value: String(detailRows.length) }],
    truncated
  );
}

async function fetchIpdChargeDetails(pool, fid, range) {
  const { start, end } = range;
  const ff = fidClause('c', fid);
  const params = [start, end, ...ff.params];

  const rows = await qAll(
    pool,
    `SELECT c.id, c.description, c.amount, c.charge_type, c.created_at,
            p.first_name, p.last_name, c.patient_id,
            a.admitting_department
       FROM tbl_ipd_charge c
       LEFT JOIN tbl_patient p ON p.id = c.patient_id
       LEFT JOIN tbl_admission a ON a.id = c.admission_id
      WHERE DATE(c.created_at) BETWEEN ? AND ?${ff.sql}
      ORDER BY c.created_at DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('ipd_charges', 'IPD charge detail', '', [], [], [], false);
  }

  const { slice, truncated } = sliceRows(rows);
  let total = 0;
  const detailRows = slice.map((r) => {
    total += n(r.amount);
    return {
      date: fmtDate(r.created_at),
      time: fmtTime(r.created_at),
      patient: patientLabel(r),
      department: r.admitting_department || '—',
      description: (r.description || r.charge_type || '—').slice(0, 80),
      amount: fmtMoney(r.amount),
    };
  });

  return buildDetailBlock(
    'ipd_charges',
    'IPD charge detail',
    `Inpatient charges · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Date' },
      { key: 'time', label: 'Time' },
      { key: 'patient', label: 'Patient' },
      { key: 'department', label: 'Ward / dept.' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount', align: 'right', cellClass: 'num' },
    ],
    detailRows,
    [
      { label: 'Lines shown', value: String(detailRows.length) },
      { label: 'Total', value: fmtMoney(total) },
    ],
    truncated
  );
}

async function fetchIcuInpatientDetails(pool, fid, range) {
  const { end } = range;
  const NOT_DISCHARGED = `(a.discharged_at IS NULL OR a.discharged_at = '0000-00-00 00:00:00' OR a.discharged_at = '0000-00-00')`;
  const ff = fid ? ' AND a.facility_id = ?' : '';
  const params = fid ? [end, end, fid] : [end, end];

  const rows = await qAll(
    pool,
    `SELECT a.admitted_at, a.admitting_department, a.ipd_status,
            p.first_name, p.last_name, a.patient_id,
            COALESCE(b.ward_name, 'Unassigned') AS ward
       FROM tbl_admission a
       LEFT JOIN tbl_patient p ON p.id = a.patient_id
       LEFT JOIN tbl_bed b ON b.id = a.bed_id
      WHERE DATE(a.admitted_at) <= ?
        AND (${NOT_DISCHARGED} OR DATE(a.discharged_at) > ?)
        AND (b.ward_name LIKE '%ICU%' OR b.ward_name LIKE '%HDU%' OR a.admitting_department LIKE '%ICU%')${ff}
      ORDER BY a.admitted_at DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('icu_inpatients', 'ICU census', '', [], [], [], false);
  }

  const { slice, truncated } = sliceRows(rows);
  const detailRows = slice.map((r) => ({
    admitted: fmtDate(r.admitted_at),
    patient: patientLabel(r),
    ward: r.ward || '—',
    department: r.admitting_department || '—',
    status: r.ipd_status || '—',
  }));

  return buildDetailBlock(
    'icu_inpatients',
    'ICU / HDU inpatients',
    `Snapshot as of ${end}`,
    [
      { key: 'admitted', label: 'Admitted' },
      { key: 'patient', label: 'Patient' },
      { key: 'ward', label: 'Ward' },
      { key: 'department', label: 'Department' },
      { key: 'status', label: 'Status' },
    ],
    detailRows,
    [{ label: 'Patients listed', value: String(detailRows.length) }],
    truncated
  );
}

async function fetchLeaveRequestDetails(pool, fid, range) {
  const { start, end } = range;
  const ff = fidClause('r', fid);
  const params = [end, start, ...ff.params];

  const rows = await qAll(
    pool,
    `SELECT r.id, r.leave_type, r.start_date, r.end_date, r.days_requested, r.status, r.reason, r.created_at,
            e.first_name, e.last_name, e.employee_id AS emp_code
       FROM tbl_hms_leave_request r
       INNER JOIN tbl_employee e ON e.id = r.employee_id
      WHERE (r.start_date <= ? AND r.end_date >= ?)${ff.sql}
      ORDER BY r.created_at DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('leave_requests', 'Leave requests', '', [], [], [], false);
  }

  const { slice, truncated } = sliceRows(rows);
  const detailRows = slice.map((r) => {
    const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
    return {
      employee: name ? (r.emp_code ? `${name} (${r.emp_code})` : name) : r.emp_code || '—',
      type: r.leave_type || '—',
      from: fmtDate(r.start_date),
      to: fmtDate(r.end_date),
      days: r.days_requested != null ? String(r.days_requested) : '—',
      status: r.status || '—',
      reason: (r.reason || '—').slice(0, 60),
    };
  });

  return buildDetailBlock(
    'leave_requests',
    'HR — leave requests',
    `Overlapping ${range.label || start + ' – ' + end}`,
    [
      { key: 'employee', label: 'Employee' },
      { key: 'type', label: 'Leave type' },
      { key: 'from', label: 'From' },
      { key: 'to', label: 'To' },
      { key: 'days', label: 'Days', align: 'right' },
      { key: 'status', label: 'Status' },
      { key: 'reason', label: 'Reason' },
    ],
    detailRows,
    [{ label: 'Requests listed', value: String(detailRows.length) }],
    truncated
  );
}

async function fetchPurchaseOrderDetails(pool, fid, range) {
  const { start, end } = range;
  const ff = fidClause('po', fid);
  const params = [start, end, ...ff.params];

  const rows = await qAll(
    pool,
    `SELECT po.id, po.po_number, po.supplier_name, po.status, po.total_amount, po.created_at, po.approved_at, po.issued_at
       FROM tbl_purchase_order po
      WHERE DATE(po.created_at) BETWEEN ? AND ?${ff.sql}
      ORDER BY po.created_at DESC, po.id DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('purchase_orders', 'Procurement detail', '', [], [], [], false);
  }

  const { slice, truncated } = sliceRows(rows);
  let total = 0;
  const detailRows = slice.map((r) => {
    total += n(r.total_amount);
    return {
      date: fmtDate(r.created_at),
      po: r.po_number || '—',
      supplier: r.supplier_name || '—',
      status: r.status || '—',
      amount: fmtMoney(r.total_amount),
      approved: r.approved_at ? fmtDate(r.approved_at) : '—',
    };
  });

  return buildDetailBlock(
    'purchase_orders',
    'Procurement — purchase orders',
    `POs raised · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Created' },
      { key: 'po', label: 'PO number' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'status', label: 'Status' },
      { key: 'amount', label: 'Amount', align: 'right', cellClass: 'num' },
      { key: 'approved', label: 'Approved' },
    ],
    detailRows,
    [
      { label: 'POs listed', value: String(detailRows.length) },
      { label: 'Total value', value: fmtMoney(total) },
    ],
    truncated
  );
}

async function fetchPaymentTicketDetails(pool, fid, range) {
  const { start, end } = range;
  const ff = fidClause('t', fid);
  const params = [start, end, start, end, ...ff.params];

  const rows = await qAll(
    pool,
    `SELECT t.id, t.ticket_code, t.status, t.total_amount, t.department, t.payment_method,
            t.created_at, t.paid_at,
            p.first_name, p.last_name, t.patient_id
       FROM tbl_payment_ticket t
       LEFT JOIN tbl_patient p ON p.id = t.patient_id
      WHERE (DATE(t.created_at) BETWEEN ? AND ? OR DATE(t.paid_at) BETWEEN ? AND ?)${ff.sql}
      ORDER BY COALESCE(t.paid_at, t.created_at) DESC, t.id DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('payment_tickets', 'Payment tickets', '', [], [], [], false);
  }

  const { slice, truncated } = sliceRows(rows);
  let total = 0;
  const detailRows = slice.map((r) => {
    total += n(r.total_amount);
    return {
      date: fmtDate(r.paid_at || r.created_at),
      code: r.ticket_code || '—',
      patient: patientLabel(r),
      department: r.department || '—',
      status: r.status || '—',
      payment: r.payment_method || '—',
      amount: fmtMoney(r.total_amount),
    };
  });

  return buildDetailBlock(
    'payment_tickets',
    'Accounts receivable — payment tickets',
    `Created or paid · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Date' },
      { key: 'code', label: 'Ticket' },
      { key: 'patient', label: 'Patient' },
      { key: 'department', label: 'Department' },
      { key: 'status', label: 'Status' },
      { key: 'payment', label: 'Payment' },
      { key: 'amount', label: 'Amount', align: 'right', cellClass: 'num' },
    ],
    detailRows,
    [
      { label: 'Tickets listed', value: String(detailRows.length) },
      { label: 'Total amount', value: fmtMoney(total) },
    ],
    truncated
  );
}

async function fetchDietaryChargeDetails(pool, fid, range) {
  const { start, end } = range;
  const ff = fidClause('c', fid);
  const params = [start, end, ...ff.params];
  const dietFilter = ` AND (
    LOWER(c.charge_type) LIKE '%diet%'
    OR LOWER(c.description) LIKE '%diet%'
    OR LOWER(c.description) LIKE '%meal%'
    OR LOWER(c.source_module) LIKE '%diet%'
  )`;

  const rows = await qAll(
    pool,
    `SELECT c.id, c.created_at, c.charge_type, c.description, c.amount,
            p.first_name, p.last_name, c.patient_id, a.admitting_department
       FROM tbl_ipd_charge c
       LEFT JOIN tbl_patient p ON p.id = c.patient_id
       LEFT JOIN tbl_admission a ON a.id = c.admission_id
      WHERE DATE(c.created_at) BETWEEN ? AND ?${dietFilter}${ff.sql}
      ORDER BY c.created_at DESC
      LIMIT ${DETAIL_LIMIT + 1}`,
    params
  );

  if (rows === null) {
    return buildDetailBlock('dietary_charges', 'Dietary billing', '', [], [], [], false);
  }

  const { slice, truncated } = sliceRows(rows);
  let total = 0;
  const detailRows = slice.map((r) => {
    total += n(r.amount);
    return {
      date: fmtDate(r.created_at),
      time: fmtTime(r.created_at),
      patient: patientLabel(r),
      ward: r.admitting_department || '—',
      type: r.charge_type || '—',
      description: (r.description || '—').slice(0, 80),
      amount: fmtMoney(r.amount),
    };
  });

  return buildDetailBlock(
    'dietary_charges',
    'Dietary — meal & diet charges',
    `IPD charges tagged as dietary · ${range.label || start + ' – ' + end}`,
    [
      { key: 'date', label: 'Date' },
      { key: 'time', label: 'Time' },
      { key: 'patient', label: 'Patient' },
      { key: 'ward', label: 'Ward / dept.' },
      { key: 'type', label: 'Type' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount', align: 'right', cellClass: 'num' },
    ],
    detailRows,
    [
      { label: 'Lines shown', value: String(detailRows.length) },
      { label: 'Total', value: fmtMoney(total) },
    ],
    truncated
  );
}

async function fetchDetailByType(pool, type, range, fid) {
  if (type === 'transactions') return fetchTransactionDetails(pool, fid, range);
  if (type === 'expenses') return fetchExpenseDetails(pool, fid, range);
  if (type === 'admissions') return fetchAdmissionDetails(pool, fid, range);
  if (type === 'opd_visits') return fetchOpdVisitDetails(pool, fid, range);
  if (type === 'pharmacy_dispenses') return fetchPharmacyDispenseDetails(pool, fid, range);
  if (type === 'lab_tests') return fetchLabTestDetails(pool, fid, range);
  if (type === 'radiology_exams') return fetchRadiologyExamDetails(pool, fid, range);
  if (type === 'lab_and_radiology') return fetchLabAndRadiologyDetails(pool, fid, range);
  if (type === 'surgeries') return fetchSurgeryDetails(pool, fid, range);
  if (type === 'deaths') return fetchDeathDetails(pool, fid, range);
  if (type === 'census_flow') return fetchCensusFlowDetails(pool, fid, range);
  if (type === 'inventory_movements') return fetchInventoryMovementDetails(pool, fid, range);
  if (type === 'dept_activity') return fetchDeptActivityDetails(pool, fid, range);
  if (type === 'opd_emergency_visits') return fetchOpdEmergencyVisitDetails(pool, fid, range);
  if (type === 'ipd_charges') return fetchIpdChargeDetails(pool, fid, range);
  if (type === 'icu_inpatients') return fetchIcuInpatientDetails(pool, fid, range);
  if (type === 'leave_requests') return fetchLeaveRequestDetails(pool, fid, range);
  if (type === 'purchase_orders') return fetchPurchaseOrderDetails(pool, fid, range);
  if (type === 'payment_tickets') return fetchPaymentTicketDetails(pool, fid, range);
  if (type === 'dietary_charges') return fetchDietaryChargeDetails(pool, fid, range);
  return null;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ facilityId?: number, periodRange?: object, reportFilter?: { id: string }, sectionRanges?: object, reportIds?: string[] }} opts
 */
async function fetchReportDetails(pool, opts = {}) {
  const fid = opts.facilityId ? parseInt(opts.facilityId, 10) : null;
  const sectionRanges = opts.sectionRanges || {
    daily: defaultRangeForSection('daily'),
    weekly: defaultRangeForSection('weekly'),
    monthly: defaultRangeForSection('monthly'),
    financial: defaultRangeForSection('financial'),
  };

  let ids = opts.reportIds;
  if (opts.reportFilter?.id) {
    ids = [opts.reportFilter.id];
  }
  if (!ids || !ids.length) {
    ids = Object.keys(REPORT_DETAIL_TYPES);
  }

  const byReport = {};
  for (const reportId of ids) {
    const type = REPORT_DETAIL_TYPES[reportId];
    if (!type) continue;
    const range = rangeForReport(reportId, opts.periodRange, sectionRanges);
    const block = await fetchDetailByType(pool, type, range, fid);
    if (block) byReport[reportId] = block;
  }
  return byReport;
}

function reportHasDetail(reportId) {
  return !!REPORT_DETAIL_TYPES[reportId];
}

module.exports = {
  REPORT_DETAIL_TYPES,
  fetchReportDetails,
  reportHasDetail,
};
