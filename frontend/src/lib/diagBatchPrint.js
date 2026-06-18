/** Open diagnostic patient batch print (picker or direct print with selected ids). */

export function isLabRowPrintable(row) {
  if (!row || Number(row.revision_pending) === 1) return false;
  const s = String(row.status || '').toLowerCase();
  return s === 'received' || s === 'completed' || s === 'done' || s === 'in_progress' || s === 'external';
}

export function isRadRowPrintable(row) {
  if (!row || Number(row.revision_pending) === 1) return false;
  if (row.row_kind === 'request') return false;
  const rid = radResultPrintId(row);
  if (rid < 1) return false;
  const s = String(row.status || '').toLowerCase();
  return s === 'received' || s === 'done' || s === 'completed' || s === 'in_progress';
}

export function radResultPrintId(row) {
  if (row?.row_kind === 'request') return 0;
  return parseInt(String(row?.radiology_result_id || row?.id || ''), 10) || 0;
}

export function labResultPrintId(row) {
  return parseInt(String(row?.id || ''), 10) || 0;
}

export function isChartRadPrintable(row) {
  const id = parseInt(String(row?.id || ''), 10) || 0;
  if (id < 1) return false;
  if (Number(row.revision_pending) === 1) return false;
  const s = String(row.status || '').toLowerCase();
  return s === 'received' || s === 'done' || s === 'completed' || s === 'in_progress';
}

export function isChartLabPrintable(row) {
  const id = labReportId(row);
  if (id < 1) return false;
  if (Number(row.revision_pending) === 1) return false;
  const s = String(row.status || '').toLowerCase();
  return s === 'received' || s === 'completed' || s === 'done' || s === 'in_progress' || s === 'external';
}

export function labReportId(row) {
  const raw = row?.lab_result_id ?? row?.id ?? row?.result_id;
  const n = parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function openDiagPatientBatchPrint(module, patientId, opts = {}) {
  const base = module === 'radiology' ? '/radiology' : '/laboratory';
  const pid = parseInt(String(patientId || ''), 10) || 0;
  if (pid < 1) return;
  const params = new URLSearchParams();
  const ids = (opts.ids || []).map((id) => parseInt(id, 10)).filter((n) => n > 0);
  if (opts.print) {
    params.set('print', '1');
    if (ids.length) params.set('ids', ids.join(','));
  } else if (ids.length) {
    params.set('ids', ids.join(','));
  }
  const qs = params.toString();
  window.open(`${base}/print-all/${pid}${qs ? `?${qs}` : ''}`, '_blank', 'noopener,noreferrer');
}

export function openDiagCodeBatchPrint(module, code, opts = {}) {
  const base = module === 'radiology' ? '/radiology' : '/laboratory';
  const svc = String(code || '').trim();
  if (!svc) return;
  const params = new URLSearchParams();
  const ids = (opts.ids || []).map((id) => parseInt(id, 10)).filter((n) => n > 0);
  if (opts.print) {
    params.set('print', '1');
    if (ids.length) params.set('ids', ids.join(','));
  } else if (ids.length) {
    params.set('ids', ids.join(','));
  }
  const qs = params.toString();
  window.open(`${base}/print-all-by-code/${encodeURIComponent(svc)}${qs ? `?${qs}` : ''}`, '_blank', 'noopener,noreferrer');
}
