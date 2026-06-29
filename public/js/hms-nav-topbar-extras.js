(function () {
  'use strict';

  function formatClock(d, locale) {
    var loc = locale || 'en-US';
    var day = d.toLocaleDateString(loc, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    var time = d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit', hour12: true });
    return day + ' | ' + time;
  }

  function tick() {
    var el = document.getElementById('hmsNavDateTime');
    if (!el) return;
    var locale = (window.HMS && window.HMS.currencyLocale) || undefined;
    el.textContent = formatClock(new Date(), locale);
  }

  function setBadge(id, n) {
    var el = document.getElementById(id);
    if (!el) return;
    var c = Math.max(0, parseInt(n, 10) || 0);
    if (c > 0) {
      el.textContent = c > 99 ? '99+' : String(c);
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  function refreshBadges() {
    fetch('/api/nav/header-extras', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (!data) return;
        setBadge('hmsNavNotifyCount', data.notifications);
        setBadge('hmsNavMsgCount', data.messages);
      })
      .catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('hmsNavTopExtras')) return;
    tick();
    setInterval(tick, 30000);
    refreshBadges();
    setInterval(refreshBadges, 120000);
  });
})();
