/**
 * Pharmacy Odoo UI — search, filters, list/kanban, favorites, pager
 */
(function () {
  'use strict';

  var root = document.getElementById('pharmOdooApp');
  if (!root) return;

  var searchInput = document.getElementById('phaOdooSearch');
  var pagerText = document.getElementById('phaPagerText');
  var currentFilter = 'all';
  var defaultLayout = window.__PHA_DEFAULT_LAYOUT || 'kanban';
  var currentLayout = defaultLayout;

  function activePanel() {
    return root.querySelector('.o_view_panel.active');
  }

  function visibleRecords() {
    var panel = activePanel();
    if (!panel) return { shown: 0, total: 0 };
    var nodes = panel.querySelectorAll('[data-pha-search], tbody tr[data-pha-search]');
    var total = nodes.length;
    var shown = 0;
    nodes.forEach(function (el) {
      if (el.style.display !== 'none') shown++;
    });
    return { shown: shown, total: total };
  }

  function updatePager() {
    if (!pagerText) return;
    var v = visibleRecords();
    if (!v.total) {
      pagerText.textContent = '0 / 0';
      return;
    }
    pagerText.textContent = '1-' + v.shown + ' / ' + v.total;
  }

  function applySearchAndFilter() {
    var panel = activePanel();
    if (!panel) return;
    var q = (searchInput && searchInput.value ? searchInput.value : '').toLowerCase().trim();

    panel.querySelectorAll('[data-pha-search]').forEach(function (el) {
      var hay = (el.getAttribute('data-pha-search') || '').toLowerCase();
      var f = el.getAttribute('data-pha-filter') || '';
      var matchQ = !q || hay.indexOf(q) >= 0;
      var matchF =
        currentFilter === 'all' ||
        f === currentFilter ||
        (currentFilter === 'pending' && f === 'pending');
      el.style.display = matchQ && matchF ? '' : 'none';
    });

    panel.querySelectorAll('tbody tr[data-pha-search]').forEach(function (tr) {
      var hay = (tr.getAttribute('data-pha-search') || '').toLowerCase();
      var f = tr.getAttribute('data-pha-filter') || '';
      var matchQ = !q || hay.indexOf(q) >= 0;
      var matchF = currentFilter === 'all' || f === currentFilter;
      tr.style.display = matchQ && matchF ? '' : 'none';
    });

    updatePager();
  }

  if (searchInput) {
    searchInput.addEventListener('input', applySearchAndFilter);
  }

  document.querySelectorAll('[data-pha-filter-chip]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var chip = a.getAttribute('data-pha-filter-chip');
      if (chip) {
        currentFilter = chip;
        var chipEl = document.getElementById('phaSearchChip');
        if (chipEl) chipEl.textContent = chip === 'low' ? 'Low stock' : chip === 'out' ? 'Out of stock' : chip;
        setTimeout(applySearchAndFilter, 50);
      }
    });
  });

  function setLayout(layout) {
    currentLayout = layout;
    var panel = activePanel();
    if (!panel) return;
    panel.querySelectorAll('[data-pha-layout-panel]').forEach(function (el) {
      var isList = el.getAttribute('data-pha-layout-panel') === 'list';
      if (layout === 'list') {
        el.classList.toggle('d-none', !isList);
      } else {
        el.classList.toggle('d-none', isList);
      }
    });
    var switcher = root.querySelector('[data-pha-view-switcher]');
    if (switcher) {
      switcher.querySelectorAll('button').forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-pha-layout') === layout);
      });
    }
    applySearchAndFilter();
  }

  root.querySelectorAll('[data-pha-view-switcher] button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setLayout(btn.getAttribute('data-pha-layout') || 'list');
    });
  });

  root.querySelectorAll('.o_product_fav').forEach(function (fav) {
    fav.addEventListener('click', function (e) {
      e.stopPropagation();
      fav.classList.toggle('is-fav');
      var icon = fav.querySelector('i');
      if (icon) {
        icon.className = fav.classList.contains('is-fav') ? 'fa fa-star' : 'fa fa-star-o';
      }
    });
  });

  var openReceive = document.querySelector('[data-pha-open-receive="1"]');
  if (openReceive) {
    openReceive.addEventListener('click', function (e) {
      if (window.location.pathname.indexOf('/pharmacy') >= 0 && window.$) {
        e.preventDefault();
        $('#addStockModal').modal('show');
      }
    });
  }

  setLayout(defaultLayout);
  applySearchAndFilter();
})();
