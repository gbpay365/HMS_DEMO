/**
 * Cashier billing workspace — unified invoice list (LinkHMS-style).
 */
const { paymentCodeTypeLabel, resolvePaymentCodePrefix } = require('./paymentTicketCode');
const { ensureCashierInvoiceSchema } = require('./ensureCashierInvoiceSchema');

const PREFIX_TO_CATEGORY = {
  CON: 'consultation',
  PAY: 'consultation',
  OTH: 'consultation',
  SUR: 'surgery',
  LAB: 'laboratory',
  RAD: 'radiology',
  MAT: 'maternity',
  HOS: 'ipd',
  IPD: 'ipd',
  EMG: 'emergency',
  PHA: 'pharmacy',
};

const CATEGORY_PREFIXES = {
  consultation: ['CON', 'PAY', 'OTH'],
  laboratory: ['LAB'],
  radiology: ['RAD'],
  maternity: ['MAT'],
  surgery: ['SUR'],
  pharmacy: ['PHA'],
};

function ticketPrefix(ticketCode, linesJson) {
  const code = String(ticketCode || '').trim();
  const m = code.match(/^([A-Z]{2,4})-/i);
  if (m) return m[1].toUpperCase();
  try {
    const j = typeof linesJson === 'string' ? JSON.parse(linesJson) : linesJson;
    return resolvePaymentCodePrefix(Array.isArray(j) ? j : []);
  } catch (_) {
    return 'OTH';
  }
}

function inferCategory(ticketCode, linesJson, ticketCategory) {
  const stored = String(ticketCategory || '').toLowerCase();
  if (stored === 'pharmacy') return 'pharmacy';
  const prefix = ticketPrefix(ticketCode, linesJson);
  return PREFIX_TO_CATEGORY[prefix] || 'consultation';
}

function inferLegacyCategory(serviceCategory) {
  return serviceCategory === 'pharmacy' ? 'pharmacy' : 'service';
}

function inferServiceLabel(linesJson) {
  try {
    const j = typeof linesJson === 'string' ? JSON.parse(linesJson) : linesJson;
    if (!Array.isArray(j) || !j.length) return '';
    if (j.length === 1) return String(j[0].description || '');
    return `${j[0].description || 'Item'} +${j.length - 1}`;
  } catch (_) {}
  return '';
}

function inferLineMeta(linesJson) {
  try {
    const lines = typeof linesJson === 'string' ? JSON.parse(linesJson) : linesJson;
    if (!Array.isArray(lines) || !lines.length) {
      return { item_count: 0, department: '', insurance_pct: 0 };
    }
    let insurancePct = 0;
    for (const ln of lines) {
      const pct = parseFloat(ln.insurer_covered_percent ?? ln.coverage_pct ?? 0) || 0;
      if (pct > insurancePct) insurancePct = pct;
    }
    const department = String(lines[0].department || '').trim();
    return { item_count: lines.length, department, insurance_pct: insurancePct };
  } catch (_) {
    return { item_count: 0, department: '', insurance_pct: 0 };
  }
}

function refundTotalOnTicket(linesJson) {
  try {
    const lines = typeof linesJson === 'string' ? JSON.parse(linesJson) : linesJson;
    if (!Array.isArray(lines)) return 0;
    return lines
      .filter((ln) => String(ln.kind || '').toLowerCase() === 'refund')
      .reduce((sum, ln) => sum + Math.abs(parseFloat(ln.unit_price) || 0), 0);
  } catch (_) {
    return 0;
  }
}

function resolvePaymentStatus(row) {
  const st = String(row.status || '').toLowerCase();
  if (st === 'cancelled' || st === 'canceled') return 'canceled';

  const total = parseFloat(row.total_amount) || 0;
  const paid = parseFloat(row.amount_paid) || 0;
  const refundedTotal = refundTotalOnTicket(row.lines_json);
  const invoiceSt = String(row.invoice_status || '').toLowerCase();

  if (invoiceSt === 'refunded' || (refundedTotal > 0.005 && paid <= 0.005)) {
    return 'refunded';
  }
  if (total > 0 && paid >= total - 0.005) return 'paid';
  if (paid > 0.005 && paid < total - 0.005) return 'partial';
  return 'unpaid';
}

function categorySqlClause(categoryFilter) {
  const cat = String(categoryFilter || 'all').toLowerCase();
  if (cat === 'all' || cat === '') return { sql: '', params: [] };
  if (cat === 'pharmacy') {
    return {
      sql: ` AND (
        LOWER(COALESCE(t.ticket_category,'')) = 'pharmacy'
        OR UPPER(TRIM(t.ticket_code)) LIKE 'PHA-%'
      )`,
      params: [],
    };
  }
  if (cat === 'service') {
    return {
      sql: ` AND NOT (
        LOWER(COALESCE(t.ticket_category,'')) = 'pharmacy'
        OR UPPER(TRIM(t.ticket_code)) LIKE 'PHA-%'
      )`,
      params: [],
    };
  }
  const prefixes = CATEGORY_PREFIXES[cat];
  if (prefixes && prefixes.length) {
    const parts = prefixes.map((p) => `UPPER(TRIM(t.ticket_code)) LIKE '${p}-%'`);
    return { sql: ` AND (${parts.join(' OR ')})`, params: [] };
  }
  return { sql: '', params: [] };
}

function statusSqlClause(statusFilter) {
  const st = String(statusFilter || 'all').toLowerCase();
  if (st === 'all' || st === '') return { sql: '', params: [] };
  if (st === 'unpaid' || st === 'pending') {
    return {
      sql: ` AND t.status = 'pending' AND COALESCE(t.amount_paid, 0) < 0.005`,
      params: [],
    };
  }
  if (st === 'partial' || st === 'partially_paid') {
    return {
      sql: ` AND t.status = 'pending' AND COALESCE(t.amount_paid, 0) > 0.005
             AND COALESCE(t.amount_paid, 0) < (t.total_amount - 0.005)`,
      params: [],
    };
  }
  if (st === 'paid') {
    return {
      sql: ` AND COALESCE(t.amount_paid, 0) >= (t.total_amount - 0.005)
             AND LOWER(COALESCE(t.invoice_status, '')) <> 'refunded'
             AND COALESCE(t.lines_json, '') NOT LIKE '%"kind":"refund"%'`,
      params: [],
    };
  }
  if (st === 'refunded') {
    return {
      sql: ` AND (
        LOWER(COALESCE(t.invoice_status, '')) = 'refunded'
        OR (
          COALESCE(t.amount_paid, 0) < 0.005
          AND COALESCE(t.lines_json, '') LIKE '%"kind":"refund"%'
        )
      )`,
      params: [],
    };
  }
  if (st === 'canceled' || st === 'cancelled') {
    return { sql: ` AND t.status IN ('cancelled','canceled')`, params: [] };
  }
  return { sql: '', params: [] };
}

function claimSqlClause(claimFilter) {
  const c = String(claimFilter || 'all').toLowerCase();
  if (c === 'all' || !c) return { sql: '', params: [] };
  const map = {
    not_claimed: 'not_claimed',
    claimed: 'claimed',
    canceled: 'canceled',
    cancelled: 'canceled',
    denied: 'denied',
  };
  const val = map[c];
  if (!val) return { sql: '', params: [] };
  return { sql: ' AND LOWER(COALESCE(t.claim_status, \'not_claimed\')) = ?', params: [val] };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} opts
 */
async function fetchCashierBillingInvoices(pool, opts = {}) {
  await ensureCashierInvoiceSchema(pool);
  const { repairStalePaidCashierRefunds } = require('./cashierRefundPost');
  await repairStalePaidCashierRefunds(pool, 50).catch(() => {});

  const statusFilter = String(opts.statusFilter || 'all').toLowerCase();
  const claimFilter = String(opts.claimFilter || 'all').toLowerCase();
  const categoryFilter = String(opts.categoryFilter || 'all').toLowerCase();
  const search = String(opts.search || '').trim();
  const dateFrom = String(opts.dateFrom || '').trim();
  const dateTo = String(opts.dateTo || '').trim();
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 100, 1), 500);
  const offset = Math.max(parseInt(opts.offset, 10) || 0, 0);
  const scansLabel = opts.scansLabel || 'Scans & Imaging';

  const params = [];
  let where = '1=1';

  const statusClause = statusSqlClause(statusFilter);
  where += statusClause.sql;

  const claimClause = claimSqlClause(claimFilter);
  where += claimClause.sql;
  params.push(...claimClause.params);

  const catClause = categorySqlClause(categoryFilter);
  where += catClause.sql;
  params.push(...catClause.params);

  if (dateFrom) {
    where += ' AND DATE(COALESCE(t.paid_at, t.created_at)) >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    where += ' AND DATE(COALESCE(t.paid_at, t.created_at)) <= ?';
    params.push(dateTo);
  }

  if (search) {
    const safe = search.replace(/[%_\\]/g, ' ').trim();
    if (safe) {
      const like = `%${safe}%`;
      where += ` AND (
        LOWER(t.ticket_code) LIKE LOWER(?)
        OR LOWER(CONCAT(COALESCE(p.first_name,''), ' ', COALESCE(p.last_name,''))) LIKE LOWER(?)
        OR CAST(t.patient_id AS CHAR) LIKE ?
      )`;
      params.push(like, like, like);
    }
  }

  const [[countRow]] = await pool
    .query(
      `SELECT COUNT(*) AS c FROM tbl_payment_ticket t JOIN tbl_patient p ON p.id = t.patient_id WHERE ${where}`,
      params
    )
    .catch(() => [[{ c: 0 }]]);

  const [rows] = await pool
    .query(
      `SELECT
        t.id AS ticket_id,
        t.ticket_code,
        t.status,
        t.total_amount,
        t.amount_paid,
        t.claim_status,
        t.ticket_category,
        t.patient_id,
        t.created_at,
        t.paid_at,
        t.payment_method,
        t.lines_json,
        t.notes,
        t.issue_date,
        t.due_date,
        t.discount_pct,
        t.tax_pct,
        t.bill_to_name,
        t.bill_to_contact,
        t.invoice_number,
        t.invoice_status,
        p.first_name,
        p.last_name,
        d.billing_doc_id,
        d.receipt_number,
        d.invoice_doc_number
      FROM tbl_payment_ticket t
      JOIN tbl_patient p ON p.id = t.patient_id
      LEFT JOIN (
        SELECT
          bd.source_pk,
          bd.id AS billing_doc_id,
          bd.doc_number AS receipt_number,
          bd.invoice_doc_number
        FROM tbl_billing_document bd
        INNER JOIN (
          SELECT source_pk, MAX(id) AS max_id
          FROM tbl_billing_document
          WHERE source_module = 'payment_ticket'
          GROUP BY source_pk
        ) latest ON latest.max_id = bd.id
      ) d ON d.source_pk = t.id
      WHERE ${where}
      ORDER BY
        CASE WHEN t.status = 'pending' THEN 0 ELSE 1 END,
        COALESCE(t.paid_at, t.created_at) DESC,
        t.id DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )
    .catch(() => [[]]);

  const invoices = (rows || []).map((r) => {
    const amount = parseFloat(r.total_amount) || 0;
    const amountPaid = parseFloat(r.amount_paid) || 0;
    const paymentStatus = resolvePaymentStatus(r);
    const balanceDue = Math.max(0, Math.round((amount - amountPaid) * 100) / 100);
    const prefix = ticketPrefix(r.ticket_code, r.lines_json);
    const serviceCategory = inferCategory(r.ticket_code, r.lines_json, r.ticket_category);
    const category = inferLegacyCategory(serviceCategory);
    const typeLabel =
      serviceCategory === 'pharmacy'
        ? 'Pharmacy'
        : paymentCodeTypeLabel(prefix, scansLabel).replace(/ payment$/i, '');
    const lineMeta = inferLineMeta(r.lines_json);
    const department = lineMeta.department || typeLabel || 'General';
    return {
      ticket_id: r.ticket_id,
      invoice_ref: r.ticket_code,
      ticket_code: r.ticket_code,
      patient_id: r.patient_id,
      patient_name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      category,
      service_category: serviceCategory,
      category_label: typeLabel,
      department,
      item_count: lineMeta.item_count,
      insurance_pct: lineMeta.insurance_pct,
      service_label: inferServiceLabel(r.lines_json),
      amount,
      amount_paid: amountPaid,
      balance_due: balanceDue,
      payment_status: paymentStatus,
      claim_status: String(r.claim_status || 'not_claimed').toLowerCase(),
      status: r.status,
      refunded_amount: refundTotalOnTicket(r.lines_json),
      created_at: r.created_at,
      paid_at: r.paid_at,
      payment_method: r.payment_method || null,
      billing_doc_id: r.billing_doc_id,
      receipt_number: r.receipt_number || null,
      invoice_number: r.invoice_number || r.invoice_doc_number || null,
      notes: r.notes || null,
      issue_date: r.issue_date || null,
      due_date: r.due_date || null,
      discount_pct: parseFloat(r.discount_pct) || 0,
      tax_pct: parseFloat(r.tax_pct) || 0,
      bill_to_name: r.bill_to_name || null,
      bill_to_contact: r.bill_to_contact || null,
      invoice_doc_status:
        paymentStatus === 'refunded'
          ? 'refunded'
          : String(r.invoice_status || 'sent').toLowerCase(),
    };
  });

  const [[summary]] = await pool
    .query(
      `SELECT
        COUNT(*) AS bills_count,
        COALESCE(SUM(total_amount), 0) AS total_billed,
        COALESCE(SUM(COALESCE(amount_paid, 0)), 0) AS collected,
        COALESCE(SUM(GREATEST(0, total_amount - COALESCE(amount_paid, 0))), 0) AS outstanding,
        SUM(CASE WHEN status = 'pending' AND COALESCE(amount_paid,0) < 0.005 THEN 1 ELSE 0 END) AS unpaid_count,
        COALESCE(SUM(CASE WHEN status = 'pending' AND COALESCE(amount_paid,0) < 0.005 THEN total_amount END), 0) AS unpaid_total,
        SUM(CASE WHEN status = 'pending' AND COALESCE(amount_paid,0) > 0.005
          AND COALESCE(amount_paid,0) < (total_amount - 0.005) THEN 1 ELSE 0 END) AS partial_count,
        SUM(CASE WHEN status = 'paid' OR COALESCE(amount_paid,0) >= (total_amount - 0.005) THEN 1 ELSE 0 END) AS paid_count,
        SUM(CASE WHEN status IN ('cancelled','canceled') THEN 1 ELSE 0 END) AS canceled_count
      FROM tbl_payment_ticket
      WHERE status NOT IN ('cancelled','canceled')`
    )
    .catch(() => [[{}]]);

  return {
    invoices,
    total: parseInt(countRow && countRow.c, 10) || 0,
    summary: {
      bills_count: parseInt(summary?.bills_count, 10) || 0,
      total_billed: parseFloat(summary?.total_billed) || 0,
      collected: parseFloat(summary?.collected) || 0,
      outstanding: parseFloat(summary?.outstanding) || 0,
      unpaid_count: parseInt(summary?.unpaid_count, 10) || 0,
      unpaid_total: parseFloat(summary?.unpaid_total) || 0,
      partial_count: parseInt(summary?.partial_count, 10) || 0,
      paid_count: parseInt(summary?.paid_count, 10) || 0,
      canceled_count: parseInt(summary?.canceled_count, 10) || 0,
      pending_count: parseInt(summary?.unpaid_count, 10) || 0,
      pending_total: parseFloat(summary?.unpaid_total) || 0,
    },
  };
}

module.exports = {
  fetchCashierBillingInvoices,
  inferCategory,
  ticketPrefix,
  resolvePaymentStatus,
};
