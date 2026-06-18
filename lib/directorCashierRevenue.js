'use strict';

const {
  BILLING_SECTION_ORDER,
  emptyTotals,
  lineItemAmount,
  lineItemCategory,
} = require('./billingLineCategory');
const {
  STAT_BY_CODE,
  filterTotalsForKeys,
  keysForVisibleStatCodes,
} = require('./directorRevenueCatalog');
const { formatRangeLabel } = require('./hmsDirectorReportsPeriod');

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function parseLinesJson(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function fetchPaidTickets(pool, start, end) {
  try {
    const [rows] = await pool.query(
      `SELECT id, lines_json, total_amount, paid_at, ticket_code
         FROM tbl_payment_ticket
        WHERE LOWER(TRIM(COALESCE(status,''))) = 'paid'
          AND paid_at IS NOT NULL
          AND DATE(paid_at) BETWEEN ? AND ?
        ORDER BY paid_at DESC`,
      [start, end]
    );
    return rows || [];
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[director-revenue] ticket query failed:', err.message);
    }
    return [];
  }
}

/**
 * Aggregate cashier collections from paid payment tickets (live).
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ start: string, end: string, period?: string, label?: string }} range
 * @param {{ visibleStatCodes?: string[] }} opts
 */
async function fetchDirectorCashierRevenue(pool, range, opts = {}) {
  const start = String(range?.start || '').trim();
  const end = String(range?.end || start).trim();
  const totals = emptyTotals();
  let ticketCount = 0;
  let lineCount = 0;

  const tickets = await fetchPaidTickets(pool, start, end);
  for (const ticket of tickets) {
    ticketCount += 1;
    const lines = parseLinesJson(ticket.lines_json);
    if (!lines.length) {
      totals.other += n(ticket.total_amount);
      lineCount += 1;
      continue;
    }
    for (const line of lines) {
      const cat = lineItemCategory(line);
      const amt = lineItemAmount(line);
      if (amt <= 0) continue;
      totals[cat] = n(totals[cat]) + amt;
      lineCount += 1;
    }
  }

  const grandTotal = BILLING_SECTION_ORDER.reduce((sum, key) => sum + n(totals[key]), 0);
  totals.total = grandTotal;

  const allowedKeys = keysForVisibleStatCodes(opts.visibleStatCodes);
  if (!allowedKeys.size && Array.isArray(opts.visibleStatCodes) && opts.visibleStatCodes.length) {
    allowedKeys.add('total');
  }
  const filtered = allowedKeys.size ? filterTotalsForKeys(totals, allowedKeys) : { ...totals };

  const cards = (opts.visibleStatCodes || [])
    .map((code) => {
      const def = STAT_BY_CODE.get(String(code || ''));
      if (!def) return null;
      return {
        code: def.code,
        key: def.key,
        label: def.label,
        icon: def.icon,
        color: def.color,
        primary: !!def.primary,
        amount: n(filtered[def.key]),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const da = STAT_BY_CODE.get(a.code);
      const db = STAT_BY_CODE.get(b.code);
      return (da?.sort || 0) - (db?.sort || 0);
    });

  return {
    range: {
      period: range.period || 'day',
      start,
      end,
      label: range.label || formatRangeLabel(range.period || 'day', start, end),
    },
    totals: filtered,
    grandTotal: n(filtered.total != null ? filtered.total : grandTotal),
    ticketCount,
    lineCount,
    cards,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  fetchDirectorCashierRevenue,
  parseLinesJson,
};
