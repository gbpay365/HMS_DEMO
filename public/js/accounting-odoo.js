(function () {
  'use strict';

  function initJournalRows() {
    document.querySelectorAll('.acc-odoo .o_list_row[data-href], .acc-odoo .fin-journal-row[data-href]').forEach(function (row) {
      if (row.dataset.accBound === '1') return;
      row.dataset.accBound = '1';
      row.addEventListener('click', function (e) {
        if (e.target.closest('a, button, input, select, label')) return;
        var href = row.getAttribute('data-href');
        if (href) window.location.href = href;
      });
    });
  }

  function initListSelection() {
    document.querySelectorAll('.acc-odoo .o_list_view tbody').forEach(function (tbody) {
      tbody.addEventListener('click', function (e) {
        var tr = e.target.closest('tr.o_list_row');
        if (!tr) return;
        tbody.querySelectorAll('tr.o_list_row.o_selected').forEach(function (r) {
          if (r !== tr) r.classList.remove('o_selected');
        });
        tr.classList.toggle('o_selected');
      });
    });
  }

  function initExpenseFilters() {
    var table = document.getElementById('expensesTable');
    if (!table) return;
    var rows = table.querySelectorAll('tbody tr');
    var minD = document.getElementById('expMinDate');
    var maxD = document.getElementById('expMaxDate');
    var search = document.getElementById('expSearch');
    var clearBtn = document.getElementById('expClearFilters');
    function apply() {
      var min = minD && minD.value ? minD.value : '';
      var max = maxD && maxD.value ? maxD.value : '';
      var q = search && search.value ? search.value.trim().toLowerCase() : '';
      rows.forEach(function (tr) {
        var d = tr.getAttribute('data-date') || '';
        var blob = tr.getAttribute('data-search') || '';
        var show = true;
        if (min && d && d < min) show = false;
        if (max && d && d > max) show = false;
        if (q && blob.indexOf(q) === -1) show = false;
        tr.style.display = show ? '' : 'none';
      });
    }
    [minD, maxD, search].forEach(function (el) {
      if (el) el.addEventListener('input', apply);
    });
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (minD) minD.value = '';
        if (maxD) maxD.value = '';
        if (search) search.value = '';
        apply();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initJournalRows();
    initListSelection();
    initExpenseFilters();
  });
})();
