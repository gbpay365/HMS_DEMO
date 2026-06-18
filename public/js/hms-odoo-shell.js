/**
 * Odoo-style HMS shell — apps launcher, mobile menu, nav dropdown toggles, Bootstrap dropdowns.
 */
(function () {
  'use strict';

  var appsBtn = document.getElementById('hmsOdooAppsBtn');
  var appsOverlay = document.getElementById('hmsOdooAppsOverlay');
  var menuToggle = document.getElementById('hmsOdooMenuToggle');
  var navMenu = document.getElementById('hmsOdooNavMenu');

  function closeApps() {
    if (!appsOverlay) return;
    appsOverlay.classList.remove('is-open');
    appsOverlay.setAttribute('aria-hidden', 'true');
  }

  function openApps() {
    if (!appsOverlay) return;
    appsOverlay.classList.add('is-open');
    appsOverlay.setAttribute('aria-hidden', 'false');
  }

  if (appsBtn && appsOverlay) {
    appsBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (appsOverlay.classList.contains('is-open')) closeApps();
      else openApps();
    });
    appsOverlay.addEventListener('click', function (e) {
      if (e.target === appsOverlay) closeApps();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeApps();
    });
  }

  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      navMenu.classList.toggle('is-mobile-open');
    });
  }

  function navDropdownRoots() {
    return document.querySelectorAll(
      '.hms-dept-app .o_nav_dropdown, .hms-odoo-app .o_nav_dropdown, .hms-module-odoo-app .o_nav_dropdown, .pharmacy-odoo-app .o_nav_dropdown, .laboratory-odoo-app .o_nav_dropdown, .radiology-odoo-app .o_nav_dropdown'
    );
  }

  function closeAllNavDropdowns(except) {
    navDropdownRoots().forEach(function (d) {
      if (except && d === except) return;
      d.classList.remove('is-open');
      var btn = d.querySelector('.o_nav_drop_btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function bindNavDropdowns() {
    document
      .querySelectorAll(
        '.hms-dept-app .o_nav_dropdown .o_nav_drop_btn, .hms-odoo-app .o_nav_dropdown .o_nav_drop_btn, .hms-module-odoo-app .o_nav_dropdown .o_nav_drop_btn, .pharmacy-odoo-app .o_nav_dropdown .o_nav_drop_btn, .laboratory-odoo-app .o_nav_dropdown .o_nav_drop_btn, .radiology-odoo-app .o_nav_dropdown .o_nav_drop_btn'
      )
      .forEach(function (btn) {
        if (btn.dataset.hmsDropBound === '1') return;
        btn.dataset.hmsDropBound = '1';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var wrap = btn.closest('.o_nav_dropdown');
          if (!wrap) return;
          var open = wrap.classList.contains('is-open');
          closeAllNavDropdowns();
          if (!open) {
            wrap.classList.add('is-open');
            btn.setAttribute('aria-expanded', 'true');
          }
        });
      });
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('.o_nav_dropdown')) return;
    closeAllNavDropdowns();
    if (appsOverlay && appsOverlay.classList.contains('is-open') && !e.target.closest('#hmsOdooAppsBtn')) {
      closeApps();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeAllNavDropdowns();
      closeApps();
      if (navMenu) navMenu.classList.remove('is-mobile-open');
    }
  });

  function initBootstrapDropdowns() {
    if (!window.jQuery || !jQuery.fn.dropdown) return;
    jQuery(document.body).find('[data-toggle="dropdown"]').dropdown();
  }

  function initShell() {
    bindNavDropdowns();
    initBootstrapDropdowns();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShell);
  } else {
    initShell();
  }
})();
