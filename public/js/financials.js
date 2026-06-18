(function () {
  'use strict';

  function fmtXaf(n) {
    return (Number(n) || 0).toLocaleString('fr-FR');
  }

  function parseAmt(raw) {
    var n = parseInt(String(raw || '').replace(/\D+/g, ''), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function initAccountPickers(root) {
    var scope = root || document;
    scope.querySelectorAll('.fin-acct-picker').forEach(function (wrap) {
      if (wrap.dataset.finInit) return;
      wrap.dataset.finInit = '1';
      var input = wrap.querySelector('.fin-acct-search');
      var hidden = wrap.querySelector('input[type="hidden"]');
      var drop = wrap.querySelector('.fin-acct-dropdown');
      if (!input || !hidden || !drop) return;

      var timer = null;
      function closeDrop() {
        drop.classList.remove('open');
      }
      function render(list) {
        drop.innerHTML = '';
        if (!list || !list.length) {
          var empty = document.createElement('div');
          empty.className = 'fin-acct-option text-muted';
          empty.textContent = 'No accounts';
          drop.appendChild(empty);
          drop.classList.add('open');
          return;
        }
        list.forEach(function (a) {
          var el = document.createElement('div');
          el.className = 'fin-acct-option';
          el.innerHTML = '<code>' + (a.code || '') + '</code> ' + (a.label_en || '');
          el.addEventListener('mousedown', function (e) {
            e.preventDefault();
            hidden.value = a.id;
            input.value = (a.code || '') + ' — ' + (a.label_en || '');
            closeDrop();
            input.dispatchEvent(new Event('change', { bubbles: true }));
          });
          drop.appendChild(el);
        });
        drop.classList.add('open');
      }
      function search(q) {
        fetch('/api/financials/accounts?q=' + encodeURIComponent(q || '') + '&limit=30', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (j) {
            if (j && j.ok) render(j.accounts || []);
          })
          .catch(closeDrop);
      }
      input.addEventListener('focus', function () {
        search(input.value.trim());
      });
      input.addEventListener('input', function () {
        hidden.value = '0';
        clearTimeout(timer);
        timer = setTimeout(function () {
          search(input.value.trim());
        }, 200);
      });
      input.addEventListener('blur', function () {
        setTimeout(closeDrop, 180);
      });
    });
  }

  function initJournalEntryForm() {
    var form = document.getElementById('finJournalForm');
    var tbody = document.getElementById('finJeLinesBody');
    if (!form || !tbody) return;

    var drEl = document.getElementById('finJeTotalDr');
    var crEl = document.getElementById('finJeTotalCr');
    var diffEl = document.getElementById('finJeDiff');
    var msgEl = document.getElementById('finJeBalanceMsg');
    var validEl = document.getElementById('finJeValidLines');
    var footer = document.getElementById('finJeFooter');
    var submitBtn = document.getElementById('finJeSubmit');
    var balanceBtn = document.getElementById('finJeBalanceLine');
    var lineTpl = document.getElementById('finJeLineTpl');
    if (!lineTpl) return;

    var MIN_LINES = 2;

    function lineAccountId(tr) {
      var hid = tr.querySelector('input[type="hidden"][name^="acc_"]');
      return parseInt(String((hid && hid.value) || '0'), 10) || 0;
    }

    function lineAmounts(tr) {
      var drInp = tr.querySelector('.fin-je-dr');
      var crInp = tr.querySelector('.fin-je-cr');
      var dr = parseAmt(drInp && drInp.value);
      var cr = parseAmt(crInp && crInp.value);
      return { dr: dr, cr: cr, drInp: drInp, crInp: crInp };
    }

    /** One line = one side only (debit XOR credit), account required when amount > 0 */
    function validateLine(tr) {
      var aid = lineAccountId(tr);
      var am = lineAmounts(tr);
      if (am.dr > 0 && am.cr > 0) {
        return { ok: false, code: 'both', msg: 'Use debit or credit, not both on the same line.' };
      }
      if (am.dr > 0 || am.cr > 0) {
        if (aid < 1) return { ok: false, code: 'noacct', msg: 'Select an account for lines with an amount.' };
        return { ok: true, dr: am.dr, cr: am.cr };
      }
      if (aid > 0) return { ok: false, code: 'noamt', msg: 'Enter a debit or credit amount.' };
      return { ok: false, code: 'empty', msg: '' };
    }

    function applyExclusiveAmounts(tr, side) {
      var am = lineAmounts(tr);
      if (!am.drInp || !am.crInp) return;
      if (side === 'dr' && am.dr > 0) {
        am.crInp.value = '';
        am.crInp.disabled = true;
        am.drInp.disabled = false;
      } else if (side === 'cr' && am.cr > 0) {
        am.drInp.value = '';
        am.drInp.disabled = true;
        am.crInp.disabled = false;
      } else if (am.dr < 1 && am.cr < 1) {
        am.drInp.disabled = false;
        am.crInp.disabled = false;
      }
    }

    function renumber() {
      tbody.querySelectorAll('tr.fin-je-line').forEach(function (tr, idx) {
        tr.setAttribute('data-line-idx', String(idx));
        tr.querySelectorAll('[name]').forEach(function (inp) {
          var n = inp.getAttribute('name');
          if (n) inp.setAttribute('name', n.replace(/_\d+/, '_' + idx));
        });
      });
    }

    function totalsAndLines() {
      var td = 0;
      var tc = 0;
      var valid = [];
      var problems = [];
      tbody.querySelectorAll('tr.fin-je-line').forEach(function (tr) {
        var v = validateLine(tr);
        var am = lineAmounts(tr);
        tr.classList.remove('fin-je-line--invalid', 'fin-je-line--ok');
        tr.removeAttribute('title');
        if (v.ok) {
          td += v.dr;
          tc += v.cr;
          valid.push(tr);
          tr.classList.add('fin-je-line--ok');
        } else if (v.code !== 'empty') {
          tr.classList.add('fin-je-line--invalid');
          tr.setAttribute('title', v.msg);
          if (problems.indexOf(v.msg) < 0) problems.push(v.msg);
        }
        applyExclusiveAmounts(tr, am.dr > 0 ? 'dr' : am.cr > 0 ? 'cr' : '');
      });
      return { td: td, tc: tc, valid: valid, problems: problems };
    }

    function recalc() {
      var t = totalsAndLines();
      var diff = t.td - t.tc;
      if (drEl) drEl.textContent = fmtXaf(t.td);
      if (crEl) crEl.textContent = fmtXaf(t.tc);
      if (diffEl) {
        diffEl.textContent = fmtXaf(Math.abs(diff));
        diffEl.className =
          diff === 0 && t.td > 0 ? 'text-success font-weight-bold' : 'text-danger font-weight-bold';
      }
      if (validEl) validEl.textContent = String(t.valid.length);

      var canPost = diff === 0 && t.td > 0 && t.valid.length >= MIN_LINES && t.problems.length === 0;
      if (footer) footer.classList.toggle('unbalanced', !canPost);
      if (submitBtn) submitBtn.disabled = !canPost;

      if (balanceBtn) balanceBtn.disabled = diff === 0 || t.td < 1;

      if (msgEl) {
        msgEl.classList.remove('text-success', 'text-danger', 'text-warning');
        if (canPost) {
          msgEl.textContent = 'Balanced — ready to post (' + fmtXaf(t.td) + ' XAF).';
          msgEl.classList.add('text-success');
        } else if (t.problems.length) {
          msgEl.textContent = t.problems[0];
          msgEl.classList.add('text-danger');
        } else if (t.valid.length < MIN_LINES && t.td > 0) {
          msgEl.textContent =
            'Double entry needs at least ' + MIN_LINES + ' lines with amounts (add an offsetting line).';
          msgEl.classList.add('text-warning');
        } else if (diff > 0) {
          msgEl.textContent = 'Out of balance — add ' + fmtXaf(diff) + ' XAF to credits (or reduce debits).';
          msgEl.classList.add('text-danger');
        } else if (diff < 0) {
          msgEl.textContent = 'Out of balance — add ' + fmtXaf(-diff) + ' XAF to debits (or reduce credits).';
          msgEl.classList.add('text-danger');
        } else {
          msgEl.textContent = 'Enter at least two lines: one debit and one credit, same total.';
          msgEl.classList.add('text-danger');
        }
      }
    }

    function wireLine(tr) {
      initAccountPickers(tr);
      var drInp = tr.querySelector('.fin-je-dr');
      var crInp = tr.querySelector('.fin-je-cr');
      if (drInp) {
        drInp.addEventListener('input', function () {
          var dr = parseAmt(drInp.value);
          if (dr > 0 && crInp) {
            crInp.value = '';
            crInp.disabled = true;
          } else if (crInp) crInp.disabled = false;
          recalc();
        });
      }
      if (crInp) {
        crInp.addEventListener('input', function () {
          var cr = parseAmt(crInp.value);
          if (cr > 0 && drInp) {
            drInp.value = '';
            drInp.disabled = true;
          } else if (drInp) drInp.disabled = false;
          recalc();
        });
      }
      tr.querySelectorAll('.fin-acct-search').forEach(function (inp) {
        inp.addEventListener('change', recalc);
      });
      tr.querySelectorAll('.fin-je-memo').forEach(function (inp) {
        inp.addEventListener('input', recalc);
      });
      var rm = tr.querySelector('.fin-je-rm');
      if (rm) {
        rm.addEventListener('click', function () {
          if (tbody.querySelectorAll('tr.fin-je-line').length > MIN_LINES) {
            tr.remove();
            renumber();
            recalc();
          }
        });
      }
    }

    function addLine(prefill) {
      var clone = lineTpl.content.cloneNode(true);
      var tr = clone.querySelector('tr');
      var idx = tbody.querySelectorAll('tr.fin-je-line').length;
      tr.querySelectorAll('[name]').forEach(function (inp) {
        var n = inp.getAttribute('name');
        if (n) inp.setAttribute('name', n.replace(/_0/, '_' + idx));
      });
      tbody.appendChild(tr);
      wireLine(tr);
      if (prefill && prefill.side && prefill.amount > 0) {
        var drInp = tr.querySelector('.fin-je-dr');
        var crInp = tr.querySelector('.fin-je-cr');
        if (prefill.side === 'dr' && drInp) {
          drInp.value = String(prefill.amount);
          if (crInp) crInp.disabled = true;
        } else if (prefill.side === 'cr' && crInp) {
          crInp.value = String(prefill.amount);
          if (drInp) drInp.disabled = true;
        }
      }
      recalc();
      var search = tr.querySelector('.fin-acct-search');
      if (search) search.focus();
      return tr;
    }

    function addBalancingLine() {
      var t = totalsAndLines();
      var diff = t.td - t.tc;
      if (diff === 0 || t.td < 1) return;
      if (diff > 0) addLine({ side: 'cr', amount: diff });
      else addLine({ side: 'dr', amount: -diff });
    }

    var addBtn = document.getElementById('finJeAddLine');
    if (addBtn) addBtn.addEventListener('click', function () { addLine(null); });
    if (balanceBtn) balanceBtn.addEventListener('click', addBalancingLine);

    tbody.querySelectorAll('tr.fin-je-line').forEach(wireLine);
    recalc();

    form.addEventListener('submit', function (e) {
      var t = totalsAndLines();
      var diff = t.td - t.tc;
      var err = '';
      if (t.problems.length) err = t.problems[0];
      else if (t.valid.length < MIN_LINES) {
        err = 'Double entry requires at least two lines with an account and amount.';
      } else if (diff !== 0 || t.td < 1) {
        err = 'Total debits must equal total credits before posting.';
      }
      if (err) {
        e.preventDefault();
        recalc();
        if (window.HMS && HMS.alert) HMS.alert('Cannot post', err, 'warning');
        else alert(err);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initAccountPickers(document);
    initJournalEntryForm();
    document.querySelectorAll('.fin-journal-row').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var href = tr.getAttribute('data-href');
        if (href) window.location.href = href;
      });
    });
  });
})();
