(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function showSuccessFromQuery() {
    var booked = /[?&]booked=([^&]+)/.exec(window.location.search);
    if (!booked || !window.jQuery || !jQuery.fn.modal) return;
    var ref = decodeURIComponent(booked[1]);
    var el = $('obk-success-ref');
    if (el) el.textContent = ref;
    jQuery('#obkSuccessModal').modal('show');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showSuccessFromQuery);
  } else {
    showSuccessFromQuery();
  }
})();
