'use strict';

const { formatDisplayDate, formatMonthYear } = require('./hmsFormatDate');

/** Resolve day / week / month ranges for management report print & live queries. */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIsoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  if (period === 'day') {
    return formatDisplayDate(start);
  }
  if (period === 'week') {
    return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
  }
  return formatMonthYear(start);
}

/**
 * @param {{ period?: string, date?: string, week?: string, month?: string }} q
 * @returns {{ period: string, start: string, end: string, anchor: string, label: string } | null}
 */
function resolveReportRange(q = {}) {
  const period = String(q.period || '').trim().toLowerCase();
  if (!['day', 'week', 'month'].includes(period)) return null;

  let anchor = null;
  if (period === 'month' && q.month) {
    anchor = parseMonthInput(String(q.month));
  } else if (period === 'week' && q.week) {
    anchor = parseWeekInput(String(q.week));
  } else if (q.date) {
    anchor = parseIsoDate(String(q.date));
  }

  if (!anchor) {
    anchor = new Date();
    anchor = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  }

  let start;
  let end;

  if (period === 'day') {
    start = toIsoDate(anchor);
    end = start;
  } else if (period === 'week') {
    start = toIsoDate(mondayOfWeek(anchor));
    const sun = new Date(mondayOfWeek(anchor));
    sun.setDate(sun.getDate() + 6);
    end = toIsoDate(sun);
  } else {
    start = toIsoDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    end = toIsoDate(endOfMonth(anchor));
  }

  return {
    period,
    anchor: toIsoDate(anchor),
    start,
    end,
    label: formatRangeLabel(period, start, end),
  };
}

function defaultRangeForSection(sectionKey) {
  const today = toIsoDate(new Date());
  if (sectionKey === 'daily') {
    return { period: 'day', start: today, end: today, anchor: today, label: formatRangeLabel('day', today, today) };
  }
  if (sectionKey === 'weekly') {
    const mon = mondayOfWeek(new Date());
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    const start = toIsoDate(mon);
    const end = toIsoDate(sun);
    return { period: 'week', start, end, anchor: today, label: formatRangeLabel('week', start, end) };
  }
  if (sectionKey === 'monthly' || sectionKey === 'financial') {
    const d = new Date();
    const start = toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1));
    const end = today;
    return {
      period: 'month',
      start,
      end,
      anchor: today,
      label: formatRangeLabel('month', start, end),
    };
  }
  return { period: 'day', start: today, end: today, anchor: today, label: formatRangeLabel('day', today, today) };
}

function defaultPeriodForSection(sectionKey) {
  if (sectionKey === 'daily') return 'day';
  if (sectionKey === 'weekly') return 'week';
  return 'month';
}

function inputValuesForRange(range) {
  if (!range) return { date: '', week: '', month: '' };
  if (range.period === 'day') return { date: range.start, week: '', month: '' };
  if (range.period === 'week') {
    const d = new Date(range.start + 'T12:00:00');
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const day = jan4.getDay() || 7;
    const week1 = new Date(jan4);
    week1.setDate(jan4.getDate() - day + 1);
    const weekNum = 1 + Math.round((d - week1) / (7 * 24 * 60 * 60 * 1000));
    return {
      date: range.anchor || range.start,
      week: `${d.getFullYear()}-W${pad2(weekNum)}`,
      month: '',
    };
  }
  return {
    date: range.start,
    week: '',
    month: range.start.slice(0, 7),
  };
}

function priorPeriodRange(range) {
  const s = new Date(range.start + 'T12:00:00');
  const e = new Date(range.end + 'T12:00:00');
  const days = Math.round((e - s) / 86400000) + 1;
  const prevEnd = new Date(s);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return { start: toIsoDate(prevStart), end: toIsoDate(prevEnd) };
}

module.exports = {
  toIsoDate,
  parseIsoDate,
  parseWeekInput,
  parseMonthInput,
  mondayOfWeek,
  endOfMonth,
  resolveReportRange,
  priorPeriodRange,
  defaultRangeForSection,
  defaultPeriodForSection,
  inputValuesForRange,
  formatRangeLabel,
};
