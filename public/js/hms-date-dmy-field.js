/**
 * DD/MM/YYYY text input paired with a hidden YYYY-MM-DD field for form POST.
 * Adds a calendar picker button (native date input) on every date field.
 *
 * Markup: hidden [data-hms-dmy-hidden] + text [data-hms-dmy-display] in the same parent.
 */
(function () {
  function formatDmyInput(raw) {
    var digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return digits.slice(0, 2) + '/' + digits.slice(2);
    return digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
  }

  function parseDmyToIso(dmy) {
    var m = String(dmy || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    var day = parseInt(m[1], 10);
    var month = parseInt(m[2], 10);
    var year = parseInt(m[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    var d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return (
      year +
      '-' +
      String(month).padStart(2, '0') +
      '-' +
      String(day).padStart(2, '0')
    );
  }

  function isoToDmy(iso) {
    var s = String(iso || '').trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return m[3] + '/' + m[2] + '/' + m[1];
  }

  function openNativePicker(native) {
    if (!native) return;
    if (typeof native.showPicker === 'function') {
      try {
        native.showPicker();
        return;
      } catch (e) {
        /* fall through */
      }
    }
    native.focus();
    native.click();
  }

  function syncHidden(display, hidden) {
    var iso = parseDmyToIso(display.value);
    if (iso) hidden.value = iso;
  }

  function syncFromIso(iso, display, hidden, native) {
    hidden.value = iso || '';
    display.value = iso ? isoToDmy(iso) : '';
    native.value = iso || '';
  }

  function wrapDmyPair(display, hidden) {
    if (display.closest('.hms-dmy-date-wrap')) return;

    var parent = display.parentElement;
    if (!parent) return;

    var wrap = document.createElement('div');
    wrap.className = 'hms-dmy-date-wrap';
    parent.insertBefore(wrap, display);
    wrap.appendChild(hidden);
    wrap.appendChild(display);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hms-dmy-picker-btn';
    btn.setAttribute('aria-label', 'Pick date');
    btn.innerHTML = '<i class="fa fa-calendar" aria-hidden="true"></i>';

    var native = document.createElement('input');
    native.type = 'date';
    native.className = 'hms-dmy-native-picker';
    native.tabIndex = -1;
    native.setAttribute('aria-hidden', 'true');

    wrap.appendChild(btn);
    wrap.appendChild(native);

    if (hidden.value) syncFromIso(hidden.value, display, hidden, native);

    display.addEventListener('input', function () {
      display.value = formatDmyInput(display.value);
      var iso = parseDmyToIso(display.value);
      if (iso) {
        hidden.value = iso;
        native.value = iso;
      }
    });

    native.addEventListener('change', function () {
      if (native.value) syncFromIso(native.value, display, hidden, native);
    });

    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      if (!native.value && hidden.value) native.value = hidden.value;
      openNativePicker(native);
    });

    display.addEventListener('dblclick', function () {
      if (!native.value && hidden.value) native.value = hidden.value;
      openNativePicker(native);
    });

    var form = display.closest('form');
    if (form) {
      form.addEventListener('submit', function () {
        syncHidden(display, hidden);
      });
    }
  }

  function enhanceNativeDateInput(el) {
    if (el.getAttribute('data-hms-date-enhanced') === '1') return;
    if (el.closest('.hms-dmy-date-wrap')) return;

    var parent = el.parentElement;
    if (!parent) return;

    el.setAttribute('data-hms-date-enhanced', '1');

    if (parent.classList.contains('hms-native-date-wrap')) return;

    var wrap = document.createElement('div');
    wrap.className = 'hms-native-date-wrap';
    parent.insertBefore(wrap, el);
    wrap.appendChild(el);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hms-date-picker-btn';
    btn.setAttribute('aria-label', 'Pick date');
    btn.innerHTML = '<i class="fa fa-calendar" aria-hidden="true"></i>';
    wrap.appendChild(btn);

    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      openNativePicker(el);
    });
  }

  function init() {
    document.querySelectorAll('[data-hms-dmy-display]').forEach(function (display) {
      var parent = display.parentElement;
      if (!parent) return;
      var hidden = parent.querySelector('[data-hms-dmy-hidden]');
      if (!hidden) return;
      wrapDmyPair(display, hidden);
    });

    document.querySelectorAll('input[type="date"], input[type="datetime-local"]').forEach(enhanceNativeDateInput);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.HmsDateFields = { init: init, openNativePicker: openNativePicker };
})();
