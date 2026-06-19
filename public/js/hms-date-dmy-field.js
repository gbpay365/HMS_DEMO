/**
 * DD/MM/YYYY text input paired with a hidden YYYY-MM-DD field for form POST.
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

  function syncHidden(display, hidden) {
    var iso = parseDmyToIso(display.value);
    if (iso) hidden.value = iso;
  }

  function bindPair(display, hidden) {
    display.addEventListener('input', function () {
      display.value = formatDmyInput(display.value);
      syncHidden(display, hidden);
    });
    var form = display.closest('form');
    if (form) {
      form.addEventListener('submit', function () {
        syncHidden(display, hidden);
      });
    }
  }

  function init() {
    document.querySelectorAll('[data-hms-dmy-display]').forEach(function (display) {
      var parent = display.parentElement;
      if (!parent) return;
      var hidden = parent.querySelector('[data-hms-dmy-hidden]');
      if (!hidden) return;
      bindPair(display, hidden);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
