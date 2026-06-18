(function () {
  'use strict';

  function readPageData() {
    var el = document.getElementById('wlt-page-data');
    if (!el) return { wallets: [], q: '', pendingCreate: [] };
    try {
      return JSON.parse(el.textContent || '{}');
    } catch (_) {
      return { wallets: [], q: '', pendingCreate: [] };
    }
  }

  function wltApi() {
    return window.WltPage || null;
  }

  function bindTableActions() {
    var tbody = document.getElementById('wltTableBody');
    if (!tbody) return;
    tbody.addEventListener('click', function (e) {
      var api = wltApi();
      if (!api) return;

      var qrBtn = e.target.closest('[data-wlt-qr]');
      if (qrBtn) {
        e.preventDefault();
        api.showQR(qrBtn.getAttribute('data-token') || '', qrBtn.getAttribute('data-name') || '');
        return;
      }
      var histBtn = e.target.closest('[data-wlt-history]');
      if (histBtn) {
        e.preventDefault();
        api.loadTxns(
          parseInt(histBtn.getAttribute('data-wallet-id'), 10) || 0,
          histBtn.getAttribute('data-name') || ''
        );
        return;
      }
      var topBtn = e.target.closest('[data-wlt-topup]');
      if (topBtn) {
        e.preventDefault();
        api.openTopup(
          parseInt(topBtn.getAttribute('data-wallet-id'), 10) || 0,
          topBtn.getAttribute('data-name') || '',
          parseFloat(topBtn.getAttribute('data-balance') || '0') || 0,
          topBtn.getAttribute('data-phone') || '',
          topBtn.getAttribute('data-pt-label') || ''
        );
      }
    });
  }

  function initCreateBanner() {
    var pageData = readPageData();
    var pending = pageData.pendingCreate || [];
    if (!pending.length) return;

    var skipKey = 'wltSkipCreate:' + (pageData.q || '');
    var dismissBanner = document.getElementById('wltDismissBanner');
    if (dismissBanner) {
      dismissBanner.addEventListener('click', function () {
        var banner = document.getElementById('wltCreateBanner');
        if (banner) banner.style.display = 'none';
        try {
          sessionStorage.setItem(skipKey, '1');
        } catch (_) {}
      });
    }
  }

  function init() {
    bindTableActions();
    initCreateBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
