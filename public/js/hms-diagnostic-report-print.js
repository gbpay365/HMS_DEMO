/* global window */
(function (global) {
  'use strict';

  var LETTERHEAD = '/img/hms-letterhead.png?v=20260515';

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatReportDate(value) {
    if (global.HMS_FORMAT_DATE && typeof global.HMS_FORMAT_DATE.formatDate === 'function') {
      return global.HMS_FORMAT_DATE.formatDate(value || new Date());
    }
    try {
      return new Date(value || Date.now()).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch (_) {
      return '';
    }
  }

  function flagHtml(kind) {
    if (kind === 'low') {
      return '<span class="drpt-flag drpt-flag--low">LOW</span>';
    }
    if (kind === 'high') {
      return '<span class="drpt-flag drpt-flag--high">HIGH</span>';
    }
    if (kind === 'ok') {
      return '<span class="drpt-flag drpt-flag--ok">OK</span>';
    }
    return '';
  }

  function numericFlag(field, val) {
    if (field.type !== 'number' || val === '' || val == null) return '';
    var num = parseFloat(val);
    if (Number.isNaN(num) || field.normalMin === undefined || field.normalMax === undefined) return '';
    if (num < field.normalMin) return flagHtml('low');
    if (num > field.normalMax) return flagHtml('high');
    return flagHtml('ok');
  }

  /**
   * @param {object} opts
   * @param {string} opts.deptLabel — e.g. "Radiology Report"
   * @param {string} opts.examName
   * @param {string} [opts.serviceCode]
   * @param {string} [opts.reportDate]
   * @param {string} [opts.accent] — CSS color
   * @param {Array<{label:string,value:string}>} opts.patientRows
   * @param {Array<{label:string,value:string,unit?:string,refRange?:string,type?:string,normalMin?:number,normalMax?:number}>} opts.resultRows
   * @param {string} [opts.conclusion]
   */
  function buildReportHtml(opts) {
    opts = opts || {};
    var accent = opts.accent || '#0891b2';
    var reportDate = opts.reportDate || formatReportDate(new Date());
    var patientRows = opts.patientRows || [];
    var resultRows = opts.resultRows || [];

    var html = '<div class="drpt-sheet" style="--drpt-accent:' + escapeHtml(accent) + '">';

    html += '<div class="drpt-letterhead">';
    html += '<div class="drpt-lh-banner"><img src="' + LETTERHEAD + '" alt="Hospital letterhead" /></div>';
    html += '<div class="drpt-lh-bar" style="background:' + escapeHtml(accent) + '">';
    html += '<div class="drpt-lh-title">' + escapeHtml(opts.deptLabel || 'Diagnostic Report') + '</div>';
    html += '<div class="drpt-lh-meta">';
    if (opts.serviceCode) {
      html += '<div class="drpt-lh-exam">' + escapeHtml(opts.serviceCode) + '</div>';
    }
    html += '<div>' + escapeHtml(reportDate) + '</div>';
    html += '</div></div></div>';

    html += '<div class="drpt-exam-head">';
    html += '<h1>' + escapeHtml(opts.examName || 'Examination') + '</h1>';
    if (opts.deptSubtitle) {
      html += '<div class="drpt-exam-sub">' + escapeHtml(opts.deptSubtitle) + '</div>';
    }
    html += '</div>';

    if (patientRows.length) {
      html += '<div class="drpt-section"><div class="drpt-section-title">Patient information</div>';
      html += '<div class="drpt-patient-grid">';
      patientRows.forEach(function (row) {
        html +=
          '<div class="drpt-pi-item"><label>' +
          escapeHtml(row.label) +
          '</label><div class="drpt-pi-val">' +
          escapeHtml(row.value || '—') +
          '</div></div>';
      });
      html += '</div></div>';
    }

    if (resultRows.length) {
      var narrative = [];
      var tabular = [];
      resultRows.forEach(function (row) {
        if (row.type === 'textarea' || (row.value && String(row.value).length > 120)) {
          narrative.push(row);
        } else {
          tabular.push(row);
        }
      });

      html += '<div class="drpt-section"><div class="drpt-section-title">Results</div>';

      if (tabular.length) {
        html += '<table class="drpt-results-table"><thead><tr>';
        html += '<th>Parameter</th><th>Result</th><th>Reference</th>';
        html += '</tr></thead><tbody>';
        tabular.forEach(function (row) {
          var flag = numericFlag(row, row.value);
          var resultText = row.value != null && row.value !== '' ? String(row.value) : '—';
          if (row.unit && resultText !== '—') {
            resultText += ' ' + row.unit;
          }
          html += '<tr>';
          html += '<td class="drpt-param">' + escapeHtml(row.label) + '</td>';
          html +=
            '<td>' +
            escapeHtml(resultText) +
            flag +
            '</td>';
          html += '<td class="drpt-ref">' + escapeHtml(row.refRange || '—') + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table>';
      }

      narrative.forEach(function (row) {
        html += '<div style="margin-top:12px">';
        html += '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:6px">';
        html += escapeHtml(row.label);
        html += '</div>';
        html += '<div class="drpt-narrative">' + escapeHtml(row.value || '—') + '</div>';
        html += '</div>';
      });

      html += '</div>';
    }

    if (opts.narrativeFindings) {
      html += '<div class="drpt-section"><div class="drpt-section-title">Findings / report</div>';
      html += '<div class="drpt-narrative">' + escapeHtml(opts.narrativeFindings) + '</div></div>';
    }

    if (opts.conclusion) {
      html += '<div class="drpt-section"><div class="drpt-section-title">Conclusion / interpretation</div>';
      html += '<div class="drpt-conclusion-box">' + escapeHtml(opts.conclusion) + '</div></div>';
    }

    var sigLabel = opts.signatureLabel || 'Reporting clinician';
    html += '<div class="drpt-footer">';
    html += '<div class="drpt-sig">' + escapeHtml(sigLabel) + ' <span class="drpt-sig-line">&nbsp;</span></div>';
    html += '<div class="drpt-foot-note">Official diagnostic report for patient handover. Correlate clinically before treatment decisions.</div>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  function openPrintWindow(opts) {
    var title = (opts.examName || opts.deptLabel || 'Report') + ' — ' + (opts.reportDate || formatReportDate(new Date()));
    var body = buildReportHtml(opts);
    var w = global.open('', '_blank');
    if (!w) return null;
    w.document.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
        escapeHtml(title) +
        '</title><link rel="stylesheet" href="/css/diagnostic-report-print.css?v=1"></head><body>' +
        body +
        '<script>window.onload=function(){window.print();};<\/script></body></html>'
    );
    w.document.close();
    return w;
  }

  function payloadToOpts(payload) {
    payload = payload || {};
    var patientRows = (payload.patientRows || []).map(function (row) {
      if (row.label === 'Report date' && row.value) {
        return { label: row.label, value: formatReportDate(row.value) };
      }
      return row;
    });
    return {
      deptLabel: payload.deptLabel,
      deptSubtitle: payload.deptSubtitle,
      examName: payload.examName,
      serviceCode: payload.serviceCode || payload.registryRef || '',
      reportDate: payload.reportDate ? formatReportDate(payload.reportDate) : formatReportDate(new Date()),
      accent: payload.accent,
      signatureLabel: payload.signatureLabel,
      patientRows: patientRows,
      resultRows: payload.resultRows || [],
      conclusion: payload.conclusion || '',
      narrativeFindings: payload.narrativeFindings || '',
    };
  }

  function printPayload(payload) {
    if (!payload || payload.canPrint === false) return null;
    return openPrintWindow(payloadToOpts(payload));
  }

  function buildBatchCoverHtml(batch) {
    batch = batch || {};
    var accent = batch.accent || '#7c3aed';
    var reports = batch.reports || [];
    var reportDate = formatReportDate(new Date());
    var html = '<div class="drpt-sheet drpt-batch-cover" style="--drpt-accent:' + escapeHtml(accent) + '">';

    html += '<div class="drpt-letterhead">';
    html += '<div class="drpt-lh-banner"><img src="' + LETTERHEAD + '" alt="Hospital letterhead" /></div>';
    html += '<div class="drpt-lh-bar" style="background:' + escapeHtml(accent) + '">';
    html +=
      '<div class="drpt-lh-title">' +
      escapeHtml(batch.deptLabel || 'Diagnostic Report') +
      ' — ' +
      escapeHtml(batch.packageTitle || 'Patient package') +
      '</div>';
    html += '<div class="drpt-lh-meta"><div class="drpt-lh-exam">' + escapeHtml(batch.serviceCode || '') + '</div>';
    html += '<div>' + escapeHtml(reportDate) + '</div></div></div></div>';

    html += '<div class="drpt-exam-head"><h1>' + escapeHtml(batch.packageTitle || 'Combined results') + '</h1>';
    html +=
      '<div class="drpt-exam-sub">' +
      escapeHtml(String(reports.length)) +
      ' completed report' +
      (reports.length === 1 ? '' : 's') +
      ' for patient handover</div></div>';

    html += '<div class="drpt-section"><div class="drpt-section-title">Patient information</div>';
    html += '<div class="drpt-patient-grid">';
    html +=
      '<div class="drpt-pi-item"><label>Patient ID</label><div class="drpt-pi-val">' +
      escapeHtml(batch.patientId || '—') +
      '</div></div>';
    html +=
      '<div class="drpt-pi-item"><label>Name</label><div class="drpt-pi-val">' +
      escapeHtml(batch.patientName || '—') +
      '</div></div>';
    html +=
      '<div class="drpt-pi-item"><label>Requesting doctor</label><div class="drpt-pi-val">' +
      escapeHtml(batch.referringDoctor || '—') +
      '</div></div>';
    html +=
      '<div class="drpt-pi-item"><label>Service code</label><div class="drpt-pi-val">' +
      escapeHtml(batch.serviceCode || '—') +
      '</div></div>';
    html += '</div></div>';

    html += '<div class="drpt-section"><div class="drpt-section-title">Reports in this package</div>';
    html += '<table class="drpt-results-table drpt-batch-index"><thead><tr>';
    html += '<th style="width:42px">#</th><th>Exam / test</th><th>Registry ref.</th></tr></thead><tbody>';
    reports.forEach(function (payload, idx) {
      html += '<tr>';
      html += '<td>' + String(idx + 1) + '</td>';
      html += '<td class="drpt-param">' + escapeHtml(payload.examName || 'Report') + '</td>';
      html += '<td>' + escapeHtml(payload.registryRef || '—') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    html +=
      '<div class="drpt-foot-note" style="margin-top:18px">The following pages contain the full official report for each completed line. Give the entire printed package to the patient.</div>';
    html += '</div>';
    return html;
  }

  function buildBatchDocumentHtml(batch) {
    batch = batch || {};
    var reports = (batch.reports || []).filter(function (p) {
      return p && p.canPrint !== false;
    });
    if (!reports.length) return null;

    var body = buildBatchCoverHtml(batch);
    reports.forEach(function (payload) {
      body += '<div class="drpt-batch-page">' + buildReportHtml(payloadToOpts(payload)) + '</div>';
    });
    var title =
      (batch.serviceCode || 'Results') +
      ' — ' +
      (batch.patientName || 'Patient') +
      ' (' +
      reports.length +
      ' reports)';
    return {
      title: title,
      body: body,
      count: reports.length,
    };
  }

  function openBatchPrintWindow(batch) {
    var doc = buildBatchDocumentHtml(batch);
    if (!doc) return null;

    var w = global.open('', '_blank');
    if (!w) return null;
    w.document.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
        escapeHtml(doc.title) +
        '</title><link rel="stylesheet" href="/css/diagnostic-report-print.css?v=2"></head><body class="drpt-batch-doc">' +
        doc.body +
        '<script>window.onload=function(){window.print();};<\/script></body></html>'
    );
    w.document.close();
    return w;
  }

  function renderBatchInline(batch, opts) {
    opts = opts || {};
    var doc = buildBatchDocumentHtml(batch);
    if (!doc || !global.document || !global.document.body) return false;

    global.document.title = doc.title;
    global.document.body.className = 'drpt-batch-doc';
    global.document.body.innerHTML =
      doc.body +
      '<div class="dbp-print-actions no-print" style="position:fixed;bottom:16px;right:16px;z-index:9999;display:flex;gap:8px;">' +
      '<button type="button" onclick="window.print()" style="padding:10px 18px;border:0;border-radius:999px;background:#0d9488;color:#fff;font-weight:700;cursor:pointer;">Print</button>' +
      (opts.backUrl
        ? '<a href="' +
          escapeHtml(opts.backUrl) +
          '" style="padding:10px 18px;border-radius:999px;background:#e2e8f0;color:#334155;font-weight:700;text-decoration:none;">Back</a>'
        : '') +
      '</div>';

    if (opts.autoPrint !== false) {
      setTimeout(function () {
        try {
          global.print();
        } catch (_) {
          /* ignore */
        }
      }, opts.printDelay != null ? opts.printDelay : 400);
    }
    return true;
  }

  function printBatch(batch) {
    if (!batch || !batch.canPrintAll || !(batch.reports || []).length) return null;
    return openBatchPrintWindow(batch);
  }

  global.HmsDiagnosticReportPrint = {
    LETTERHEAD: LETTERHEAD,
    buildReportHtml: buildReportHtml,
    buildBatchCoverHtml: buildBatchCoverHtml,
    buildBatchDocumentHtml: buildBatchDocumentHtml,
    openPrintWindow: openPrintWindow,
    openBatchPrintWindow: openBatchPrintWindow,
    renderBatchInline: renderBatchInline,
    formatReportDate: formatReportDate,
    payloadToOpts: payloadToOpts,
    printPayload: printPayload,
    printBatch: printBatch,
  };
})(window);
