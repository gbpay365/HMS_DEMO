/**
 * Client-side control points for consultation, prescription, and lab/rad new-test gates.
 *
 * ACL controls who can open a screen; these gates are UI hints only — the server
 * enforces the same business rules independently on every POST/API route.
 */
(function () {
  var MSG_CONSULT = 'Please validate the payment code first.';
  var MSG_NEW_TEST =
    'Please validate the payment code. No request has been received from IPD or Emergency.';
  var MSG_RX =
    'A consultation is required before prescribing for this OPD patient. Start a consultation from the OPD queue, or use Follow Up if the patient is returning under a valid prior payment code.';
  var MSG_ER_RX =
    'Prescription requires a consultation record — create one first.';

  function alertMsg(m) {
    window.alert(m);
  }

  /** UI hint only — server enforces the same rule independently. */
  function bindOpdNewConsultation() {
    document.querySelectorAll('[data-hms-opd-consult]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        if (el.getAttribute('data-hms-emergency') === '1') return;
        if (el.getAttribute('data-hms-payment-ok') === '1') return;
        ev.preventDefault();
        alertMsg(MSG_CONSULT);
      });
    });
  }

  /** UI hint only — server enforces diagnostic authorization on /laboratory/add and lab APIs. */
  function checkDiagnosticGate(patientId, dept, onOk) {
    if (!patientId) {
      alertMsg('Select a patient first.');
      return;
    }
    fetch(
      '/api/clinical/diagnostic-new-test-gate?patient_id=' +
        encodeURIComponent(patientId) +
        '&dept=' +
        encodeURIComponent(dept),
      { credentials: 'same-origin', headers: { Accept: 'application/json' } }
    )
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (j && j.ok) {
          if (typeof onOk === 'function') onOk(j);
        } else {
          alertMsg((j && j.error) || MSG_NEW_TEST);
        }
      })
      .catch(function () {
        alertMsg(MSG_NEW_TEST);
      });
  }

  function bindNewTestButton(btn, opts) {
    if (!btn) return;
    var dept = (opts && opts.dept) || 'laboratory';
    var patientSel =
      (opts && opts.patientSelect) ||
      document.querySelector((opts && opts.patientSelectSelector) || '#labPatientId, [name="patient_id"]');
    var modalTarget = opts && opts.modalTarget;

    btn.removeAttribute('data-toggle');
    btn.removeAttribute('data-target');
    btn.addEventListener('click', function (ev) {
      var pid = patientSel ? String(patientSel.value || '').trim() : '';
      if (!pid) {
        ev.preventDefault();
        ev.stopPropagation();
        alertMsg('Select a patient first.');
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      checkDiagnosticGate(pid, dept, function () {
        if (modalTarget && window.jQuery) window.jQuery(modalTarget).modal('show');
      });
    });
  }

  function bindNewTestOpenLink(link, dept) {
    if (!link) return;
    link.addEventListener('click', function (ev) {
      var pid = link.getAttribute('data-patient-id') || '';
      if (!pid) return;
      ev.preventDefault();
      checkDiagnosticGate(pid, dept || 'laboratory', function () {
        window.location.href = link.getAttribute('href') || link.href;
      });
    });
  }

  /** UI hint only — server enforces on prescription POST routes. */
  function bindDiagnosticFormSubmit(form, dept) {
    if (!form) return;
    form.addEventListener('submit', function (ev) {
      var sel = form.querySelector('[name="patient_id"], #labPatientId');
      var pid = sel ? String(sel.value || '').trim() : '';
      if (!pid) return;
      ev.preventDefault();
      checkDiagnosticGate(pid, dept, function () {
        form.submit();
      });
    });
  }

  /** UI hint only — server enforces assertOpdPrescriptionAllowed on save. */
  function bindPrescriptionModal(btn, patientSel) {
    if (!btn) return;
    btn.addEventListener('click', function (ev) {
      var pid = patientSel ? String(patientSel.value || '').trim() : '';
      if (!pid) return;
      ev.preventDefault();
      ev.stopPropagation();
      fetch('/api/clinical/opd-prescription-gate?patient_id=' + encodeURIComponent(pid), {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          if (j && j.ok) {
            if (window.jQuery && btn.getAttribute('data-target')) {
              window.jQuery(btn.getAttribute('data-target')).modal('show');
            }
          } else {
            var msg =
              j && j.code === 'er_no_consultation'
                ? MSG_ER_RX
                : (j && j.error) || MSG_RX;
            alertMsg(msg);
          }
        })
        .catch(function () {
          alertMsg(MSG_RX);
        });
    });
  }

  window.HmsClinicalGates = {
    MSG_CONSULT: MSG_CONSULT,
    MSG_NEW_TEST: MSG_NEW_TEST,
    MSG_RX: MSG_RX,
    MSG_ER_RX: MSG_ER_RX,
    bindOpdNewConsultation: bindOpdNewConsultation,
    bindNewTestButton: bindNewTestButton,
    bindNewTestOpenLink: bindNewTestOpenLink,
    bindPrescriptionModal: bindPrescriptionModal,
    checkDiagnosticGate: checkDiagnosticGate,
  };

  document.addEventListener('DOMContentLoaded', function () {
    bindOpdNewConsultation();
    document.querySelectorAll('[data-hms-new-test-btn]').forEach(function (btn) {
      bindNewTestButton(btn, {
        dept: btn.getAttribute('data-hms-dept') || 'laboratory',
        modalTarget: btn.getAttribute('data-hms-modal') || null,
        patientSelectSelector: btn.getAttribute('data-hms-patient-select') || null,
      });
    });
    bindDiagnosticFormSubmit(document.getElementById('labAddForm'), 'laboratory');
    bindDiagnosticFormSubmit(document.getElementById('radNewRequestForm'), 'radiology');
    var rxBtn = document.querySelector('[data-hms-new-rx-btn]');
    var rxPat = document.querySelector('#rxPatientId, [name="patient_id"]');
    if (rxBtn) bindPrescriptionModal(rxBtn, rxPat);
  });
})();
