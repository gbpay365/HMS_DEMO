(function () {
  'use strict';

  function parseCatalog() {
    var el = document.getElementById('walkinCatalogJson');
    if (!el) return [];
    try {
      return JSON.parse(el.textContent || '[]');
    } catch (_) {
      return [];
    }
  }

  function parseMoneyConfig() {
    var el = document.getElementById('walkinMoneyConfig');
    if (!el) return { symbol: '', locale: 'en-NG', code: 'NGN' };
    try {
      return JSON.parse(el.textContent || '{}');
    } catch (_) {
      return { symbol: '', locale: 'en-NG', code: 'NGN' };
    }
  }

  function fmtMoney(n) {
    var cfg = parseMoneyConfig();
    var formatted = Number(n || 0).toLocaleString(cfg.locale || 'en-NG', { maximumFractionDigits: 0 });
    var symbol = String(cfg.symbol || '').trim();
    var code = String(cfg.code || '').trim();
    if (symbol && symbol !== code) return symbol + formatted;
    if (code) return formatted + ' ' + code;
    return formatted;
  }

  function initSelectFilter(inputId, selectId) {
    var input = document.getElementById(inputId);
    var sel = document.getElementById(selectId) || document.querySelector('select[name="' + selectId + '"]');
    if (!input || !sel) return;

    var stored = [];
    Array.prototype.forEach.call(sel.children, function (child) {
      if (child.tagName === 'OPTGROUP') {
        Array.prototype.forEach.call(child.children, function (opt) {
          stored.push({ group: child.label, opt: opt.cloneNode(true) });
        });
      } else if (child.tagName === 'OPTION') {
        stored.push({ group: null, opt: opt.cloneNode(true) });
      }
    });

    function rebuild() {
      var q = String(input.value || '').trim().toLowerCase();
      var current = sel.value;
      sel.innerHTML = '';
      var groups = {};
      stored.forEach(function (item) {
        var text = String(item.opt.textContent || '').toLowerCase();
        if (q && text.indexOf(q) < 0 && item.opt.value !== current && item.opt.value !== '') return;
        if (item.group) {
          if (!groups[item.group]) {
            groups[item.group] = document.createElement('optgroup');
            groups[item.group].label = item.group;
            sel.appendChild(groups[item.group]);
          }
          groups[item.group].appendChild(item.opt.cloneNode(true));
        } else {
          sel.appendChild(item.opt.cloneNode(true));
        }
      });
      if (current) sel.value = current;
      if (selectId === 'walkinCreditProvider' || sel.id === 'walkinCreditProvider') syncProviderChips(sel);
    }

    input.addEventListener('input', rebuild);
    sel.addEventListener('change', function () {
      if (selectId === 'walkinCreditProvider' || sel.id === 'walkinCreditProvider') syncProviderChips(sel);
    });
    return sel;
  }

  function syncProviderChips(sel) {
    var chipsEl = document.getElementById('walkinProviderChips');
    if (!chipsEl || !sel) return;
    chipsEl.querySelectorAll('.walkin-provider-chip:not(.walkin-provider-chip--type)').forEach(function (btn) {
      var active = String(btn.getAttribute('data-value')) === String(sel.value);
      btn.classList.toggle('is-active', active);
    });
  }

  function initProviderChips(sel) {
    var chipsEl = document.getElementById('walkinProviderChips');
    if (!chipsEl || !sel) return;

    var byType = {};
    Array.prototype.forEach.call(sel.options, function (opt) {
      if (!opt.value) return;
      var t = opt.getAttribute('data-type') || 'other';
      if (!byType[t]) byType[t] = [];
      byType[t].push(opt);
    });

    var typeLabels = {
      walkin: 'Self pay',
      hmo: 'HMO',
      social: 'Social',
      mutual: 'Mutual',
      insurance: 'Insurance',
      corporate: 'Corporate',
      other: 'Other',
    };

    chipsEl.innerHTML = '';
    ['walkin', 'social', 'hmo', 'mutual', 'insurance', 'corporate'].forEach(function (t) {
      var list = byType[t];
      if (!list || !list.length) return;
      var label = document.createElement('span');
      label.className = 'walkin-provider-chip walkin-provider-chip--type';
      label.textContent = typeLabels[t] || t;
      chipsEl.appendChild(label);
      list.slice(0, t === 'insurance' ? 8 : 4).forEach(function (opt) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'walkin-provider-chip';
        btn.setAttribute('data-value', opt.value);
        btn.textContent = opt.textContent.replace(/\s*\([^)]*\)\s*$/, '').trim();
        btn.title = opt.textContent;
        btn.addEventListener('click', function () {
          sel.value = opt.value;
          syncProviderChips(sel);
        });
        chipsEl.appendChild(btn);
      });
    });
    syncProviderChips(sel);
  }

  function initTestPicker(catalog) {
    var searchEl = document.getElementById('walkinTestSearch');
    var deptEl = document.getElementById('walkinDeptFilter');
    var listEl = document.getElementById('walkinTestList');
    var selectedEl = document.getElementById('walkinSelectedTests');
    var totalEl = document.getElementById('walkinSelectedTotal');
    var hiddenEl = document.getElementById('walkinTestHiddenInputs');
    var form = document.getElementById('walkinForm');
    if (!searchEl || !listEl || !selectedEl || !hiddenEl) return;

    var walkinKind = (form && form.getAttribute('data-walkin-kind')) || 'laboratory';
    var isRadiology = walkinKind === 'radiology';
    var itemWordPlural = isRadiology ? 'exams' : 'tests';
    var deptDefault = isRadiology ? 'Imaging' : 'Other';

    var selected = new Map();

    function departments() {
      var set = new Set();
      catalog.forEach(function (c) {
        var d = String(c.department_name || deptDefault).trim() || deptDefault;
        set.add(d);
      });
      return Array.from(set).sort();
    }

    function renderDeptFilter() {
      if (!deptEl) return;
      deptEl.innerHTML = '<button type="button" class="hms-chip active" data-dept="">All</button>';
      departments().forEach(function (d) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hms-chip';
        btn.setAttribute('data-dept', d);
        btn.textContent = d;
        deptEl.appendChild(btn);
      });
      deptEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-dept]');
        if (!btn) return;
        deptEl.querySelectorAll('.hms-chip').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        renderList();
      });
    }

    function activeDept() {
      if (!deptEl) return '';
      var active = deptEl.querySelector('.hms-chip.active');
      return active ? active.getAttribute('data-dept') || '' : '';
    }

    function matchesFilter(c) {
      var q = String(searchEl.value || '').trim().toLowerCase();
      var dept = activeDept();
      var blob = (c.name + ' ' + (c.department_name || '')).toLowerCase();
      if (dept && String(c.department_name || deptDefault) !== dept) return false;
      if (q && blob.indexOf(q) < 0) return false;
      return true;
    }

    function syncHidden() {
      hiddenEl.innerHTML = '';
      selected.forEach(function (c) {
        var inp = document.createElement('input');
        inp.type = 'hidden';
        inp.name = 'service_catalog_id';
        inp.value = String(c.id);
        hiddenEl.appendChild(inp);
      });
      var total = 0;
      selected.forEach(function (c) {
        total += parseFloat(c.price) || 0;
      });
      if (totalEl) totalEl.textContent = fmtMoney(total);
    }

    function renderSelected() {
      selectedEl.innerHTML = '';
      if (!selected.size) {
        selectedEl.innerHTML =
          '<span class="text-muted small">No ' +
          itemWordPlural +
          ' selected — search and click to add.</span>';
        syncHidden();
        return;
      }
      selected.forEach(function (c) {
        var chip = document.createElement('span');
        chip.className = 'walkin-test-chip';
        chip.innerHTML =
          '<span class="walkin-test-chip__label">' +
          escapeHtml(c.name) +
          ' <span class="text-muted">(' +
          fmtMoney(c.price) +
          ')</span></span>' +
          '<button type="button" class="walkin-test-chip__rm" aria-label="Remove">&times;</button>';
        chip.querySelector('.walkin-test-chip__rm').addEventListener('click', function () {
          selected.delete(String(c.id));
          renderSelected();
          renderList();
        });
        selectedEl.appendChild(chip);
      });
      syncHidden();
    }

    function escapeHtml(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function renderList() {
      listEl.innerHTML = '';
      var shown = 0;
      catalog.forEach(function (c) {
        if (!matchesFilter(c)) return;
        shown++;
        var id = String(c.id);
        var isSel = selected.has(id);
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'walkin-test-row' + (isSel ? ' is-selected' : '');
        row.innerHTML =
          '<span class="walkin-test-row__name">' +
          escapeHtml(c.name) +
          (c.department_name
            ? ' <span class="text-muted">(' + escapeHtml(c.department_name) + ')</span>'
            : '') +
          '</span>' +
          '<span class="walkin-test-row__price">' +
          fmtMoney(c.price) +
          '</span>' +
          (isSel ? '<span class="walkin-test-row__tick">✓</span>' : '');
        row.addEventListener('click', function () {
          if (selected.has(id)) selected.delete(id);
          else selected.set(id, c);
          renderSelected();
          renderList();
        });
        listEl.appendChild(row);
      });
      if (!shown) {
        listEl.innerHTML =
          '<p class="text-muted small mb-0 p-2">No ' + itemWordPlural + ' match your search.</p>';
      }
    }

    searchEl.addEventListener('input', renderList);
    renderDeptFilter();
    renderSelected();
    renderList();

    if (form) {
      form.addEventListener('submit', function (e) {
        if (!selected.size) {
          e.preventDefault();
          alert('Select at least one ' + (isRadiology ? 'radiology exam' : 'laboratory test') + '.');
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var providerSel = initSelectFilter('walkinProviderSearch', 'walkinCreditProvider');
    initSelectFilter('walkinReferrerSearch', 'walkinReferrerSelect');
    initProviderChips(providerSel);
    initTestPicker(parseCatalog());
  });
})();
