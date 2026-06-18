'use strict';

const XLSX = require('xlsx');

function csvEscape(val) {
  const s = val == null ? '' : String(val);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function safeSheetName(name) {
  return String(name || 'Report')
    .slice(0, 31)
    .replace(/[\\/*?:\[\]]/g, ' ')
    .trim() || 'Report';
}

function reportSheetRows(reportMeta, reportRange, reportData) {
  const cols = reportData.columns || [];
  const rows = reportData.rows || [];
  return [
    [reportMeta.title || 'Report'],
    [reportRange.label || ''],
    [],
    cols.map((c) => c.label),
    ...rows.map((row) => cols.map((c) => (row[c.key] != null ? row[c.key] : ''))),
  ];
}

function buildReportCsv(reportMeta, reportRange, reportData) {
  const cols = reportData.columns || [];
  const rows = reportData.rows || [];
  const lines = [
    csvEscape(`${reportMeta.title} — ${reportRange.label}`),
    cols.map((c) => csvEscape(c.label)).join(','),
    ...rows.map((row) => cols.map((c) => csvEscape(row[c.key])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

function buildReportXlsxBuffer(reportMeta, reportRange, reportData) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(reportSheetRows(reportMeta, reportRange, reportData));
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(reportMeta.title));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildBulkCsv(reports) {
  const parts = [];
  for (const { meta, range, data } of reports) {
    parts.push(buildReportCsv(meta, range, data));
    parts.push('');
  }
  return `\uFEFF${parts.join('\r\n')}`;
}

function buildBulkXlsxBuffer(reports) {
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const { meta, data } of reports) {
    let sheetName = safeSheetName(meta.title);
    let n = 2;
    while (used.has(sheetName)) {
      sheetName = safeSheetName(`${meta.title} ${n}`);
      n += 1;
    }
    used.add(sheetName);
    const ws = XLSX.utils.aoa_to_sheet(reportSheetRows(meta, data.range || {}, data));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function exportFilename(reportId, ext, range) {
  const stamp = (range && range.end) || new Date().toISOString().slice(0, 10);
  return `pharmacy-${reportId}-${stamp}.${ext}`;
}

function bulkExportFilename(ext, range) {
  const stamp = (range && range.end) || new Date().toISOString().slice(0, 10);
  return `pharmacy-reports-${stamp}.${ext}`;
}

module.exports = {
  buildReportCsv,
  buildReportXlsxBuffer,
  buildBulkCsv,
  buildBulkXlsxBuffer,
  exportFilename,
  bulkExportFilename,
};
