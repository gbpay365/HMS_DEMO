/* global window, fetch */
(function (global) {
  'use strict';

  function diagBase(module) {
    return module === 'radiology' ? '/radiology' : '/laboratory';
  }

  function openBatchPrintPage(module, suffix) {
    var path = diagBase(module) + suffix;
    var w = global.open(path, '_blank', 'noopener,noreferrer');
    if (!w) {
      global.alert('Allow pop-ups for this site to open the print window.');
      return false;
    }
    return true;
  }

  function parseApiJson(r) {
    var ctype = String((r.headers && r.headers.get('content-type')) || '').toLowerCase();
    if (r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400)) {
      return { success: false, message: 'Session expired or access denied. Sign in again and retry.' };
    }
    if (!ctype.includes('application/json')) {
      return {
        success: false,
        message:
          r.status === 404
            ? 'Print service not found. Restart the HMS server or apply the latest update.'
            : 'Unexpected server response (HTTP ' + r.status + ').',
      };
    }
    return r.json().catch(function () {
      return { success: false, message: 'Invalid server response' };
    });
  }

  function apiFetch(url) {
    return fetch(url, {
      credentials: 'same-origin',
      redirect: 'manual',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    }).then(parseApiJson);
  }

  function apiErrorMessage(j) {
    if (!j) return 'Request failed.';
    return j.message || j.error || 'Request failed.';
  }

  function ensurePrintModule() {
    if (!global.HmsDiagnosticReportPrint || !global.HmsDiagnosticReportPrint.printPayload) {
      global.alert('Print layout failed to load. Refresh the page and try again.');
      return false;
    }
    return true;
  }

  function printEmbeddedPayload() {
    if (!ensurePrintModule()) return false;
    var payload = global.__DIAG_PRINT_PAYLOAD;
    if (!payload || payload.canPrint === false) {
      global.alert('No printable result on this report yet.');
      return false;
    }
    global.HmsDiagnosticReportPrint.printPayload(payload);
    return true;
  }

  function printByApi(module, resultId) {
    if (!ensurePrintModule()) return Promise.resolve(false);
    var id = parseInt(String(resultId || ''), 10) || 0;
    if (id < 1) return Promise.resolve(false);
    var base = module === 'radiology' ? '/api/rad/print-payload/' : '/api/lab/print-payload/';
    return apiFetch(base + id)
      .then(function (j) {
        if (!j || j.success === false || j.ok === false || !j.data) {
          global.alert(apiErrorMessage(j) || 'Could not load report for printing.');
          return false;
        }
        if (!j.data.canPrint) {
          global.alert('No printable result on this report yet.');
          return false;
        }
        global.HmsDiagnosticReportPrint.printPayload(j.data);
        return true;
      })
      .catch(function (e) {
        global.alert(e.message || 'Print request failed.');
        return false;
      });
  }

  function printAllByCode(module, code, btn) {
    var mod = module === 'radiology' ? 'radiology' : 'laboratory';
    var svc = String(code || '').trim().toUpperCase();
    if (!svc) return Promise.resolve(false);
    if (btn) btn.disabled = true;
    openBatchPrintPage(mod, '/print-all-by-code/' + encodeURIComponent(svc));
    if (btn) btn.disabled = false;
    return Promise.resolve(true);
  }

  function printAllByPatient(module, patientId, btn) {
    var mod = module === 'radiology' ? 'radiology' : 'laboratory';
    var pid = parseInt(String(patientId || ''), 10) || 0;
    if (pid < 1) return Promise.resolve(false);
    if (btn) btn.disabled = true;
    openBatchPrintPage(mod, '/print-all/' + encodeURIComponent(pid));
    if (btn) btn.disabled = false;
    return Promise.resolve(true);
  }

  function bindPrintButtons(root) {
    root = root || document;
    root.querySelectorAll('[data-diag-print]').forEach(function (btn) {
      if (btn.__diagPrintBound) return;
      btn.__diagPrintBound = true;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        var mod = btn.getAttribute('data-diag-print') || 'laboratory';
        var rid = btn.getAttribute('data-diag-print-id');
        if (rid) {
          printByApi(mod, rid);
        } else {
          printEmbeddedPayload();
        }
      });
    });
    root.querySelectorAll('[data-diag-print-all-patient]').forEach(function (btn) {
      if (btn.__diagPrintAllPatientBound) return;
      btn.__diagPrintAllPatientBound = true;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        var mod = btn.getAttribute('data-diag-print-all-patient') || 'laboratory';
        var pid = btn.getAttribute('data-diag-patient-id') || '';
        printAllByPatient(mod, pid, btn);
      });
    });
    root.querySelectorAll('[data-diag-print-all]').forEach(function (btn) {
      if (btn.__diagPrintAllBound) return;
      btn.__diagPrintAllBound = true;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        var mod = btn.getAttribute('data-diag-print-all') || 'laboratory';
        var svc = btn.getAttribute('data-diag-print-code') || '';
        printAllByCode(mod, svc, btn);
      });
    });
  }

  function maybeAutoPrint() {
    try {
      var qs = new URLSearchParams(global.location.search);
      if (qs.get('print') !== '1') return;
      if (!global.__DIAG_PRINT_PAYLOAD || global.__DIAG_PRINT_PAYLOAD.canPrint === false) return;
      setTimeout(function () {
        printEmbeddedPayload();
      }, 350);
    } catch (_) {
      /* ignore */
    }
  }

  global.HmsDiagHandover = {
    printEmbeddedPayload: printEmbeddedPayload,
    printByApi: printByApi,
    printAllByCode: printAllByCode,
    printAllByPatient: printAllByPatient,
    bindPrintButtons: bindPrintButtons,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bindPrintButtons();
      maybeAutoPrint();
    });
  } else {
    bindPrintButtons();
    maybeAutoPrint();
  }
})(window);
