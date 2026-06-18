/* global Swal, $ */
(function () {
  'use strict';

  var I18N = window.__DIAG_TPL_I18N || {};
  function L(key, fallback) {
    return Object.prototype.hasOwnProperty.call(I18N, key) && I18N[key] != null ? I18N[key] : fallback;
  }
  function Lfmt(key, fallback, vars) {
    var s = L(key, fallback);
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split('{{' + k + '}}').join(String(vars[k]));
      });
    }
    return s;
  }
  function flagBadge(kind) {
    var cls =
      kind === 'low' ? 'badge-primary' : kind === 'high' ? 'badge-warning text-dark' : 'badge-success';
    var label =
      kind === 'low' ? L('flag_low', 'LOW') : kind === 'high' ? L('flag_high', 'HIGH') : L('flag_ok', 'OK');
    return '<span class="badge ' + cls + '">' + escapeHtml(label) + '</span>';
  }

  let RAD_TEST_TEMPLATES = {};

  async function loadRadTemplates() {
    const qs = new URLSearchParams(location.search);
    const r = await fetch('/api/rad/bundle?' + qs.toString(), { credentials: 'same-origin' });
    if (!r.ok) throw new Error(Lfmt('err_load_templates', 'Could not load lab templates (HTTP {{status}})', { status: r.status }));
    const j = await r.json();
    if (!j.success || !j.data) throw new Error(j.message || L('err_invalid_response', 'Invalid response'));
    RAD_TEST_TEMPLATES = j.data;
  }

  async function ensureLabWorkbenchAccess() {
    const qs = new URLSearchParams(location.search);
    const r = await fetch('/api/rad/workbench-access?' + qs.toString(), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    const j = await r.json();
    if (!j.success) throw new Error(j.message || L('err_access_check', 'Access check failed'));
    if (j.access !== false || !j.requireValidation) return;
    if (!window.HmsDiagnosticCodeValidate) {
      throw new Error(j.message || L('err_code_validation', 'Service code validation required.'));
    }
    const validatedCode = await window.HmsDiagnosticCodeValidate.prompt({
      dept: 'radiology',
      prefillCode: j.prefillCode || window.__RAD_ORDER.serviceCode || ''
    });
    const qs2 = new URLSearchParams(location.search);
    if (validatedCode && validatedCode !== (qs2.get('code') || '')) {
      qs2.set('code', validatedCode);
      window.location.search = qs2.toString();
      return;
    }
    const r2 = await fetch('/api/rad/workbench-access?' + qs.toString(), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    const j2 = await r2.json();
    if (!j2.success || j2.access === false) {
      throw new Error(j2.message || L('err_code_not_validated', 'Service code still not validated.'));
    }
  }

  const __qs = new URLSearchParams(location.search);
  window.__RAD_ORDER = {
    serviceCode: (__qs.get('code') || '').trim(),
    opdOrderItemId: parseInt(__qs.get('oi') || '', 10) || 0,
    alertId: parseInt(__qs.get('alert_id') || '', 10) || 0,
    lockPatient: __qs.get('lock') === '1',
    autoload: __qs.get('autoload') === '1',
    fromAlert: __qs.get('from') === 'alert',
    fromCorrection: __qs.get('from') === 'correction',
    radiologyResultId:
      parseInt(__qs.get('radiology_result_id') || __qs.get('registry_id') || __qs.get('rad_result_id') || '', 10) ||
      0,
    correctionMsg: (__qs.get('msg') || '').trim(),
    directCat: (__qs.get('cat') || '').trim(),
    directTest: (__qs.get('test') || '').trim(),
    directTestName: (__qs.get('tname') || '').trim()
  };

  /**
   * Lock patient header fields (ID, name, age/sex, requesting doctor).
   * @param {boolean} [force] — when true, lock even without ?lock=1 (used after order/alert prefill).
   */
  function applyPatientLock(force) {
    if (!force && !window.__RAD_ORDER.lockPatient) return;
    const grid = document.getElementById('labtplPatientGrid');
    if (grid) grid.classList.add('locked');
    ['pid', 'pname', 'page', 'pdoctor'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) {
        el.readOnly = true;
        el.setAttribute('readonly', 'readonly');
        el.setAttribute('aria-readonly', 'true');
      }
    });
  }

  function showSuggestBar(testName) {
    const bar = document.getElementById('radTplSuggestBar');
    const tx = document.getElementById('radTplSuggestText');
    if (tx && testName) {
      tx.innerHTML = Lfmt(
        'suggest_html',
        '<i class="fa fa-magic mr-1 text-success"></i> Suggested template <strong>{{name}}</strong> from the prescribed test. Patient and doctor stay fixed; pick another panel if needed.',
        { name: escapeHtml(testName) }
      );
    }
    if (bar) bar.classList.remove('d-none');
  }

  function hideSuggestBar() {
    const bar = document.getElementById('radTplSuggestBar');
    if (bar) bar.classList.add('d-none');
  }

  window.backToLibraryKeepingPatient = function () {
    hideSuggestBar();
    currentTest = null;
    formValues = {};
    document.getElementById('emptyState').style.display = '';
    document.getElementById('formPanel').classList.remove('visible');
    document.querySelectorAll('.labtpl-test-item').forEach(function (el) {
      el.classList.remove('active');
    });
  };

  function ageFromDob(dob) {
    if (!dob) return '';
    try {
      const d = new Date(dob);
      if (isNaN(d.getTime())) return '';
      const t2 = new Date();
      let a = t2.getFullYear() - d.getFullYear();
      const mn = t2.getMonth() - d.getMonth();
      if (mn < 0 || (mn === 0 && t2.getDate() < d.getDate())) a--;
      return a + 'y';
    } catch (e) {
      return '';
    }
  }

  function ageFromPatient(p) {
    if (!p) return '';
    const fromDob = ageFromDob(p.dob);
    if (fromDob) return fromDob;
    if (p.age_years != null && p.age_years !== '') {
      const n = parseInt(String(p.age_years), 10);
      if (Number.isFinite(n) && n >= 0) return n + 'y~';
    }
    return '';
  }

  async function resolveOrderItemIdIfNeeded() {
    const code = window.__RAD_ORDER.serviceCode;
    if (!code || window.__RAD_ORDER.opdOrderItemId) return;
    const r = await fetch(
      '/api/rad/resolve-order-line?code=' + encodeURIComponent(code),
      { credentials: 'same-origin', headers: { Accept: 'application/json' } }
    );
    const j = await r.json().catch(function () {
      return { success: false, message: L('err_invalid_response', 'Invalid response') };
    });
    if (!j.success || !j.opdOrderItemId) {
      throw new Error(j.message || L('err_load_order', 'Could not load order context'));
    }
    window.__RAD_ORDER.opdOrderItemId = j.opdOrderItemId;
    const qs = new URLSearchParams(location.search);
    qs.set('oi', String(j.opdOrderItemId));
    history.replaceState(null, '', location.pathname + '?' + qs.toString());
  }

  async function maybeLoadOrderContext() {
    const code = window.__RAD_ORDER.serviceCode;
    if (!code) return null;
    await resolveOrderItemIdIfNeeded().catch(function (e) {
      if (window.__RAD_ORDER.opdOrderItemId) return;
      throw e;
    });
    const oid = window.__RAD_ORDER.opdOrderItemId;
    if (!oid) return null;
    const r = await fetch(
      '/api/rad/order-context?code=' + encodeURIComponent(code) + '&oi=' + encodeURIComponent(String(oid)),
      { credentials: 'same-origin' }
    );
    const j = await r.json();
    if (!j.success) throw new Error(j.message || L('err_load_order', 'Could not load order context'));
    const p = j.patient;
    document.getElementById('pid').value = p.id;
    document.getElementById('pname').value = [p.first_name, p.last_name].filter(Boolean).join(' ');
    document.getElementById('page').value =
      p.age_sex || [ageFromPatient(p), p.gender].filter(Boolean).join(' / ');
    if (j.requesting_doctor) {
      document.getElementById('pdoctor').value = j.requesting_doctor;
    }
    applyPatientLock(true);
    const banner = document.getElementById('radTplOrderBanner');
    if (banner) {
      banner.classList.remove('d-none');
      const inm = j.orderItem && j.orderItem.item_name ? escapeHtml(j.orderItem.item_name) : '—';
      banner.innerHTML = Lfmt(
        'linked_order_html',
        '<i class="fa fa-link mr-2"></i><strong>Linked order</strong> · Service code <code class="bg-white px-1 rounded">{{code}}</code> · Item #{{oi}} — <span class="font-weight-bold">{{item}}</span>. Patient fields prefilled; results save to this line.',
        { code: escapeHtml(code), oi: oid, item: inm }
      );
    }
    if (j.radiologyResultId) window.__RAD_ORDER.radiologyResultId = j.radiologyResultId;
    if (j.attachments && window.HmsDiagAttachments) {
      HmsDiagAttachments.renderExisting(j.attachments);
    }
    return j;
  }

  async function maybeLoadCorrectionContext() {
    const lid = window.__RAD_ORDER.radiologyResultId;
    if (!lid) return null;
    const r = await fetch(
      '/api/rad/registry-result-context?radiology_result_id=' + encodeURIComponent(String(lid)),
      { credentials: 'same-origin' }
    );
    const j = await r.json();
    if (!j.success) throw new Error(j.message || L('err_load_registry', 'Could not load registry result'));
    const p = j.data.patient;
    if (p) {
      document.getElementById('pid').value = p.id || '';
      document.getElementById('pname').value = [p.first_name, p.last_name].filter(Boolean).join(' ');
      document.getElementById('page').value =
        p.age_sex || [ageFromPatient(p), p.gender].filter(Boolean).join(' / ');
    }
    applyPatientLock(true);
    const banner = document.getElementById('radTplOrderBanner');
    if (banner) {
      banner.classList.remove('d-none');
      banner.innerHTML = Lfmt(
        'correction_html',
        '<i class="fa fa-edit mr-2"></i><strong>Correction mode</strong> · Updating registry row <strong>#{{id}}</strong>. Open the same template panel, adjust values, then save.',
        { id: lid }
      );
    }
    if (j.data.attachments && window.HmsDiagAttachments) {
      HmsDiagAttachments.renderExisting(j.data.attachments);
    }
    return j.data;
  }

  async function maybeLoadAlertContext() {
    const alertId = window.__RAD_ORDER.alertId;
    if (!alertId) return null;
    const r = await fetch('/api/rad/alert-context?alert_id=' + alertId, { credentials: 'same-origin' });
    const j = await r.json();
    if (!j.success) throw new Error(j.message || L('err_load_alert', 'Could not load alert context'));
    const p = j.patient;
    if (p) {
      document.getElementById('pid').value = p.id || '';
      document.getElementById('pname').value = [p.first_name, p.last_name].filter(Boolean).join(' ');
      document.getElementById('page').value =
        p.age_sex || [ageFromPatient(p), p.gender].filter(Boolean).join(' / ');
    }
    if (j.requesting_doctor) {
      document.getElementById('pdoctor').value = j.requesting_doctor;
    }
    applyPatientLock(true);
    return j;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  let currentTest = null;
  let formValues = {};

  function buildSidebar(filter) {
    filter = filter || '';
    const list = document.getElementById('catList');
    list.innerHTML = '';
    let totalTests = 0;

    for (const [catKey, cat] of Object.entries(RAD_TEST_TEMPLATES)) {
      const filtered = filter
        ? cat.tests.filter(function (t) {
            return (
              t.name.toLowerCase().includes(filter) ||
              t.id.toLowerCase().includes(filter) ||
              cat.label.toLowerCase().includes(filter)
            );
          })
        : cat.tests;

      if (!filtered.length) continue;
      totalTests += filtered.length;

      const grp = document.createElement('div');
      grp.className = 'labtpl-cat-group' + (filter || catKey === 'hematology' ? ' open' : '');
      const testsHtml = filtered
        .map(function (t) {
          return (
            '<div class="labtpl-test-item' +
            (currentTest && currentTest.id === t.id ? ' active' : '') +
            '" data-id="' +
            escapeHtml(t.id) +
            '" data-cat="' +
            escapeHtml(catKey) +
            '">' +
            escapeHtml(t.name) +
            '<span class="labtpl-test-id">' +
            escapeHtml(t.id) +
            '</span></div>'
          );
        })
        .join('');

      grp.innerHTML =
        '<div class="labtpl-cat-header">' +
        '<span style="font-size:1.1rem">' +
        cat.icon +
        '</span>' +
        '<span class="labtpl-cat-label" style="color:' +
        cat.color +
        '">' +
        escapeHtml(cat.label) +
        '</span>' +
        '<span class="badge badge-light border text-muted">' +
        filtered.length +
        '</span>' +
        '<span class="labtpl-cat-chevron">▶</span>' +
        '</div>' +
        '<div class="labtpl-test-list">' +
        testsHtml +
        '</div>';

      grp.querySelector('.labtpl-cat-header').addEventListener('click', function () {
        grp.classList.toggle('open');
      });
      grp.querySelectorAll('.labtpl-test-item').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          loadTest(el.getAttribute('data-cat'), el.getAttribute('data-id'));
        });
      });
      list.appendChild(grp);
    }

    const badge = document.getElementById('radTplTestCount');
    if (badge) {
      badge.textContent = filter
        ? Lfmt(
            totalTests === 1 ? 'match_count_one' : 'match_count_many',
            totalTests === 1 ? '{{count}} match' : '{{count}} matches',
            { count: totalTests }
          )
        : Lfmt('test_count', '{{count}} tests', { count: getAllCount() });
    }
  }

  function getAllCount() {
    return Object.values(RAD_TEST_TEMPLATES).reduce(function (s, c) {
      return s + c.tests.length;
    }, 0);
  }

  window.loadTest = function (catKey, testId) {
    const cat = RAD_TEST_TEMPLATES[catKey];
    if (!cat) return;
    const test = cat.tests.find(function (t) {
      return t.id === testId;
    });
    if (!test) return;

    currentTest = Object.assign({}, test, { catKey: catKey, catColor: cat.color, catIcon: cat.icon, catLabel: cat.label });
    formValues = {};

    const iconEl = document.getElementById('formCatIcon');
    iconEl.textContent = cat.icon;
    iconEl.style.background = cat.color + '18';
    iconEl.style.borderColor = cat.color + '55';

    document.getElementById('formTestName').textContent = test.name;
    document.getElementById('formTestMeta').textContent = Lfmt(
      'form_meta',
      '{{label}} · ID: {{id}} · {{fields}} fields',
      { label: cat.label, id: test.id, fields: test.fields.length }
    );

    renderFields(test.fields);
    document.getElementById('conclusion').value = '';

    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('formPanel').classList.add('visible');

    document.querySelectorAll('.labtpl-test-item').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-id') === testId);
    });

    var refsBtn = document.getElementById('radTplEditRefsBtn');
    var ocrBtn = document.getElementById('radTplOcrBtn');
    if (refsBtn) refsBtn.style.display = window.__RAD_CAN_WRITE ? '' : 'none';
    if (ocrBtn) ocrBtn.style.display = '';
  };

  function reloadTemplateInBundle(testId) {
    return fetch('/api/rad/template/' + encodeURIComponent(testId), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.success || !j.data) return null;
        for (var ck in RAD_TEST_TEMPLATES) {
          var cat = RAD_TEST_TEMPLATES[ck];
          var idx = cat.tests.findIndex(function (t) { return t.id === testId; });
          if (idx >= 0) {
            cat.tests[idx] = j.data;
            return { catKey: ck, test: j.data };
          }
        }
        return null;
      });
  }

  window.openRadRefsModal = function () {
    if (!currentTest || !window.__RAD_CAN_WRITE) return;
    fetch('/api/rad/template/' + encodeURIComponent(currentTest.id) + '/refs', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.success || !j.data) throw new Error((j && j.message) || 'Could not load references');
        var body = document.getElementById('radTplRefsBody');
        body.innerHTML = '';
        (j.data.fields || []).forEach(function (f) {
          var tr = document.createElement('tr');
          tr.innerHTML =
            '<td class="font-weight-bold">' + escapeHtml(f.label) + '</td>' +
            '<td class="text-muted small">' + escapeHtml(f.unit || '') + '</td>' +
            '<td><input class="hms-input w-full text-sm" data-ref-key="' + escapeHtml(f.field_key) + '" data-ref-part="range" value="' + escapeHtml(f.ref_range || '') + '"></td>' +
            '<td><input type="number" step="any" class="hms-input w-full text-sm" data-ref-key="' + escapeHtml(f.field_key) + '" data-ref-part="min" value="' + (f.normal_min != null ? f.normal_min : '') + '"></td>' +
            '<td><input type="number" step="any" class="hms-input w-full text-sm" data-ref-key="' + escapeHtml(f.field_key) + '" data-ref-part="max" value="' + (f.normal_max != null ? f.normal_max : '') + '"></td>';
          body.appendChild(tr);
        });
        $('#radTplRefsModal').modal('show');
      })
      .catch(function (e) { showToast(e.message || String(e), 'error'); });
  };

  window.saveRadRefsModal = function () {
    if (!currentTest) return;
    var fields = [];
    var seen = {};
    document.querySelectorAll('#radTplRefsBody [data-ref-key]').forEach(function (inp) {
      var key = inp.getAttribute('data-ref-key');
      if (!key) return;
      if (!seen[key]) seen[key] = { field_key: key };
      var part = inp.getAttribute('data-ref-part');
      if (part === 'range') seen[key].ref_range = inp.value;
      if (part === 'min') seen[key].normal_min = inp.value;
      if (part === 'max') seen[key].normal_max = inp.value;
    });
    Object.keys(seen).forEach(function (k) { fields.push(seen[k]); });
    fetch('/api/rad/template/' + encodeURIComponent(currentTest.id) + '/refs', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ fields: fields })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.success) throw new Error((j && j.message) || 'Save failed');
        return reloadTemplateInBundle(currentTest.id);
      })
      .then(function (ctx) {
        if (ctx) loadTest(ctx.catKey, currentTest.id);
        $('#radTplRefsModal').modal('hide');
        showToast(L('refs_saved', 'Reference ranges saved.'), 'success');
      })
      .catch(function (e) { showToast(e.message || String(e), 'error'); });
  };

  function applyOcrFields(mapped) {
    (mapped || []).forEach(function (row) {
      var el = document.getElementById('f_' + row.fieldKey);
      if (!el) return;
      el.value = row.value;
      el.classList.toggle('border-warning', row.confidence != null && row.confidence < 0.7);
      el.style.boxShadow = row.confidence != null && row.confidence < 0.7 ? '0 0 0 2px #fbbf24' : '';
      onFieldChange(row.fieldKey, el);
    });
  }

  function runRadOcrAutofill(file) {
    if (!currentTest || !file) return;
    var fd = new FormData();
    fd.append('result_file', file);
    fd.append('testId', currentTest.id);
    showToast(L('ocr_running', 'Extracting text and mapping fields…'), 'info');
    fetch('/api/rad/report/ocr-prefill', { method: 'POST', credentials: 'same-origin', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.success || !j.data) throw new Error((j && j.message) || 'OCR failed');
        applyOcrFields(j.data.fields || []);
        showToast(Lfmt('ocr_done', 'Auto-filled {{count}} field(s). Review highlighted fields.', { count: (j.data.fields || []).length }), 'success');
      })
      .catch(function (e) { showToast(e.message || String(e), 'error'); });
  }

  function renderFields(fields) {
    const grid = document.getElementById('fieldsGrid');
    grid.innerHTML = '';
    grid.className = 'labtpl-field-grid';

    fields.forEach(function (field) {
      const card = document.createElement('div');
      card.className = 'labtpl-field-card' + (field.type === 'textarea' ? ' full-width' : '');

      const label = document.createElement('div');
      label.className = 'labtpl-field-label';
      label.innerHTML =
        escapeHtml(field.label) +
        (field.unit ? '<span class="labtpl-field-unit">' + escapeHtml(field.unit) + '</span>' : '');

      let inputEl;
      if (field.type === 'number') {
        inputEl = document.createElement('input');
        inputEl.type = 'number';
        inputEl.className = 'hms-input w-full text-sm';
        inputEl.id = 'f_' + field.key;
        inputEl.step = 'any';
        inputEl.placeholder = '—';
        inputEl.addEventListener('input', function () {
          onFieldChange(field.key, inputEl);
        });
        const ref = document.createElement('div');
        ref.className = 'labtpl-ref-line';
        ref.id = 'ref_' + field.key;
        ref.textContent = field.refRange ? L('ref_prefix', 'Ref: ') + field.refRange : '';
        const flag = document.createElement('div');
        flag.className = 'labtpl-flag-slot';
        flag.id = 'flag_' + field.key;
        card.appendChild(label);
        card.appendChild(inputEl);
        card.appendChild(ref);
        card.appendChild(flag);
      } else if (field.type === 'textarea') {
        inputEl = document.createElement('textarea');
        inputEl.className = 'hms-input w-full text-sm';
        inputEl.id = 'f_' + field.key;
        inputEl.rows = 3;
        inputEl.placeholder = '—';
        inputEl.addEventListener('input', function () {
          onFieldChange(field.key, inputEl);
        });
        card.appendChild(label);
        card.appendChild(inputEl);
      } else if (field.type === 'select') {
        inputEl = document.createElement('select');
        inputEl.className = 'hms-input w-full text-sm';
        inputEl.id = 'f_' + field.key;
        const o0 = document.createElement('option');
        o0.value = '';
        o0.textContent = L('select_option', '— Select —');
        inputEl.appendChild(o0);
        (field.options || []).forEach(function (o) {
          const opt = document.createElement('option');
          opt.value = o;
          opt.textContent = o;
          inputEl.appendChild(opt);
        });
        inputEl.addEventListener('change', function () {
          onFieldChange(field.key, inputEl);
        });
        card.appendChild(label);
        card.appendChild(inputEl);
      } else {
        inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.className = 'hms-input w-full text-sm';
        inputEl.id = 'f_' + field.key;
        inputEl.placeholder = '—';
        inputEl.addEventListener('input', function () {
          onFieldChange(field.key, inputEl);
        });
        card.appendChild(label);
        card.appendChild(inputEl);
      }
      grid.appendChild(card);
    });
  }

  function onFieldChange(key, el) {
    formValues[key] = el.value;
    if (!currentTest) return;
    const field = currentTest.fields.find(function (f) {
      return f.key === key;
    });
    if (!field || field.type !== 'number') return;

    const val = parseFloat(el.value);
    const badge = document.getElementById('flag_' + key);
    el.classList.remove('flag-high', 'flag-low', 'flag-ok');
    if (badge) badge.innerHTML = '';

    if (!isNaN(val) && field.normalMin !== undefined && field.normalMax !== undefined) {
      if (val < field.normalMin) {
        el.classList.add('flag-low');
        if (badge) badge.innerHTML = flagBadge('low');
      } else if (val > field.normalMax) {
        el.classList.add('flag-high');
        if (badge) badge.innerHTML = flagBadge('high');
      } else {
        el.classList.add('flag-ok');
      }
    }
  }

  function buildReportPrintOpts() {
    const pid = document.getElementById('pid').value;
    const pname = document.getElementById('pname').value;
    const page = document.getElementById('page').value;
    const pdoctor = document.getElementById('pdoctor').value;
    const conc = document.getElementById('conclusion').value;

    currentTest.fields.forEach(function (f) {
      const el = document.getElementById('f_' + f.key);
      if (el) formValues[f.key] = el.value;
    });

    const patientRows = [
      { label: L('report_patient_id', 'Patient ID'), value: pid || '—' },
      { label: L('report_name', 'Name'), value: pname || '—' },
      { label: L('report_age_sex', 'Age / Sex'), value: page || '—' },
      { label: L('report_requesting_dr', 'Requesting doctor'), value: pdoctor || '—' },
      {
        label: L('report_date', 'Report date'),
        value:
          window.HmsDiagnosticReportPrint && HmsDiagnosticReportPrint.formatReportDate
            ? HmsDiagnosticReportPrint.formatReportDate(new Date())
            : formatReportDateFallback(new Date()),
      },
    ];

    const resultRows = [];
    currentTest.fields.forEach(function (f) {
      const val = formValues[f.key];
      if (val == null || String(val).trim() === '') return;
      resultRows.push({
        label: f.label,
        value: String(val),
        unit: f.unit,
        refRange: f.refRange,
        type: f.type,
        normalMin: f.normalMin,
        normalMax: f.normalMax,
      });
    });

    return {
      deptLabel: L('report_dept_radiology', 'Radiology Report'),
      deptSubtitle: L('report_dept_sub', 'Medical imaging department'),
      examName: currentTest.name,
      serviceCode: window.__RAD_ORDER.serviceCode || '',
      accent: '#0891b2',
      signatureLabel: L('report_sig_rad', 'Reporting radiologist'),
      patientRows: patientRows,
      resultRows: resultRows,
      conclusion: conc,
    };
  }

  function formatReportDateFallback(d) {
    try {
      return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (_) {
      return '';
    }
  }

  function previewReport() {
    if (!currentTest) {
      showToast(L('toast_select_test', 'Select a test from the library first.'), 'error');
      return;
    }

    const opts = buildReportPrintOpts();
    let bodyHtml;
    if (window.HmsDiagnosticReportPrint && HmsDiagnosticReportPrint.buildReportHtml) {
      bodyHtml = HmsDiagnosticReportPrint.buildReportHtml(opts);
    } else {
      bodyHtml = '<p class="text-danger">' + escapeHtml(L('err_print_module', 'Report layout module failed to load.')) + '</p>';
    }

    document.getElementById('radTplPreviewModalTitle').textContent =
      currentTest.name + L('preview_suffix', ' — Preview');
    document.getElementById('modalBody').innerHTML = bodyHtml;
    $('#radTplPreviewModal').modal('show');
  }

  function closeModal() {
    $('#radTplPreviewModal').modal('hide');
  }

  window.clearRadTplForm = function () {
    if (!currentTest) return;
    currentTest.fields.forEach(function (f) {
      const el = document.getElementById('f_' + f.key);
      if (!el) return;
      el.value = '';
      el.classList.remove('flag-high', 'flag-low', 'flag-ok');
      const badge = document.getElementById('flag_' + f.key);
      if (badge) badge.innerHTML = '';
    });
    document.getElementById('conclusion').value = '';
    formValues = {};
  };

  window.saveRadTplReport = function () {
    closeModal();
    if (!currentTest) {
      showToast(L('toast_select_test', 'Select a test from the library first.'), 'error');
      return;
    }
    currentTest.fields.forEach(function (f) {
      const el = document.getElementById('f_' + f.key);
      if (el) formValues[f.key] = el.value;
    });
    const report = {
      reportId: 'RPT-' + Date.now(),
      testId: currentTest.id,
      testName: currentTest.name,
      patientInfo: {
        id: document.getElementById('pid').value,
        name: document.getElementById('pname').value,
        ageSex: document.getElementById('page').value,
        doctor: document.getElementById('pdoctor').value
      },
      values: Object.assign({}, formValues),
      conclusion: document.getElementById('conclusion').value,
      savedAt: new Date().toISOString()
    };
    const persistBody = {
      patientInfo: report.patientInfo,
      testId: report.testId,
      values: report.values,
      conclusion: report.conclusion
    };
    if (window.__RAD_ORDER.serviceCode) {
      persistBody.serviceCode = window.__RAD_ORDER.serviceCode;
      if (window.__RAD_ORDER.opdOrderItemId) {
        persistBody.opdOrderItemId = window.__RAD_ORDER.opdOrderItemId;
      }
    } else if (window.__RAD_ORDER.radiologyResultId) {
      persistBody.radiologyResultId = window.__RAD_ORDER.radiologyResultId;
    }
    if (window.__RAD_ORDER.alertId) persistBody.alertId = window.__RAD_ORDER.alertId;
    if (window.__RAD_ORDER.fromAlert) persistBody.fromAlert = true;

    var saveRequest = resolveOrderItemIdIfNeeded()
      .catch(function () {})
      .then(function () {
        if (window.__RAD_ORDER.serviceCode) {
          persistBody.serviceCode = window.__RAD_ORDER.serviceCode;
          if (window.__RAD_ORDER.opdOrderItemId) {
            persistBody.opdOrderItemId = window.__RAD_ORDER.opdOrderItemId;
          }
        }
        return fetch('/api/rad/report/persist', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(persistBody)
        });
      });

    saveRequest
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok && (!j || !j.message)) {
            throw new Error(
              Lfmt('err_http_save', 'Save failed (HTTP {{status}})', { status: r.status })
            );
          }
          return j;
        });
      })
      .then(function (j) {
        if (!j || !j.success) throw new Error((j && j.message) || L('err_save_failed', 'Save failed'));
        var radiologyResultId = (j.data && j.data.radiologyResultId) || window.__RAD_ORDER.radiologyResultId;
        if (radiologyResultId) window.__RAD_ORDER.radiologyResultId = radiologyResultId;
        var attachPromise = Promise.resolve(null);
        if (window.HmsDiagAttachments && HmsDiagAttachments.hasPending()) {
          attachPromise = HmsDiagAttachments.uploadPending('/api/rad', {
            serviceCode: window.__RAD_ORDER.serviceCode,
            opdOrderItemId: window.__RAD_ORDER.opdOrderItemId,
            radiologyResultId: radiologyResultId,
            testName: currentTest ? currentTest.name : '',
            alertId: window.__RAD_ORDER.alertId,
            fromAlert: window.__RAD_ORDER.fromAlert
          });
        }
        return attachPromise.then(function (attachData) {
          var msg = Lfmt('saved_registry', 'Saved to radiology registry · #{{id}}', {
            id: radiologyResultId || '—'
          });
          if (attachData && attachData.attachments && attachData.attachments.length) {
            msg += Lfmt('files_attached', ' · {{count}} file(s) attached', {
              count: attachData.attachments.length
            });
          }
          var redirect = radiologyResultId
            ? '/radiology/report/' + radiologyResultId + '?msg=' + encodeURIComponent(msg) + '&print=1'
            : '/radiology?msg=' + encodeURIComponent(msg);
          window.location.href = redirect;
        });
      })
      .catch(function (e) {
        console.error(e);
        var errMsg = e.message || String(e);
        if (window.__RAD_ORDER.radiologyResultId && window.HmsDiagAttachments && HmsDiagAttachments.hasPending()) {
          errMsg = Lfmt('saved_upload_failed', 'Report saved (# {{id}}) but file upload failed: {{err}}', {
            id: window.__RAD_ORDER.radiologyResultId,
            err: errMsg
          });
        } else {
          errMsg = Lfmt('save_failed_prefix', 'Save failed: {{err}}', { err: errMsg });
        }
        showToast(errMsg, 'error');
      });
  };

  window.printRadTplReport = function () {
    if (!currentTest) {
      showToast(L('toast_select_test', 'Select a test from the library first.'), 'error');
      return;
    }
    if (!window.HmsDiagnosticReportPrint || !HmsDiagnosticReportPrint.openPrintWindow) {
      showToast(L('err_print_module', 'Report layout module failed to load.'), 'error');
      return;
    }
    HmsDiagnosticReportPrint.openPrintWindow(buildReportPrintOpts());
  };

  function showToast(msg, kind) {
    kind = kind || 'success';
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        toast: true,
        position: 'bottom-end',
        icon: kind === 'error' ? 'error' : kind === 'info' ? 'info' : 'success',
        title: msg,
        showConfirmButton: false,
        timer: 3200
      });
    } else {
      window.alert(msg);
    }
  }

  window.previewReport = previewReport;

  $(function () {
    if (window.HmsDiagAttachments) {
      HmsDiagAttachments.init({
        accept: 'image/*,.pdf,.png,.jpg,.jpeg,.webp,.heic'
      });
    }

    document.getElementById('searchInput').addEventListener('input', function () {
      buildSidebar(this.value.toLowerCase().trim());
    });

    var ocrInput = document.getElementById('radTplOcrInput');
    if (ocrInput) {
      ocrInput.addEventListener('change', function () {
        var f = ocrInput.files && ocrInput.files[0];
        ocrInput.value = '';
        if (f) runRadOcrAutofill(f);
      });
    }

    loadRadTemplates()
      .then(function () {
        buildSidebar();
        const badge = document.getElementById('radTplTestCount');
        if (badge) badge.textContent = Lfmt('test_count', '{{count}} tests', { count: getAllCount() });
        return ensureLabWorkbenchAccess();
      })
      .then(function () {
        if (window.__RAD_ORDER.radiologyResultId) {
          return maybeLoadCorrectionContext().catch(function (e) {
            console.warn('correction context', e);
            showToast(e.message || String(e), 'error');
            return null;
          });
        }
        if (window.__RAD_ORDER.alertId && !window.__RAD_ORDER.opdOrderItemId) {
          return maybeLoadAlertContext().catch(function (e) {
            console.warn('alert context', e);
            return null;
          });
        }
        return maybeLoadOrderContext().catch(function (e) {
          console.warn('order context', e);
          if (window.__RAD_ORDER && window.__RAD_ORDER.serviceCode) {
            showToast(Lfmt('order_context_prefix', 'Order context: {{err}}', { err: e.message || String(e) }), 'error');
          }
          return null;
        });
      })
      .then(function (ctx) {
        if (ctx && ctx.structured && ctx.structured.testId) {
          const tid = ctx.structured.testId;
          let catKey = '';
          for (const [ck, cat] of Object.entries(RAD_TEST_TEMPLATES)) {
            if (cat.tests.some(function (t) { return t.id === tid; })) {
              catKey = ck;
              break;
            }
          }
          if (catKey) {
            loadTest(catKey, tid);
            const vals = ctx.structured.values;
            if (vals && typeof vals === 'object') {
              Object.keys(vals).forEach(function (k) {
                const el = document.getElementById('f_' + k);
                if (el) el.value = vals[k] != null ? String(vals[k]) : '';
              });
            } else if (ctx.structured.results && Array.isArray(ctx.structured.results)) {
              ctx.structured.results.forEach(function (row) {
                if (!row || !row.key) return;
                const el = document.getElementById('f_' + row.key);
                if (el) el.value = row.value != null ? String(row.value) : '';
              });
            }
            const concEl = document.getElementById('conclusion');
            if (concEl) concEl.value = ctx.structured.conclusion || '';
          }
        }
        if (window.__RAD_ORDER.correctionMsg) {
          showToast(window.__RAD_ORDER.correctionMsg, 'info');
        }
        const doAuto =
          ctx &&
          ctx.suggestedTemplate &&
          ctx.suggestedTemplate.catKey &&
          ctx.suggestedTemplate.testId &&
          (window.__RAD_ORDER.autoload ||
            window.__RAD_ORDER.lockPatient ||
            window.__RAD_ORDER.fromAlert);
        if (doAuto) {
          loadTest(ctx.suggestedTemplate.catKey, ctx.suggestedTemplate.testId);
          showSuggestBar(ctx.suggestedTemplate.testName || ctx.suggestedTemplate.testId);
        } else if (
          !doAuto &&
          window.__RAD_ORDER.fromAlert &&
          window.__RAD_ORDER.directCat &&
          window.__RAD_ORDER.directTest
        ) {
          loadTest(window.__RAD_ORDER.directCat, window.__RAD_ORDER.directTest);
          showSuggestBar(window.__RAD_ORDER.directTestName || window.__RAD_ORDER.directTest);
        }
        var cBtn = document.getElementById('radTplSuggestContinue');
        var pBtn = document.getElementById('radTplSuggestPickOther');
        if (cBtn && !cBtn.dataset.bound) {
          cBtn.dataset.bound = '1';
          cBtn.addEventListener('click', hideSuggestBar);
        }
        if (pBtn && !pBtn.dataset.bound) {
          pBtn.dataset.bound = '1';
          pBtn.addEventListener('click', function () {
            hideSuggestBar();
            backToLibraryKeepingPatient();
          });
        }
      })
      .catch(function (err) {
        const list = document.getElementById('catList');
        if (list && getAllCount() < 1) {
          list.innerHTML =
            '<div class="p-3 text-danger small">' + escapeHtml(err && err.message ? err.message : String(err)) + '</div>';
        }
        const badge = document.getElementById('radTplTestCount');
        if (badge && getAllCount() < 1) badge.textContent = '0';
        if (getAllCount() > 0) {
          showToast(err && err.message ? err.message : String(err), 'error');
        }
      });
  });
})();
