(function () {
  'use strict';

  var WHO_HOURS = 12;
  var SLOT_COUNT = WHO_HOURS * 2;

  function parseDate(value) {
    var d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function hoursSinceAdmission(entry, admission) {
    var at = parseDate(entry.recorded_at);
    if (at && admission) return (at - admission) / 3600000;
    var label = String(entry.time_label || '').trim();
    if (/^\d{3,4}$/.test(label) && admission) {
      var hh = parseInt(label.length === 3 ? label.slice(0, 1) : label.slice(0, 2), 10);
      var mm = parseInt(label.length === 3 ? label.slice(1) : label.slice(2), 10);
      var t = new Date(admission);
      t.setHours(hh, mm, 0, 0);
      if (t < admission) t.setDate(t.getDate() + 1);
      return (t - admission) / 3600000;
    }
    return null;
  }

  /** WHO alert: 4 cm in 4 h, then ≥1 cm/h. */
  function alertDilationAt(h) {
    if (h < 0) return 0;
    if (h <= 4) return h;
    return Math.min(10, 4 + (h - 4));
  }

  function actionDilationAt(h) {
    return alertDilationAt(h - 4);
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attrs || {}).forEach(function (k) {
      el.setAttribute(k, attrs[k]);
    });
    return el;
  }

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function formatSlotTime(admission, slotIndex) {
    if (!admission) return '';
    var t = new Date(admission.getTime() + slotIndex * 30 * 60000);
    return pad2(t.getHours()) + ':' + pad2(t.getMinutes());
  }

  function normalizeEntries(data) {
    var admission = parseDate(data.admissionDate) || new Date();
    return (data.entries || [])
      .map(function (e) {
        var h = hoursSinceAdmission(e, admission);
        return Object.assign({}, e, { hours: h });
      })
      .filter(function (e) {
        return e.hours != null && !Number.isNaN(e.hours);
      })
      .sort(function (a, b) {
        return a.hours - b.hours;
      });
  }

  function slotIndexForHours(h) {
    return Math.max(0, Math.min(SLOT_COUNT - 1, Math.round(h * 2)));
  }

  function mapEntriesToSlots(entries) {
    var slots = new Array(SLOT_COUNT).fill(null);
    entries.forEach(function (e) {
      var idx = slotIndexForHours(e.hours);
      if (!slots[idx] || e.hours >= (slots[idx].hours || 0)) slots[idx] = e;
    });
    return slots;
  }

  function liquorShort(v) {
    if (!v) return '';
    var s = String(v).toLowerCase();
    if (s.indexOf('intact') >= 0) return 'I';
    if (s.indexOf('clear') >= 0) return 'C';
    if (s.indexOf('mecon') >= 0) return 'M';
    if (s.indexOf('absent') >= 0 || s.indexOf('dry') >= 0) return 'A';
    return String(v).slice(0, 4);
  }

  function formatUrine(e) {
    var parts = [];
    if (e.urine_volume != null && e.urine_volume !== '') parts.push(e.urine_volume + 'ml');
    if (e.urine_protein) parts.push('P:' + e.urine_protein);
    if (e.urine_acetone) parts.push('A:' + e.urine_acetone);
    return parts.join(' ');
  }

  function formatOxytocin(e) {
    var u = e.oxytocin_units;
    var d = e.oxytocin_drops;
    if (u == null && d == null) return '';
    if (u != null && d != null) return u + 'U/' + d;
    return u != null ? String(u) + 'U' : String(d);
  }

  function formatBp(e) {
    if (e.bp_systolic == null && e.bp_diastolic == null) return '';
    return (e.bp_systolic != null ? e.bp_systolic : '—') + '/' + (e.bp_diastolic != null ? e.bp_diastolic : '—');
  }

  function formatMoulding(e) {
    var m = e.moulding || '';
    var c = e.caput || '';
    if (m && c) return m + '/' + c;
    return m || c || '';
  }

  function buildMeta(data) {
    var p = data.patient || {};
    var L = data.labels || {};
    var wrap = el('div', 'mat-who-meta');
    var title = el('h3', 'mat-who-meta__title');
    title.innerHTML = '<i class="fa fa-line-chart" aria-hidden="true"></i> ' + (L.chartTitle || 'WHO Partograph');
    wrap.appendChild(title);

    var fields = [
      [L.patient || 'Patient', (p.first_name || '') + ' ' + (p.last_name || '')],
      [L.ancNo || 'ANC #', p.antenatal_number || '—'],
      [L.gpa || 'G/P/A', [p.gravida, p.para, p.abortion].filter(function (x) { return x != null; }).join('/') || '—'],
      [L.admission || 'Admitted', data.admissionFormatted || '—'],
      [L.ega || 'EGA', p.ega_at_admission != null ? p.ega_at_admission + ' wks' : (p.ega_at_booking != null ? p.ega_at_booking + ' wks' : '—')],
      [L.facility || 'Facility', data.facilityName || '—'],
      [L.bloodGroup || 'Blood group', p.blood_group ? p.blood_group + (p.rhesus_factor ? ' ' + p.rhesus_factor : '') : '—'],
      [L.risk || 'Risk', p.risk_level || '—'],
    ];

    fields.forEach(function (pair) {
      var dl = el('dl');
      dl.appendChild(el('dt', '', pair[0]));
      dl.appendChild(el('dd', '', pair[1]));
      wrap.appendChild(dl);
    });
    return wrap;
  }

  function buildLegend(labels) {
    var leg = el('div', 'mat-who-legend');
    leg.innerHTML =
      '<span class="is-alert"><i></i>' + (labels.alertLine || 'Alert line') + '</span>' +
      '<span class="is-action"><i></i>' + (labels.actionLine || 'Action line') + '</span>' +
      '<span class="is-data"><i></i>' + (labels.recorded || 'Recorded') + '</span>' +
      '<span><i class="fa fa-info-circle"></i> ' + (labels.whoNote || '30-min intervals · active phase monitoring') + '</span>';
    return leg;
  }

  function buildTimeRow(admission) {
    var row = el('div', 'mat-who-row mat-who-row--time');
    row.appendChild(el('div', 'mat-who-label', '<i class="fa fa-clock-o"></i> ' + 'Time'));
    for (var i = 0; i < SLOT_COUNT; i++) {
      var cell = el('div', 'mat-who-cell' + (i % 2 === 1 ? ' is-hour' : ''));
      cell.textContent = formatSlotTime(admission, i);
      row.appendChild(cell);
    }
    row.appendChild(el('div', 'mat-who-scale', 'h'));
    return row;
  }

  function buildTextRow(icon, label, slots, getter) {
    var row = el('div', 'mat-who-row');
    row.appendChild(el('div', 'mat-who-label', '<i class="fa ' + icon + '"></i> ' + label));
    for (var i = 0; i < SLOT_COUNT; i++) {
      var cell = el('div', 'mat-who-cell' + (i % 2 === 1 ? ' is-hour' : ''));
      var val = slots[i] ? getter(slots[i]) : '';
      if (val) cell.textContent = val;
      row.appendChild(cell);
    }
    row.appendChild(el('div', 'mat-who-scale', ''));
    return row;
  }

  function buildPlotRow(rowClass, icon, label, scaleLabel, plotId) {
    var row = el('div', 'mat-who-row mat-who-row--plot ' + rowClass);
    row.appendChild(el('div', 'mat-who-label', '<i class="fa ' + icon + '"></i> ' + label));
    for (var i = 0; i < SLOT_COUNT; i++) {
      row.appendChild(el('div', 'mat-who-cell' + (i % 2 === 1 ? ' is-hour' : '')));
    }
    row.appendChild(el('div', 'mat-who-scale', scaleLabel));
    var layer = el('div', 'mat-who-plot-layer');
    layer.id = plotId;
    row.appendChild(layer);
    return row;
  }

  function plotGraph(layer, options) {
    var w = layer.clientWidth || options.width || 800;
    var h = layer.clientHeight || options.height || 180;
    var padT = 8;
    var padB = 8;
    var plotH = h - padT - padB;
    var plotW = w;
    var x = function (slot) {
      return ((slot + 0.5) / SLOT_COUNT) * plotW;
    };
    var y = function (val) {
      var min = options.min;
      var max = options.max;
      var v = Math.max(min, Math.min(max, val));
      return padT + plotH - ((v - min) / (max - min)) * plotH;
    };

    var svg = svgEl('svg', { class: 'mat-who-svg', viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'none' });

    for (var g = 0; g <= 4; g++) {
      var gy = padT + (plotH / 4) * g;
      svg.appendChild(svgEl('line', {
        x1: 0, y1: gy, x2: plotW, y2: gy,
        class: 'mat-who-grid-line' + (g === 0 || g === 4 ? ' mat-who-grid-line--major' : ''),
      }));
    }
    for (var c = 0; c <= SLOT_COUNT; c += 2) {
      var gx = (c / SLOT_COUNT) * plotW;
      svg.appendChild(svgEl('line', {
        x1: gx, y1: padT, x2: gx, y2: padT + plotH,
        class: 'mat-who-grid-line mat-who-grid-line--major',
      }));
    }

    if (options.alertAction) {
      var alertPts = [];
      var actionPts = [];
      for (var hi = 0; hi <= WHO_HOURS; hi += 0.125) {
        var slotH = hi * 2;
        alertPts.push(x(slotH) + ',' + y(alertDilationAt(hi)));
        var act = actionDilationAt(hi);
        if (act >= 0) actionPts.push(x(slotH) + ',' + y(act));
      }
      svg.appendChild(svgEl('polyline', { points: alertPts.join(' '), class: 'mat-who-line mat-who-line--alert' }));
      svg.appendChild(svgEl('polyline', { points: actionPts.join(' '), class: 'mat-who-line mat-who-line--action' }));
    }

    var points = options.points || [];
    if (points.length > 1) {
      svg.appendChild(svgEl('polyline', {
        points: points.map(function (p) { return x(p.slot) + ',' + y(p.value); }).join(' '),
        class: 'mat-who-line mat-who-line--data',
      }));
    }
    points.forEach(function (p, idx) {
      var cls = 'mat-who-point ' + (options.pointClass || '') +
        (p.action ? ' is-action' : p.alert ? ' is-alert' : '');
      var circle = svgEl('circle', {
        cx: x(p.slot),
        cy: y(p.value),
        r: options.radius || 5,
        class: cls,
      });
      if (options.animate) circle.style.animationDelay = (0.4 + idx * 0.06) + 's';
      svg.appendChild(circle);
    });

    if (options.bars) {
      options.bars.forEach(function (b) {
        var barH = Math.min(plotH - 6, (b.value / options.barMax) * (plotH - 10));
        svg.appendChild(svgEl('rect', {
          x: x(b.slot) - 6,
          y: padT + plotH - barH,
          width: 12,
          height: barH,
          class: 'mat-who-ctx-bar',
        }));
      });
    }

    layer.innerHTML = '';
    layer.appendChild(svg);
  }

  function renderWhoPartograph(container, data, opts) {
    opts = opts || {};
    var labels = data.labels || {};
    var admission = parseDate(data.admissionDate) || new Date();
    var entries = normalizeEntries(data);
    var slots = mapEntriesToSlots(entries);
    var animate = opts.animate !== false && !opts.print;

    container.innerHTML = '';
    var root = el('div', 'mat-who-partograph' + (opts.print ? ' is-print' : ''));

    if (!opts.hideToolbar && !opts.print) {
      var toolbar = el('div', 'mat-who-toolbar');
      if (data.laborId) {
        toolbar.innerHTML =
          '<a class="hms-btn hms-btn-outline-primary hms-btn-sm" href="/maternity/labor/' + data.laborId + '/partograph/print" target="_blank" rel="noopener">' +
          '<i class="fa fa-print mr-1"></i>' + (labels.print || 'Print record') + '</a>' +
          '<button type="button" class="hms-btn hms-btn-primary hms-btn-sm" data-mat-who-fullscreen>' +
          '<i class="fa fa-expand mr-1"></i>' + (labels.fullscreen || 'Full screen') + '</button>';
      }
      root.appendChild(toolbar);
    }

    root.appendChild(buildMeta(data));
    root.appendChild(buildLegend(labels));

    var sheetWrap = el('div', 'mat-who-sheet-wrap');
    var sheet = el('div', 'mat-who-sheet');

    sheet.appendChild(buildTimeRow(admission));
    sheet.appendChild(buildPlotRow('mat-who-row--fhr', 'fa-heartbeat', labels.fhr || 'Fetal heart rate', 'bpm', 'matWhoPlotFhr'));
    sheet.appendChild(buildTextRow('fa-tint', labels.liquor || 'Amniotic fluid', slots, liquorShort));
    sheet.appendChild(buildTextRow('fa-compress', labels.moulding || 'Fetal moulding', slots, formatMoulding));
    sheet.appendChild(buildPlotRow('mat-who-row--dilation', 'fa-circle-o', labels.dilation || 'Cervical dilation (cm)', 'cm', 'matWhoPlotDil'));
    sheet.appendChild(buildTextRow('fa-arrow-down', labels.descent || 'Descent of head', slots, function (e) { return e.descent_station || ''; }));
    sheet.appendChild(buildPlotRow('mat-who-row--ctx', 'fa-bar-chart', labels.ctx || 'Contractions / 10 min', '/10', 'matWhoPlotCtx'));
    sheet.appendChild(buildTextRow('fa-medkit', labels.oxytocin || 'Oxytocin U/L · drops/min', slots, formatOxytocin));
    sheet.appendChild(buildTextRow('fa-flask', labels.drugs || 'Drugs & IV fluids', slots, function (e) { return e.drugs_given || ''; }));
    sheet.appendChild(buildTextRow('fa-heart', labels.pulse || 'Pulse', slots, function (e) { return e.pulse != null ? String(e.pulse) : ''; }));
    sheet.appendChild(buildTextRow('fa-stethoscope', labels.bp || 'Blood pressure', slots, formatBp));
    sheet.appendChild(buildTextRow('fa-thermometer-half', labels.temperature || 'Temperature °C', slots, function (e) { return e.temperature != null ? String(e.temperature) : ''; }));
    sheet.appendChild(buildTextRow('fa-filter', labels.urine || 'Urine (vol · protein · acetone)', slots, formatUrine));

    sheetWrap.appendChild(sheet);
    root.appendChild(sheetWrap);

    if (!entries.length) {
      root.appendChild(el('p', 'mat-who-empty', labels.empty || 'Add partograph entries to plot the graph.'));
    }

    container.appendChild(root);

    requestAnimationFrame(function () {
      var fhrLayer = document.getElementById('matWhoPlotFhr');
      var dilLayer = document.getElementById('matWhoPlotDil');
      var ctxLayer = document.getElementById('matWhoPlotCtx');
      if (!fhrLayer) return;

      var fhrPts = entries
        .filter(function (e) { return e.fhr != null && !Number.isNaN(Number(e.fhr)); })
        .map(function (e) {
          return { slot: slotIndexForHours(e.hours), value: Number(e.fhr) };
        });

      var dilPts = entries
        .filter(function (e) { return e.cervical_dilation != null && !Number.isNaN(Number(e.cervical_dilation)); })
        .map(function (e) {
          return {
            slot: slotIndexForHours(e.hours),
            value: Number(e.cervical_dilation),
            alert: !!e.alert_line_crossed,
            action: !!e.action_line_crossed,
          };
        });

      var ctxBars = entries
        .filter(function (e) { return e.contractions_in_10min != null && !Number.isNaN(Number(e.contractions_in_10min)); })
        .map(function (e) {
          return { slot: slotIndexForHours(e.hours), value: Number(e.contractions_in_10min) };
        });

      plotGraph(fhrLayer, { min: 80, max: 200, points: fhrPts, pointClass: 'mat-who-point--fhr', radius: 4, animate: animate });
      plotGraph(dilLayer, { min: 0, max: 10, alertAction: true, points: dilPts, pointClass: 'mat-who-point--dilation', animate: animate });
      plotGraph(ctxLayer, { min: 0, max: 5, bars: ctxBars, barMax: 5, animate: animate });
    });

    return root;
  }

  function openFullscreen(data) {
    var existing = document.getElementById('matWhoFullscreen');
    if (existing) existing.remove();

    var modal = el('div', 'mat-who-fullscreen');
    modal.id = 'matWhoFullscreen';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    var inner = el('div', 'mat-who-fullscreen__inner');
    var bar = el('div', 'mat-who-fullscreen__bar');
    bar.innerHTML =
      '<h2><i class="fa fa-line-chart mr-2"></i>' + ((data.labels && data.labels.chartTitle) || 'WHO Partograph') + '</h2>' +
      '<div>' +
      '<button type="button" class="hms-btn hms-btn-sm" style="background:#fff;color:#9d174d;margin-right:8px" data-mat-who-fs-print><i class="fa fa-print"></i></button>' +
      '<button type="button" class="hms-btn hms-btn-sm" style="background:#fff;color:#9d174d" data-mat-who-fs-close><i class="fa fa-times"></i></button>' +
      '</div>';
    inner.appendChild(bar);

    var body = el('div', 'mat-who-fullscreen__body');
    var mount = el('div', '');
    body.appendChild(mount);
    inner.appendChild(body);
    modal.appendChild(inner);
    document.body.appendChild(modal);

    renderWhoPartograph(mount, data, { hideToolbar: true, animate: true });

    bar.querySelector('[data-mat-who-fs-close]').addEventListener('click', function () {
      modal.remove();
    });
    bar.querySelector('[data-mat-who-fs-print]').addEventListener('click', function () {
      if (data.laborId) window.open('/maternity/labor/' + data.laborId + '/partograph/print', '_blank');
    });
    modal.addEventListener('click', function (ev) {
      if (ev.target === modal) modal.remove();
    });
    document.addEventListener('keydown', function onKey(ev) {
      if (ev.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', onKey);
      }
    });
  }

  function bindViewToggle() {
    var graph = document.getElementById('matPartographGraph');
    var timeline = document.getElementById('matPartographTimeline');
    var btns = document.querySelectorAll('[data-mat-partograph-view]');
    if (!graph || !timeline || !btns.length) return;

    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var view = btn.getAttribute('data-mat-partograph-view');
        btns.forEach(function (b) { b.classList.toggle('active', b === btn); });
        var showGraph = view === 'graph';
        graph.classList.toggle('d-none', !showGraph);
        timeline.classList.toggle('d-none', showGraph);
      });
    });
  }

  function bindAdvancedToggle() {
    var btn = document.querySelector('[data-mat-who-advanced-toggle]');
    var panel = document.getElementById('matWhoAdvancedFields');
    if (!btn || !panel) return;
    btn.addEventListener('click', function () {
      var open = panel.classList.toggle('d-none');
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  }

  function readPartographData() {
    var dataEl = document.getElementById('mat-partograph-data');
    if (!dataEl) return null;
    try {
      return JSON.parse(dataEl.textContent || '{}');
    } catch (err) {
      console.error('[maternity-partograph]', err);
      return null;
    }
  }

  function initLaborPage() {
    var data = readPartographData();
    var graph = document.getElementById('matPartographGraph');
    if (data && graph) renderWhoPartograph(graph, data, { animate: true });

    document.addEventListener('click', function (ev) {
      var fs = ev.target.closest('[data-mat-who-fullscreen]');
      if (fs && data) {
        ev.preventDefault();
        openFullscreen(data);
      }
    });

    bindViewToggle();
    bindAdvancedToggle();
  }

  function initPrintPage() {
    var data = readPartographData();
    var root = document.getElementById('matPartographPrintRoot');
    if (data && root) renderWhoPartograph(root, data, { print: true, hideToolbar: true, animate: false });
    var auto = document.getElementById('mat-who-auto-print');
    if (auto && auto.value === '1') window.addEventListener('load', function () { window.print(); });
  }

  window.MatPartograph = {
    render: renderWhoPartograph,
    openFullscreen: openFullscreen,
    initLaborPage: initLaborPage,
    initPrintPage: initPrintPage,
    alertDilationAt: alertDilationAt,
    actionDilationAt: actionDilationAt,
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (document.body.classList.contains('mat-who-print-page')) initPrintPage();
    else if (document.getElementById('matPartographGraph')) initLaborPage();
  });
})();
