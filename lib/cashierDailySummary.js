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

function paymentMethodLabel(method) {
  const m = String(method || 'cash').trim().toLowerCase() || 'cash';
  if (m === 'wallet') return 'Wallet';
  if (m === 'betterpay' || m === 'mobile money' || m === 'mobile_money') return 'Mobile money';
  if (m === 'card') return 'Card';
  if (m === 'transfer' || m === 'bank') return 'Bank transfer';
  if (m === 'insurance') return 'Insurance';
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/**
 * Build cumulative cashier transaction summary for a day / week / month.
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ period?: string, date?: string, allCashiers?: boolean, paidBy?: number }} opts
 */
async function buildCashierDailySummary(pool, opts = {}) {
  const bounds = resolvePeriodBounds(opts.period, opts.date);
  const tickets = await loadPaidTickets(pool, bounds, opts);

  const byCategory = emptyCategoryTotals();
  const categoryLineCounts = {};
  const byPaymentMethod = {};
  const transactions = [];
  let lineCount = 0;

  for (const ticket of tickets) {
    const lines = parseLinesJson(ticket.lines_json);
    let ticketCategoryTotal = emptyCategoryTotals();
    let ticketAttributed = 0;

    if (!lines.length) {
      const cat = ticketFallbackCategory(ticket);
      const amt = n(ticket.total_amount);
      byCategory[cat] = n(byCategory[cat]) + amt;
      ticketCategoryTotal[cat] = amt;
      categoryLineCounts[cat] = (categoryLineCounts[cat] || 0) + 1;
      lineCount += 1;
      ticketAttributed = amt;
    } else {
      for (const line of lines) {
        const amt = lineItemAmount(line);
        if (amt <= 0) continue;
        const cat = lineReportCategory(line, ticket);
        const bucket = byCategory[cat] != null ? cat : 'other';
        byCategory[bucket] = n(byCategory[bucket]) + amt;
        ticketCategoryTotal[bucket] = n(ticketCategoryTotal[bucket]) + amt;
        categoryLineCounts[bucket] = (categoryLineCounts[bucket] || 0) + 1;
        lineCount += 1;
        ticketAttributed += amt;
      }
      const remainder = n(ticket.total_amount) - ticketAttributed;
      if (remainder > 0.005) {
        const cat = ticketFallbackCategory(ticket);
        byCategory[cat] = n(byCategory[cat]) + remainder;
        ticketCategoryTotal[cat] = n(ticketCategoryTotal[cat]) + remainder;
      }
    }

    const pmKey = String(ticket.payment_method || 'cash').trim().toLowerCase() || 'cash';
    byPaymentMethod[pmKey] = n(byPaymentMethod[pmKey]) + n(ticket.total_amount);

    const primaryCat = Object.entries(ticketCategoryTotal)
      .filter(([, amt]) => n(amt) > 0)
      .sort((a, b) => b[1] - a[1])[0];
    transactions.push({
      ticket_code: ticket.ticket_code || '',
      paid_at: ticket.paid_at,
      paid_time: fmtTime(ticket.paid_at),
      patient: patientLabel(ticket),
      payment_method: paymentMethodLabel(ticket.payment_method),
      amount: n(ticket.total_amount),
      amount_fmt: fmtMoney(ticket.total_amount),
      category: primaryCat ? primaryCat[0] : ticketFallbackCategory(ticket),
      line_count: lines.length || 1,
    });
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
    summary: {
      ticketCount: tickets.length,
      lineCount,
      grandTotal,
      grandTotal_fmt: fmtMoney(grandTotal),
    },
    categoryRows,
    paymentRows,
    transactions,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  CASHIER_REPORT_CATEGORIES,
  buildCashierDailySummary,
  fmtMoney,
};
