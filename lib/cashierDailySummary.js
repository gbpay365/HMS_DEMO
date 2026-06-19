'use strict';

const { loadPaidTickets, resolvePeriodBounds } = require('./cashierBatchPrint');
const { parseLinesJson } = require('./directorCashierRevenue');
const { lineItemAmount, lineItemCategory } = require('./billingLineCategory');
const { ticketPrefix } = require('./cashierBillingInvoices');
const { formatDisplayDate } = require('./hmsFormatDate');

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtMoney(v) {
  return n(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' XAF';
}

function fmtTime(dt) {
  if (!dt) return '';
  const x = dt instanceof Date ? dt : new Date(dt);
  if (Number.isNaN(x.getTime())) return '';
  return x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Display order for cashier daily cumulative summary. */
const CASHIER_REPORT_CATEGORIES = Object.freeze([
  { key: 'consultation', icon: 'fa-stethoscope', color: '#16a34a' },
  { key: 'laboratory', icon: 'fa-flask', color: '#7c3aed' },
  { key: 'radiology', icon: 'fa-film', color: '#0369a1' },
  { key: 'pharmacy', icon: 'fa-medkit', color: '#059669' },
  { key: 'maternity', icon: 'fa-female', color: '#9d174d' },
  { key: 'hospitalization', icon: 'fa-hospital-o', color: '#1e40af' },
  { key: 'emergency', icon: 'fa-ambulance', color: '#dc2626' },
  { key: 'surgery', icon: 'fa-scissors', color: '#b45309' },
  { key: 'nursing', icon: 'fa-heartbeat', color: '#db2777' },
  { key: 'material', icon: 'fa-cubes', color: '#64748b' },
  { key: 'service', icon: 'fa-cog', color: '#475569' },
  { key: 'other', icon: 'fa-ellipsis-h', color: '#94a3b8' },
]);

const CATEGORY_KEYS = new Set(CASHIER_REPORT_CATEGORIES.map((c) => c.key));

const PREFIX_TO_REPORT = Object.freeze({
  CON: 'consultation',
  PAY: 'consultation',
  OTH: 'consultation',
  LAB: 'laboratory',
  RAD: 'radiology',
  PHA: 'pharmacy',
  MAT: 'maternity',
  HOS: 'hospitalization',
  IPD: 'hospitalization',
  EMG: 'emergency',
  SUR: 'surgery',
});

function emptyCategoryTotals() {
  const out = {};
  for (const row of CASHIER_REPORT_CATEGORIES) out[row.key] = 0;
  return out;
}

function lineReportCategory(line, ticket) {
  const kind = String(line?.kind || line?.category || line?.item_type || '').trim().toLowerCase();
  if (['ipd', 'hospitalisation', 'hospitalization', 'hos', 'admission'].includes(kind)) {
    return 'hospitalization';
  }
  if (kind === 'emergency' || kind === 'emg') return 'emergency';
  const cat = lineItemCategory(line);
  if (cat === 'service') {
    const prefix = ticketPrefix(ticket?.ticket_code, ticket?.lines_json);
    if (PREFIX_TO_REPORT[prefix]) return PREFIX_TO_REPORT[prefix];
  }
  return cat;
}

function ticketFallbackCategory(ticket) {
  const stored = String(ticket?.ticket_category || '').trim().toLowerCase();
  if (stored === 'emergency' || stored === 'emergency_settlement') return 'emergency';
  if (stored === 'pharmacy') return 'pharmacy';
  const prefix = ticketPrefix(ticket?.ticket_code, ticket?.lines_json);
  return PREFIX_TO_REPORT[prefix] || 'other';
}

function patientLabel(ticket) {
  const name = [ticket.first_name, ticket.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  return ticket.patient_id ? `Patient #${ticket.patient_id}` : '—';
}

function paymentMethodKey(method) {
  return String(method || 'cash').trim().toLowerCase() || 'cash';
}

function paymentMethodLabel(method) {
  const m = paymentMethodKey(method);
  if (m === 'wallet') return 'Wallet';
  if (m === 'betterpay' || m === 'mobile money' || m === 'mobile_money') return 'Mobile money';
  if (m === 'card') return 'Card';
  if (m === 'transfer' || m === 'bank') return 'Bank transfer';
  if (m === 'insurance') return 'Insurance';
  if (m === 'cash') return 'Cash';
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function parseSummaryFilters(input = {}) {
  const src = input.filters && typeof input.filters === 'object' ? input.filters : input;
  const category = String(src.category || src.cat || 'all').trim().toLowerCase();
  const method = paymentMethodKey(src.method || src.payment_method || 'all');
  const patient = String(src.patient || src.patient_q || src.q || '').trim();
  const minRaw = src.min_amount != null ? src.min_amount : src.amount_min;
  const maxRaw = src.max_amount != null ? src.max_amount : src.amount_max;
  const min_amount = minRaw != null && String(minRaw).trim() !== '' ? n(minRaw) : null;
  const max_amount = maxRaw != null && String(maxRaw).trim() !== '' ? n(maxRaw) : null;
  return {
    category: category === 'all' || !category ? 'all' : category,
    method: method === 'all' ? 'all' : method,
    patient,
    min_amount: min_amount != null && min_amount > 0 ? min_amount : null,
    max_amount: max_amount != null && max_amount > 0 ? max_amount : null,
  };
}

function filtersActive(filters) {
  return (
    (filters.category && filters.category !== 'all') ||
    (filters.method && filters.method !== 'all') ||
    !!filters.patient ||
    filters.min_amount != null ||
    filters.max_amount != null
  );
}

function patientMatches(row, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  const name = String(row.patient || '').toLowerCase();
  const code = String(row.ticket_code || '').toLowerCase();
  const pid = row.patient_id != null ? String(row.patient_id) : '';
  return name.includes(needle) || code.includes(needle) || pid.includes(needle);
}

function amountMatches(amount, filters) {
  const amt = n(amount);
  if (filters.min_amount != null && amt < filters.min_amount) return false;
  if (filters.max_amount != null && amt > filters.max_amount) return false;
  return true;
}

function rowMatchesFilters(row, filters) {
  if (filters.category !== 'all' && row.category !== filters.category) return false;
  if (filters.method !== 'all' && row.payment_method_key !== filters.method) return false;
  if (!patientMatches(row, filters.patient)) return false;
  if (!amountMatches(row.amount, filters)) return false;
  return true;
}

function buildRawRows(tickets) {
  const rows = [];
  for (const ticket of tickets) {
    const lines = parseLinesJson(ticket.lines_json);
    const pmKey = paymentMethodKey(ticket.payment_method);
    const pmLabel = paymentMethodLabel(ticket.payment_method);
    const base = {
      ticket_code: ticket.ticket_code || '',
      paid_at: ticket.paid_at,
      paid_time: fmtTime(ticket.paid_at),
      patient: patientLabel(ticket),
      patient_id: ticket.patient_id,
      payment_method: pmLabel,
      payment_method_key: pmKey,
    };

    if (!lines.length) {
      const cat = ticketFallbackCategory(ticket);
      const amt = n(ticket.total_amount);
      rows.push({ ...base, category: cat, amount: amt });
      continue;
    }

    let attributed = 0;
    for (const line of lines) {
      const amt = lineItemAmount(line);
      if (amt <= 0) continue;
      const cat = lineReportCategory(line, ticket);
      const bucket = CATEGORY_KEYS.has(cat) ? cat : 'other';
      rows.push({ ...base, category: bucket, amount: amt });
      attributed += amt;
    }
    const remainder = n(ticket.total_amount) - attributed;
    if (remainder > 0.005) {
      rows.push({
        ...base,
        category: ticketFallbackCategory(ticket),
        amount: remainder,
      });
    }
  }
  return rows;
}

function aggregateFromRows(rows) {
  const byCategory = emptyCategoryTotals();
  const categoryLineCounts = {};
  const byPaymentMethod = {};

  for (const row of rows) {
    const cat = CATEGORY_KEYS.has(row.category) ? row.category : 'other';
    const amt = n(row.amount);
    byCategory[cat] = n(byCategory[cat]) + amt;
    categoryLineCounts[cat] = (categoryLineCounts[cat] || 0) + 1;
    const pm = row.payment_method_key || 'cash';
    byPaymentMethod[pm] = n(byPaymentMethod[pm]) + amt;
  }

  const grandTotal = Object.values(byCategory).reduce((sum, v) => sum + n(v), 0);

  const categoryRows = CASHIER_REPORT_CATEGORIES.map((def) => {
    const amount = n(byCategory[def.key]);
    return {
      ...def,
      amount,
      amount_fmt: fmtMoney(amount),
      line_count: categoryLineCounts[def.key] || 0,
      share_pct: grandTotal > 0 ? Math.round((amount / grandTotal) * 1000) / 10 : 0,
    };
  }).filter((row) => row.amount > 0 || row.line_count > 0);

  const paymentRows = Object.entries(byPaymentMethod)
    .map(([key, amount]) => ({
      key,
      label: paymentMethodLabel(key),
      amount: n(amount),
      amount_fmt: fmtMoney(amount),
      share_pct: grandTotal > 0 ? Math.round((n(amount) / grandTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const transactions = rows.map((row) => ({
    ticket_code: row.ticket_code,
    paid_at: row.paid_at,
    paid_time: row.paid_time,
    patient: row.patient,
    patient_id: row.patient_id,
    payment_method: row.payment_method,
    payment_method_key: row.payment_method_key,
    category: row.category,
    amount: n(row.amount),
    amount_fmt: fmtMoney(row.amount),
  }));

  return {
    categoryRows,
    paymentRows,
    transactions,
    summary: {
      ticketCount: new Set(rows.map((r) => r.ticket_code).filter(Boolean)).size,
      lineCount: rows.length,
      grandTotal,
      grandTotal_fmt: fmtMoney(grandTotal),
    },
  };
}

function buildFilterOptions(allRows) {
  const methodKeys = new Set();
  for (const row of allRows) {
    if (row.payment_method_key) methodKeys.add(row.payment_method_key);
  }
  return {
    categories: CASHIER_REPORT_CATEGORIES,
    methods: [...methodKeys]
      .sort()
      .map((key) => ({ key, label: paymentMethodLabel(key) })),
  };
}

function filtersToQueryString(filters, extra = {}) {
  const parts = [];
  const add = (k, v) => {
    if (v == null || v === '' || v === 'all') return;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  };
  add('period', extra.period);
  add('date', extra.date);
  add('category', filters.category);
  add('method', filters.method);
  add('patient', filters.patient);
  if (filters.min_amount != null) add('min_amount', filters.min_amount);
  if (filters.max_amount != null) add('max_amount', filters.max_amount);
  return parts.join('&');
}

/**
 * Build cumulative cashier transaction summary for a day / week / month.
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ period?: string, date?: string, allCashiers?: boolean, paidBy?: number, filters?: object }} opts
 */
async function buildCashierDailySummary(pool, opts = {}) {
  const bounds = resolvePeriodBounds(opts.period, opts.date);
  const tickets = await loadPaidTickets(pool, bounds, opts);
  const filters = parseSummaryFilters(opts);
  const allRows = buildRawRows(tickets);
  const filteredRows = filtersActive(filters)
    ? allRows.filter((row) => rowMatchesFilters(row, filters))
    : allRows;

  const agg = aggregateFromRows(filteredRows);
  const filterOptions = buildFilterOptions(allRows);

  return {
    bounds: {
      ...bounds,
      label:
        bounds.period === 'day'
          ? formatDisplayDate(bounds.start)
          : bounds.period === 'week'
            ? `${formatDisplayDate(bounds.start)} – ${formatDisplayDate(bounds.end)}`
            : bounds.label,
    },
    filters,
    filtersActive: filtersActive(filters),
    filterOptions,
    totals: {
      allRows: allRows.length,
      filteredRows: filteredRows.length,
      allTickets: new Set(allRows.map((r) => r.ticket_code).filter(Boolean)).size,
    },
    ...agg,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  CASHIER_REPORT_CATEGORIES,
  buildCashierDailySummary,
  parseSummaryFilters,
  filtersToQueryString,
  paymentMethodLabel,
  fmtMoney,
};
