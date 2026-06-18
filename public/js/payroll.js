/**
 * Payroll & HR module UI helpers (Cameroon logic stays server-side).
 */
(function () {
  'use strict';

  function fmtXaf(n) {
    return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  }

  function confirmPayAction(msg) {
    return window.confirm(msg || 'Continue?');
  }

  /** Wire [data-pay-confirm] forms */
  function initConfirmForms() {
    document.querySelectorAll('form[data-pay-confirm]').forEach(function (form) {
      if (form.dataset.payConfirmBound) return;
      form.dataset.payConfirmBound = '1';
      form.addEventListener('submit', function (e) {
        var msg = form.getAttribute('data-pay-confirm');
        if (!confirmPayAction(msg)) e.preventDefault();
      });
    });
  }

  /** Monthly payroll table filter */
  function initPayrollTableSearch() {
    var input = document.getElementById('payrollLinesSearch');
    var table = document.getElementById('payrollLinesTable');
    if (!input || !table) return;
    if (input.getAttribute('data-hms-server-search')) return;
    var rows = table.querySelectorAll('tbody tr[data-pay-row]');
    input.addEventListener('input', function () {
      var q = (input.value || '').trim().toLowerCase();
      rows.forEach(function (tr) {
        var text = (tr.getAttribute('data-pay-search') || tr.textContent || '').toLowerCase();
        tr.style.display = !q || text.indexOf(q) >= 0 ? '' : 'none';
      });
    });
  }

  /** XAF hint on profile inputs */
  function initProfileInputs() {
    document.querySelectorAll('.pay-input-xaf').forEach(function (el) {
      el.addEventListener('blur', function () {
        var v = String(el.value || '').replace(/\s/g, '').replace(/,/g, '.');
        var n = parseFloat(v);
        if (!isNaN(n) && n >= 0) el.value = String(Math.round(n));
      });
    });
  }

  window.HmsPayroll = {
    fmtXaf: fmtXaf,
    confirmPayAction: confirmPayAction
  };

  document.addEventListener('DOMContentLoaded', function () {
    initConfirmForms();
    initPayrollTableSearch();
    initProfileInputs();
  });
})();
