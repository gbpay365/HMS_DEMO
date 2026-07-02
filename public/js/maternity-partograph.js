(function () {
  'use strict';

  function parseDate(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function hoursSinceAdmission(entry, admission) {
    const at = parseDate(entry.recorded_at);
    if (at && admission) return (at - admission) / 3600000;
    const label = String(entry.time_label || '').trim();
    if (/^\d{3,4}$/.test(label) && admission) {
      const hh = parseInt(label.length === 3 ? label.slice(0, 1) : label.slice(0, 2), 10);
      const mm = parseInt(label.length === 3 ? label.slice(1) : label.slice(2), 10);
      const t = new Date(admission);
      t.setHours(hh, mm, 0, 0);
      if (t < admission) t.setDate(t.getDate() + 1);
      return (t - admission) / 3600000;
    }
    return null;
  }

  /** WHO simplified alert line: 1 cm/h to 4 cm, then 1 cm/h. */
  function alertDilationAt(h) {
    if (h < 0) return 0;
    if (h <= 4) return h;
    return Math.min(10, 4 + (h - 4));
  }

  /** Action line is 4 hours behind the alert line. */
  function actionDilationAt(h) {
    return alertDilationAt(h - 4);
  }

  function svgEl(name, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }

  function renderPartographGraph(container, data) {
    const admission = parseDate(data.admissionDate) || new Date();
    const entries = (data.entries || [])
      .map((e) => {
        const h = hoursSinceAdmission(e, admission);
        return {
          hours: h,
          dilation: e.cervical_dilation != null ? Number(e.cervical_dilation) : null,
          fhr: e.fhr != null ? Number(e.fhr) : null,
          ctx: e.contractions_in_10min != null ? Number(e.contractions_in_10min) : null,
          alert: !!e.alert_line_crossed,
          action: !!e.action_line_crossed,
          timeLabel: e.time_label || '',
        };
      })
      .filter((e) => e.hours != null && !Number.isNaN(e.hours));

    const maxHours = Math.max(12, ...entries.map((e) => e.hours), 0) + 1;
    const width = 760;
    const padL = 48;
    const padR = 16;
    const padT = 28;
    const fhrH = 100;
    const dilH = 280;
    const ctxH = 56;
    const height = padT + fhrH + dilH + ctxH + 36;
    const plotW = width - padL - padR;

    const x = (h) => padL + (h / maxHours) * plotW;
    const yDil = (cm) => padT + fhrH + dilH - (cm / 10) * dilH;
    const yFhr = (bpm) => {
      const min = 80;
      const max = 200;
      const v = Math.max(min, Math.min(max, bpm));
      return padT + fhrH - ((v - min) / (max - min)) * fhrH;
    };
    const yCtxBase = padT + fhrH + dilH + ctxH - 8;

    container.innerHTML = '';
    const svg = svgEl('svg', {
      viewBox: `0 0 ${width} ${height}`,
      class: 'mat-partograph-svg',
      role: 'img',
      'aria-label': data.labels?.graphAria || 'WHO partograph',
    });

    // Grid + axes labels — dilation
    for (let cm = 0; cm <= 10; cm += 2) {
      const y = yDil(cm);
      svg.appendChild(
        svgEl('line', {
          x1: padL,
          y1: y,
          x2: width - padR,
          y2: y,
          class: 'mat-partograph-grid',
        })
      );
      const lbl = svgEl('text', { x: padL - 8, y: y + 4, class: 'mat-partograph-axis' });
      lbl.textContent = String(cm);
      svg.appendChild(lbl);
    }

    for (let h = 0; h <= maxHours; h += 2) {
      const xx = x(h);
      svg.appendChild(
        svgEl('line', {
          x1: xx,
          y1: padT + fhrH,
          x2: xx,
          y2: padT + fhrH + dilH,
          class: 'mat-partograph-grid',
        })
      );
      const lbl = svgEl('text', { x: xx, y: height - 8, class: 'mat-partograph-axis', 'text-anchor': 'middle' });
      lbl.textContent = h + 'h';
      svg.appendChild(lbl);
    }

    // Section titles
    const fhrTitle = svgEl('text', { x: padL, y: padT - 8, class: 'mat-partograph-section-title' });
    fhrTitle.textContent = data.labels?.fhr || 'FHR';
    svg.appendChild(fhrTitle);

    const dilTitle = svgEl('text', { x: padL, y: padT + fhrH + 14, class: 'mat-partograph-section-title' });
    dilTitle.textContent = data.labels?.dilation || 'Cervical dilation (cm)';
    svg.appendChild(dilTitle);

    const ctxTitle = svgEl('text', { x: padL, y: padT + fhrH + dilH + 14, class: 'mat-partograph-section-title' });
    ctxTitle.textContent = data.labels?.ctx || 'Contractions / 10 min';
    svg.appendChild(ctxTitle);

    // WHO alert & action lines
    const alertPts = [];
    const actionPts = [];
    for (let h = 0; h <= maxHours; h += 0.25) {
      alertPts.push(`${x(h)},${yDil(alertDilationAt(h))}`);
      const act = actionDilationAt(h);
      if (act >= 0) actionPts.push(`${x(h)},${yDil(act)}`);
    }
    svg.appendChild(
      svgEl('polyline', {
        points: alertPts.join(' '),
        class: 'mat-partograph-line mat-partograph-line--alert',
      })
    );
    svg.appendChild(
      svgEl('polyline', {
        points: actionPts.join(' '),
        class: 'mat-partograph-line mat-partograph-line--action',
      })
    );

    // Legend
    const legendY = padT + 6;
    [
      { cls: 'mat-partograph-line--alert', text: data.labels?.alertLine || 'Alert line' },
      { cls: 'mat-partograph-line--action', text: data.labels?.actionLine || 'Action line' },
      { cls: 'mat-partograph-line--data', text: data.labels?.recorded || 'Recorded' },
    ].forEach((item, i) => {
      const lx = padL + 120 + i * 150;
      svg.appendChild(svgEl('line', { x1: lx, y1: legendY, x2: lx + 28, y2: legendY, class: `mat-partograph-line ${item.cls}` }));
      const t = svgEl('text', { x: lx + 34, y: legendY + 4, class: 'mat-partograph-legend' });
      t.textContent = item.text;
      svg.appendChild(t);
    });

    // Patient FHR points
    entries.forEach((e) => {
      if (e.fhr == null || Number.isNaN(e.fhr)) return;
      svg.appendChild(svgEl('circle', { cx: x(e.hours), cy: yFhr(e.fhr), r: 4, class: 'mat-partograph-point mat-partograph-point--fhr' }));
    });

    // Patient dilation line + points
    const dilPts = entries
      .filter((e) => e.dilation != null && !Number.isNaN(e.dilation))
      .sort((a, b) => a.hours - b.hours);
    if (dilPts.length > 1) {
      svg.appendChild(
        svgEl('polyline', {
          points: dilPts.map((e) => `${x(e.hours)},${yDil(e.dilation)}`).join(' '),
          class: 'mat-partograph-line mat-partograph-line--data',
        })
      );
    }
    dilPts.forEach((e) => {
      const pt = svgEl('circle', {
        cx: x(e.hours),
        cy: yDil(e.dilation),
        r: 5,
        class: 'mat-partograph-point mat-partograph-point--dilation' + (e.action ? ' is-action' : e.alert ? ' is-alert' : ''),
      });
      svg.appendChild(pt);
    });

    // Contractions bars
    entries.forEach((e) => {
      if (e.ctx == null || Number.isNaN(e.ctx)) return;
      const barH = Math.min(ctxH - 16, (e.ctx / 10) * (ctxH - 16));
      const bx = x(e.hours) - 6;
      svg.appendChild(
        svgEl('rect', {
          x: bx,
          y: yCtxBase - barH,
          width: 12,
          height: barH,
          class: 'mat-partograph-ctx-bar',
        })
      );
    });

    container.appendChild(svg);

    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'mat-partograph-empty small text-muted';
      empty.textContent = data.labels?.empty || 'Add partograph entries to plot the graph.';
      container.appendChild(empty);
    }
  }

  function bindViewToggle() {
    const graph = document.getElementById('matPartographGraph');
    const timeline = document.getElementById('matPartographTimeline');
    const btns = document.querySelectorAll('[data-mat-partograph-view]');
    if (!graph || !timeline || !btns.length) return;

    btns.forEach((btn) => {
      btn.addEventListener('click', function () {
        const view = btn.getAttribute('data-mat-partograph-view');
        btns.forEach((b) => b.classList.toggle('active', b === btn));
        const showGraph = view === 'graph';
        graph.classList.toggle('d-none', !showGraph);
        timeline.classList.toggle('d-none', showGraph);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    const dataEl = document.getElementById('mat-partograph-data');
    const graph = document.getElementById('matPartographGraph');
    if (dataEl && graph) {
      try {
        const data = JSON.parse(dataEl.textContent || '{}');
        renderPartographGraph(graph, data);
      } catch (err) {
        console.error('[maternity-partograph]', err);
      }
    }
    bindViewToggle();
  });
})();
