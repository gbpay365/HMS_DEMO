(function () {
  'use strict';

  var cfg = window.HMS_SESSION_IDLE;
  if (!cfg || !cfg.active) return;

  var idleMs = parseInt(cfg.idleMs, 10) || 10 * 60 * 1000;
  var logoutUrl = String(cfg.logoutUrl || '/logout?reason=idle');
  var warnMs = Math.max(60000, idleMs - 60 * 1000);
  var timer = null;
  var warnTimer = null;
  var warnTitle = cfg.warnTitle || 'Session expiring';
  var warnMessage = cfg.warnMessage || 'You will be signed out in 1 minute due to inactivity.';

  function clearTimers() {
    if (timer) clearTimeout(timer);
    if (warnTimer) clearTimeout(warnTimer);
    timer = null;
    warnTimer = null;
  }

  function scheduleLogout() {
    clearTimers();
    warnTimer = setTimeout(function () {
      if (window.HMS && typeof HMS.alert === 'function') {
        HMS.alert(warnTitle, warnMessage, 'warning');
      }
    }, warnMs);
    timer = setTimeout(function () {
      window.location.href = logoutUrl;
    }, idleMs);
  }

  var events = ['mousedown', 'keydown', 'touchstart', 'click', 'scroll'];
  var throttle = 0;
  function onActivity() {
    var now = Date.now();
    if (now - throttle < 5000) return;
    throttle = now;
    scheduleLogout();
  }

  events.forEach(function (ev) {
    document.addEventListener(ev, onActivity, { passive: true });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') onActivity();
  });

  scheduleLogout();
})();
