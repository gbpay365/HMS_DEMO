(function () {
  var docSel = document.getElementById('apptDoctorId');
  var dateIn = document.getElementById('apptDate');
  var grid = document.getElementById('apptSlotGrid');
  var slotH = document.getElementById('apptSlot');
  var hint = document.getElementById('apptSlotHint');
  var timeFb = document.getElementById('apptTimeFallback');
  var docName = document.getElementById('apptDoctorName');
  if (!docSel || !dateIn || !grid) return;

  function syncDocName() {
    var o = docSel.options[docSel.selectedIndex];
    if (docName && o) docName.value = o.getAttribute('data-name') || o.textContent.replace(/^Dr\.\s*/, '');
  }

  function loadSlots() {
    syncDocName();
    var did = docSel.value;
    var dt = dateIn.value;
    grid.innerHTML = '<span class="text-muted small">Loading…</span>';
    if (slotH) slotH.value = '';
    fetch('/hms/api/booking/slots?doctor_id=' + encodeURIComponent(did) + '&date=' + encodeURIComponent(dt), {
      credentials: 'same-origin',
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        grid.innerHTML = '';
        if (!data.ok || !(data.slots && data.slots.length)) {
          grid.innerHTML =
            '<span class="text-muted small">' + (data.message || 'No slots') + '</span>';
          if (hint) hint.textContent = 'Use manual time below if needed.';
          return;
        }
        if (hint) hint.textContent = 'Click a slot or enter time manually.';
        data.slots.forEach(function (s) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn-sm btn-outline-primary';
          b.textContent = s.label;
          b.dataset.value = s.value;
          b.addEventListener('click', function () {
            if (slotH) slotH.value = s.value;
            if (timeFb) timeFb.value = s.value;
            grid.querySelectorAll('button').forEach(function (x) {
              x.classList.remove('active');
            });
            b.classList.add('active');
          });
          grid.appendChild(b);
        });
      })
      .catch(function () {
        grid.innerHTML = '<span class="text-danger small">Could not load slots</span>';
      });
  }

  docSel.addEventListener('change', loadSlots);
  dateIn.addEventListener('change', loadSlots);
  syncDocName();
  loadSlots();
})();
