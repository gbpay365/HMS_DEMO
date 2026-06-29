(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var rail = document.querySelector('.pha-rail');
    if (!rail) return;

    var active = rail.querySelector('.pha-rail-link.active');
    if (active) {
      try {
        active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (_) {
        active.scrollIntoView(false);
      }
    }
  });
})();
