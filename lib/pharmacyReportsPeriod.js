'use strict';

const { formatDisplayDate, formatMonthYear } = require('./hmsFormatDate');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIsoDate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function parseIsoDate(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  if (Number.isNaN(d.getTime())) return null;
  if (toIsoDate(d) !== s.trim()) return null;
  return d;
}

function parseMonthInput(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1);
}

function parseWeekInput(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{4})-W(\d{2})$/i.exec(s.trim());
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  if (week < 1 || week > 53) return null;
  const jan4 = new Date(year, 0, 4);
  const day = jan4.getDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setDate(jan4.getDate() - day + 1);
  const monday = new Date(mondayWeek1);
  monday.setDate(mondayWeek1.getDate() + (week - 1) * 7);
  return monday;
}

function parseQuarterInput(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{4})-Q([1-4])$/i.exec(s.trim());
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const q = parseInt(m[2], 10);
  const month = (q - 1) * 3;
  return { year, quarter: q, month };
}

function parseYearInput(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return parseInt(m[1], 10);
}

function mondayOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function formatRangeLabel(period, start, end) {
  if (period === 'day') return formatDisplayDate(start);
  if (period === 'week') return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
  if (period === 'month') return formatMonthYear(start);
  if (period === 'quarter') {
    const qm = /^(\d{4})-(\d{2})-\d{2}$/.exec(start);
    if (qm) {
      const q = Math.floor((parseInt(qm[2], 10) - 1) / 3) + 1;
      return `Q${q} ${qm[1]}`;
    }
  }
  if (period === 'year') return String(start).slice(0, 4);
  return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
}

const PERIOD_OPTIONS = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'quarter', label: 'Quarterly' },
  { key: 'year', label: 'Yearly' },
];

const PERIOD_PRESETS = {
  last7: { days: 7, label: 'Last 7 days' },
  last30: { days: 30, label: 'Last 30 days' },
  last90: { days: 90, label: 'Last 90 days' },
};

const PERIOD_PRESET_OPTIONS = [
  { key: '', label: 'Custom period' },
  ...Object.entries(PERIOD_PRESETS).map(([key, v]) => ({ key, label: v.label })),
];

function resolvePresetRange(presetKey) {
  const preset = PERIOD_PRESETS[presetKey];
  if (!preset) return null;
  const today = new Date();
  const endD = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startD = new Date(endD);
  startD.setDate(startD.getDate() - (preset.days - 1));
  return {
    period: 'preset',
    preset: presetKey,
    anchor: presetKey,
    start: toIsoDate(startD),
    end: toIsoDate(endD),
    label: preset.label,
  };
}

/**
 * @param {{ period?: string, date?: string, week?: string, month?: string, quarter?: string, year?: string }} q
 */
function resolvePharmacyReportRange(q = {}) {
  const presetKey = String(q.preset || '').trim().toLowerCase();
  if (presetKey && PERIOD_PRESETS[presetKey]) {
    return resolvePresetRange(presetKey);
  }

  let period = String(q.period || 'month').trim().toLowerCase();
  if (!['day', 'week', 'month', 'quarter', 'year'].includes(period)) {
    period = 'month';
  }

  const today = new Date();
  const todayAnchor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let anchor = null;
  if (period === 'year' && q.year) {
    const y = parseYearInput(String(q.year));
    if (y) anchor = new Date(y, 0, 1);
  } else if (period === 'quarter' && q.quarter) {
    const pq = parseQuarterInput(String(q.quarter));
    if (pq) anchor = new Date(pq.year, pq.month, 1);
  } else if (period === 'month' && q.month) {
    anchor = parseMonthInput(String(q.month));
  } else if (period === 'week' && q.week) {
    anchor = parseWeekInput(String(q.week));
  } else if (q.date) {
    anchor = parseIsoDate(String(q.date));
  }

  if (!anchor) anchor = todayAnchor;

  let start;
  let end;
  let anchorIso = toIsoDate(anchor);

  if (period === 'day') {
    start = toIsoDate(anchor);
    end = start;
  } else if (period === 'week') {
    start = toIsoDate(mondayOfWeek(anchor));
    const sun = new Date(mondayOfWeek(anchor));
    sun.setDate(sun.getDate() + 6);
    end = toIsoDate(sun);
  } else if (period === 'month') {
    start = toIsoDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    end = toIsoDate(endOfMonth(anchor));
  } else if (period === 'quarter') {
    const qMonth = Math.floor(anchor.getMonth() / 3) * 3;
    start = toIsoDate(new Date(anchor.getFullYear(), qMonth, 1));
    end = toIsoDate(new Date(anchor.getFullYear(), qMonth + 3, 0));
    const qNum = Math.floor(qMonth / 3) + 1;
    anchorIso = `${anchor.getFullYear()}-Q${qNum}`;
  } else {
    const y = anchor.getFullYear();
    start = `${y}-01-01`;
    end = `${y}-12-31`;
    anchorIso = String(y);
  }

  return {
    period,
    anchor: anchorIso,
    start,
    end,
    label: formatRangeLabel(period, start, end),
  };
}

function defaultAnchorForPeriod(period) {
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (period === 'day') return toIsoDate(d);
  if (period === 'week') {
    const mon = mondayOfWeek(d);
    const y = mon.getFullYear();
    const jan4 = new Date(y, 0, 4);
    const day = jan4.getDay() || 7;
    const mondayWeek1 = new Date(jan4);
    mondayWeek1.setDate(jan4.getDate() - day + 1);
    const diff = Math.floor((mon - mondayWeek1) / 86400000);
    const week = Math.floor(diff / 7) + 1;
    return `${y}-W${pad2(week)}`;
  }
  if (period === 'month') return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  if (period === 'quarter') {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `${d.getFullYear()}-Q${q}`;
  }
  if (period === 'year') return String(d.getFullYear());
  return toIsoDate(d);
}

function buildReportQueryString(range, extra = {}) {
  const p = new URLSearchParams();
  if (range.preset) {
    p.set('preset', range.preset);
  } else {
    p.set('period', range.period);
    if (range.period === 'day') p.set('date', range.start);
    else if (range.period === 'week') p.set('week', range.anchor);
    else if (range.period === 'month') p.set('month', range.start.slice(0, 7));
    else if (range.period === 'quarter') p.set('quarter', range.anchor);
    else if (range.period === 'year') p.set('year', range.anchor);
  }
  if (extra.rowtype && extra.rowtype !== 'all') p.set('rowtype', extra.rowtype);
  if (extra.category && extra.category !== 'all') p.set('category', extra.category);
  return p.toString();
}

module.exports = {
  PERIOD_OPTIONS,
  PERIOD_PRESETS,
  PERIOD_PRESET_OPTIONS,
  resolvePharmacyReportRange,
  resolvePresetRange,
  defaultAnchorForPeriod,
  buildReportQueryString,
  toIsoDate,
};
