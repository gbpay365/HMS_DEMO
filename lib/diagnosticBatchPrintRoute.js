/**
 * Shared render flow for diagnostic batch print (picker vs direct print).
 */

const { parseResultIdList, filterBatchByResultIds } = require('./diagnosticReportPrintPayload');

function renderDiagBatchPrint(req, res, opts = {}) {
  const {
    title,
    batchData,
    backUrl,
    emptyMessage,
    noSelectionMessage,
    module,
    pickerLabels = {},
  } = opts;

  const autoPrint = String(req.query.print || '') === '1';
  const preselectIds = parseResultIdList(req.query.ids);
  const data = batchData || { canPrintAll: false, reports: [], count: 0 };

  if (!data.canPrintAll || !(data.reports || []).length) {
    return res.render('diagnostic-batch-print', {
      title,
      batchData: data,
      backUrl,
      emptyMessage,
    });
  }

  if (autoPrint) {
    const filtered = preselectIds.length ? filterBatchByResultIds(data, preselectIds) : data;
    if (!filtered.canPrintAll || !(filtered.reports || []).length) {
      return res.render('diagnostic-batch-print', {
        title,
        batchData: filtered,
        backUrl,
        emptyMessage: noSelectionMessage || emptyMessage,
      });
    }
    return res.render('diagnostic-batch-print', {
      title,
      batchData: filtered,
      backUrl,
      emptyMessage,
    });
  }

  return res.render('diagnostic-batch-print-picker', {
    title,
    batchData: data,
    backUrl,
    preselectIds,
    module: module || data.module || 'laboratory',
    pickerLabels,
  });
}

module.exports = { renderDiagBatchPrint };
