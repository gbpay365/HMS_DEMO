/**
 * Shared LAB/RAD service-code validation modal (cashier ticket).
 * opts: { dept, modalId, inputId, btnId, errId, onValidated(code) }
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  window.HmsDiagnosticCodeValidate = {
    /**
     * @param {object} opts
     * @returns {Promise<string>} validated code
     */
    prompt: function prompt(opts) {
      opts = opts || {};
      var dept = opts.dept === 'radiology' ? 'radiology' : 'laboratory';
      var prefix = dept === 'radiology' ? 'RAD' : 'LAB';
      var api = dept === 'radiology' ? '/api/rad/validate-code' : '/api/lab/validate-code';
      var modalId = opts.modalId || (dept === 'radiology' ? 'radValidateCodeModal' : 'labValidateCodeModal');
      var inputId = opts.inputId || (dept === 'radiology' ? 'radValidateCodeInput' : 'labValidateCodeInput');
      var btnId = opts.btnId || (dept === 'radiology' ? 'btnRadValidateCode' : 'btnLabValidateCode');
      var errId = opts.errId || (dept === 'radiology' ? 'radValidateCodeError' : 'labValidateCodeError');
      var prefill = String(opts.prefillCode || '').trim().toUpperCase();

      return new Promise(function (resolve, reject) {
        var modal = document.getElementById(modalId);
        var inp = document.getElementById(inputId);
        var btn = document.getElementById(btnId);
        var errEl = document.getElementById(errId);
        if (!modal || !inp || !btn) {
          reject(new Error('Validate modal not found'));
          return;
        }

        function showErr(msg) {
          if (!errEl) return;
          errEl.innerHTML = '<i class="fa fa-exclamation-circle mr-1"></i> ' + esc(msg);
          errEl.classList.remove('d-none');
        }

        function clearErr() {
          if (errEl) {
            errEl.classList.add('d-none');
            errEl.textContent = '';
          }
        }

        function runValidate() {
          var code = inp.value.trim().toUpperCase();
          if (!code) {
            showErr('Enter the ' + prefix + ' service code from the patient ticket.');
            return;
          }
          btn.disabled = true;
          fetch(api + '?code=' + encodeURIComponent(code), {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          })
            .then(function (r) {
              return r.json().then(function (j) {
                return { ok: r.ok, j: j };
              });
            })
            .then(function (res) {
              if (res.j && res.j.success) {
                if (window.jQuery) window.jQuery(modal).modal('hide');
                resolve(code);
                return;
              }
              showErr((res.j && res.j.message) || 'Code could not be validated.');
            })
            .catch(function () {
              showErr('Could not validate code. Check your connection and try again.');
            })
            .finally(function () {
              btn.disabled = false;
            });
        }

        clearErr();
        inp.value = prefill;
        if (window.jQuery) {
          window.jQuery(modal).modal('show');
          window.jQuery(modal)
            .off('shown.bs.modal.hmsVal')
            .on('shown.bs.modal.hmsVal', function () {
              inp.focus();
            });
        }
        if (!btn.dataset.hmsValBound) {
          btn.dataset.hmsValBound = '1';
          btn.addEventListener('click', runValidate);
          inp.addEventListener('input', function () {
            inp.value = inp.value.toUpperCase();
          });
          inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
              e.preventDefault();
              runValidate();
            }
          });
        }
        btn.onclick = runValidate;
      });
    },

    bindNewTestButton: function bindNewTestButton(btn, dept) {
      if (!btn) return;
      dept = dept === 'radiology' ? 'radiology' : 'laboratory';
      var validatePath = dept === 'radiology' ? '/radiology/validate/' : '/laboratory/validate/';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        window.HmsDiagnosticCodeValidate.prompt({ dept: dept }).then(function (code) {
          window.location.href = validatePath + encodeURIComponent(code);
        });
      });
    },
  };
})();
