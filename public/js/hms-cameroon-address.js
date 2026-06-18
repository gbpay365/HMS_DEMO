/**
 * hms-cameroon-address.js — Cascading Cameroon address dropdowns
 * Driven by window.HMS_CAMEROON_GEO injected by the server.
 * Works for any form containing [data-hms-cameroon-address="1"]
 */
(function () {
  'use strict';

  function initBlock(block) {
    if (block.getAttribute('data-hms-initialized') === '1') return;
    block.setAttribute('data-hms-initialized', '1');

    var selRegion    = block.querySelector('[name="cm_region"]');
    var selDiv       = block.querySelector('[name="cm_division"]');
    var selCommune   = block.querySelector('[name="cm_commune"]');
    var selVillage   = block.querySelector('[name="cm_village"]');
    var inpCommOther = block.querySelector('[name="cm_commune_other"]');
    var wrapCommOther= block.querySelector('#cm_commune_other_wrap');
    var inpVillOther = block.querySelector('[name="cm_village_other"]');
    var wrapVillOther= block.querySelector('#cm_village_other_wrap');
    var inpDetail    = block.querySelector('[name="address_detail"]');
    var inpComposed  = block.querySelector('[name="address"]');
    var inpPreview   = block.querySelector('#hms_cm_address_preview');

    if (!selRegion) return;

    function getGeo() {
      return window.HMS_CAMEROON_GEO || {};
    }

    function opt(val, label) {
      var o = document.createElement('option');
      o.value = val; o.textContent = label; return o;
    }
    function clearAndPlaceholder(sel, ph) {
      if (!sel) return;
      sel.innerHTML = '';
      sel.appendChild(opt('', ph));
    }
    function compose() {
      var r = selRegion ? selRegion.value : '';
      var d = selDiv    ? selDiv.value    : '';
      var c = selCommune ? selCommune.value : '';
      if (c === '__OTHER__') c = inpCommOther ? inpCommOther.value.trim() : '';
      var v = selVillage ? selVillage.value : '';
      if (v === '__OTHER__' || (v && v.indexOf('Autre') === 0)) {
        var v2 = inpVillOther ? inpVillOther.value.trim() : '';
        if (v2) v = v2;
      }
      var det = inpDetail ? inpDetail.value.trim() : '';
      var parts = [r, d, c, v, det].filter(function (x) { return x && x !== '' && x !== '— Choisir —'; });
      var composed = parts.join(' | ');
      if (inpComposed) inpComposed.value = composed;
      if (inpPreview)  inpPreview.value  = composed;
    }

    function populateDivisions() {
      var geo = getGeo();
      var reg = selRegion ? selRegion.value : '';
      clearAndPlaceholder(selDiv, '— Choose department —');
      clearAndPlaceholder(selCommune, '— Choose region & dept first —');
      clearAndPlaceholder(selVillage, '— Choose a council —');
      if (wrapCommOther) wrapCommOther.style.display = 'none';
      if (wrapVillOther) wrapVillOther.style.display = 'none';
      
      var depts = geo.departments || {};
      if (!reg || !depts[reg]) { compose(); return; }
      depts[reg].forEach(function (d) { selDiv.appendChild(opt(d, d)); });
      compose();
    }

    function populateCommunes() {
      var geo = getGeo();
      var reg = selRegion ? selRegion.value : '';
      var div = selDiv    ? selDiv.value    : '';
      clearAndPlaceholder(selCommune, '— Choose council —');
      clearAndPlaceholder(selVillage, '— Choose a council —');
      if (wrapCommOther) wrapCommOther.style.display = 'none';
      if (wrapVillOther) wrapVillOther.style.display = 'none';
      
      var comms = geo.communes || {};
      if (!reg || !div || !comms[reg] || !comms[reg][div]) { compose(); return; }
      var list = comms[reg][div];
      list.forEach(function (c) {
        if (c.indexOf('Autre commune') === 0 || c === 'Other council…' || c.indexOf('Other council') === 0) {
          selCommune.appendChild(opt('__OTHER__', c));
        } else {
          selCommune.appendChild(opt(c, c));
        }
      });
      compose();
    }

    function populateVillages() {
      var geo = getGeo();
      var commune = selCommune ? selCommune.value : '';
      clearAndPlaceholder(selVillage, '— Choose —');
      if (wrapVillOther) wrapVillOther.style.display = 'none';
      if (wrapCommOther) wrapCommOther.style.display = (commune === '__OTHER__') ? 'block' : 'none';
      
      if (!commune || commune === '__OTHER__') { compose(); return; }
      
      var reg  = selRegion ? selRegion.value : '';
      var div  = selDiv    ? selDiv.value    : '';
      var key  = reg + '|' + div + '|' + commune;
      var vHints = geo.villageHints || {};
      var vDefaults = geo.villageDefaults || [];
      var list = vHints[key] || vDefaults;
      
      list.forEach(function (v) {
        if (v === '— Choisir —') return;
        if (v.indexOf('Autre') === 0) {
          selVillage.appendChild(opt('__OTHER__', v));
        } else {
          selVillage.appendChild(opt(v, v));
        }
      });
      selVillage.appendChild(opt('__OTHER__', 'Other (specify)…'));
      compose();
    }

    function onVillageChange() {
      var v = selVillage ? selVillage.value : '';
      if (wrapVillOther) wrapVillOther.style.display = (v === '__OTHER__') ? 'block' : 'none';
      compose();
    }

    selRegion.addEventListener('change', populateDivisions);
    if (selDiv)       selDiv.addEventListener('change',    populateCommunes);
    if (selCommune)   selCommune.addEventListener('change', populateVillages);
    if (selVillage)   selVillage.addEventListener('change', onVillageChange);
    if (inpCommOther) inpCommOther.addEventListener('input', compose);
    if (inpVillOther) inpVillOther.addEventListener('input', compose);
    if (inpDetail)    inpDetail.addEventListener('input', compose);

    // Listen for data arrival
    document.addEventListener('hms:geo-ready', function() {
      if (selRegion && selRegion.value) populateDivisions();
      else compose();
    });

    compose();
  }

  function init() {
    document.querySelectorAll('[data-hms-cameroon-address="1"]').forEach(initBlock);
    
    var handler = function (e) {
      var target = e.target || e.currentTarget;
      if (target && target.querySelectorAll) {
        target.querySelectorAll('[data-hms-cameroon-address="1"]').forEach(initBlock);
      }
    };
    
    document.addEventListener('shown.bs.modal', handler);
    if (window.jQuery) {
      window.jQuery(document).on('shown.bs.modal', handler);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
