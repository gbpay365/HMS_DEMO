/* global HMS */
(function () {
  'use strict';

  const API = '/access-control/api';

  function post(action, data) {
    const body = new URLSearchParams();
    body.set('action', action);
    Object.keys(data || {}).forEach((k) => {
      if (data[k] != null) body.set(k, data[k]);
    });
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    }).then((r) => r.json());
  }

  function toastOk(msg) {
    if (window.HMS && HMS.toast) HMS.toast.fire({ icon: 'success', title: msg });
    else alert(msg);
  }
  function toastErr(msg) {
    if (window.HMS && HMS.toast) HMS.toast.fire({ icon: 'error', title: msg || 'Request failed' });
    else alert(msg || 'Request failed');
  }

  window.HaaAccess = {
    post,
    toastOk,
    toastErr,
    togglePerm(role, permId, grant, el) {
      const act = grant ? 'grant' : 'revoke';
      el.disabled = true;
      return post(act, { role_val: role, permission_id: permId })
        .then((j) => {
          if (!j.ok) throw new Error(j.error || 'Failed');
          toastOk(grant ? 'Permission granted' : 'Permission revoked');
        })
        .catch((e) => {
          toastErr(e.message);
          if (el.type === 'checkbox') el.checked = !grant;
        })
        .finally(() => {
          el.disabled = false;
        });
    },
    bulkModule(role, moduleCode, grant) {
      return post('bulk_module_perms', {
        role_val: role,
        module_code: moduleCode,
        grant: grant ? '1' : '0',
      }).then((j) => {
        if (!j.ok) throw new Error(j.error || 'Failed');
        toastOk((grant ? 'Granted' : 'Revoked') + ' module (' + (j.affected || 0) + ' permissions)');
        window.location.reload();
      }).catch((e) => toastErr(e.message));
    },
    copyRolePerms(role, fromRole) {
      return post('copy_role_perms_from', { role_val: role, copy_from_role: fromRole })
        .then((j) => {
          if (!j.ok) throw new Error(j.error || 'Failed');
          toastOk('Copied ' + (j.copied || 0) + ' permissions');
          window.location.reload();
        })
        .catch((e) => toastErr(e.message));
    },
    togglePortal(role, code, assign, isHome, el) {
      const act = isHome ? 'portal_set_home' : assign ? 'portal_assign' : 'portal_unassign';
      const data = { role_val: role, portal_code: code };
      const prevChecked = el && el.type === 'checkbox' ? !assign : null;
      if (el) el.disabled = true;
      return post(act, data)
        .then((j) => {
          if (!j.ok) throw new Error(j.error || 'Failed');
          window.location.reload();
        })
        .catch((e) => {
          toastErr(e.message);
          if (el && el.type === 'checkbox' && prevChecked != null) el.checked = prevChecked;
          if (el && el.type === 'radio') window.location.reload();
        })
        .finally(() => {
          if (el) el.disabled = false;
        });
    },
    uiToggle(role, code, hide) {
      const act = hide ? 'ui_hide' : 'ui_show';
      return post(act, { role_val: role, element_code: code })
        .then((j) => {
          if (!j.ok) throw new Error(j.error || 'Failed');
        })
        .catch((e) => toastErr(e.message));
    },
  };

  let draggingPortal = null;

  function initWorkflow() {
    document.querySelectorAll('.haa-wf-pill').forEach((pill) => {
      pill.addEventListener('dragstart', (e) => {
        draggingPortal = { code: pill.dataset.code, label: pill.dataset.label };
        e.dataTransfer.effectAllowed = 'copy';
      });
      pill.addEventListener('dragend', () => {
        draggingPortal = null;
      });
    });

    document.querySelectorAll('.wf-step[data-workflow]').forEach((step) => {
      step.addEventListener('dragover', (e) => {
        e.preventDefault();
        step.classList.add('drop-over');
      });
      step.addEventListener('dragleave', () => step.classList.remove('drop-over'));
      step.addEventListener('drop', (e) => {
        e.preventDefault();
        step.classList.remove('drop-over');
        if (!draggingPortal) return;
        const wf = step.dataset.workflow;
        const key = step.dataset.key;
        post('assign_portal', { workflow: wf, step_key: key, portal_code: draggingPortal.code })
          .then((j) => {
            if (!j.ok) throw new Error(j.error || 'Failed');
            window.location.reload();
          })
          .catch((e) => toastErr(e.message));
      });
    });
  }

  function initRoleSearch() {
    const inp = document.getElementById('haaRoleSearch');
    if (!inp) return;
    inp.addEventListener('input', () => {
      const q = inp.value.toLowerCase();
      document.querySelectorAll('.haa-role-item').forEach((a) => {
        const t = (a.textContent || '').toLowerCase();
        a.style.display = t.indexOf(q) >= 0 ? '' : 'none';
      });
    });
  }

  function initNavGrants() {
    const role = document.body.dataset.haaRole;
    if (!role) return;

    function navPost(navCode, grant, bundle) {
      const act = bundle ? 'nav_grant_bundle' : 'nav_toggle';
      return post(act, { role_val: role, nav_code: navCode, grant: grant ? '1' : '0' });
    }

    document.querySelectorAll('.haa-nav-toggle').forEach((inp) => {
      inp.addEventListener('change', () => {
        const code = inp.dataset.code;
        const bundle = inp.dataset.bundle === '1';
        inp.disabled = true;
        navPost(code, inp.checked, bundle)
          .then((j) => {
            if (!j.ok) throw new Error(j.error || 'Failed');
            window.location.reload();
          })
          .catch((e) => {
            toastErr(e.message);
            inp.checked = !inp.checked;
          })
          .finally(() => {
            inp.disabled = false;
          });
      });
    });

    document.querySelectorAll('.haa-nav-bundle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.code;
        btn.disabled = true;
        navPost(code, btn.dataset.grant === '1', true)
          .then((j) => {
            if (!j.ok) throw new Error(j.error || 'Failed');
            window.location.reload();
          })
          .catch((e) => toastErr(e.message))
          .finally(() => {
            btn.disabled = false;
          });
      });
    });

    const grantAll = document.getElementById('haaNavGrantAll');
    const revokeAll = document.getElementById('haaNavRevokeAll');
    if (grantAll) {
      grantAll.addEventListener('click', () => {
        const codes = [];
        document.querySelectorAll('.haa-nav-toggle[data-bundle="1"]').forEach((i) => codes.push(i.dataset.code));
        let chain = Promise.resolve();
        codes.forEach((c) => {
          chain = chain.then(() => navPost(c, true, true));
        });
        chain
          .then(() => window.location.reload())
          .catch((e) => toastErr(e.message));
      });
    }
    if (revokeAll) {
      revokeAll.addEventListener('click', () => {
        if (!confirm('Remove all navigation bundles for this role? Menus revert to capability-based until reconfigured.')) {
          return;
        }
        post('nav_revoke_all', { role_val: role })
          .then((j) => {
            if (!j.ok) throw new Error(j.error || 'Failed');
            window.location.reload();
          })
          .catch((e) => toastErr(e.message));
      });
    }
  }

  function initPermRw() {
    const role = document.body.dataset.haaRole;
    if (!role) return;

    document.querySelectorAll('.haa-rw-toggle').forEach((inp) => {
      inp.addEventListener('change', () => {
        const mod = inp.dataset.module;
        const rw = inp.dataset.rw;
        inp.disabled = true;
        post('perm_set_module_rw', {
          role_val: role,
          module_code: mod,
          rw,
          grant: inp.checked ? '1' : '0',
        })
          .then((j) => {
            if (!j.ok) throw new Error(j.error || 'Failed');
            window.location.reload();
          })
          .catch((e) => {
            toastErr(e.message);
            inp.checked = !inp.checked;
          })
          .finally(() => {
            inp.disabled = false;
          });
      });
    });

    document.querySelectorAll('.haa-rw-other-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mod = btn.dataset.module;
        const row = document.querySelector('.haa-rw-other-row[data-module-other="' + mod + '"]');
        if (row) row.classList.toggle('d-none');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('hms-admin-access-body');
    initWorkflow();
    initRoleSearch();
    initNavGrants();
    initPermRw();
  });

  window.haaWfTab = function (tab, btn) {
    ['opd', 'ipd', 'emg'].forEach((t) => {
      const el = document.getElementById('haa-tab-' + t);
      if (el) el.style.display = t === tab ? '' : 'none';
    });
    document.querySelectorAll('.haa-wf-tab').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  };

  window.haaRemovePortal = function (wf, key, code) {
    post('unassign_portal', { workflow: wf, step_key: key, portal_code: code })
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Failed');
        window.location.reload();
      })
      .catch((e) => toastErr(e.message));
  };

  window.haaAddStep = function (wf) {
    const label = prompt('Step name');
    if (!label) return;
    post('add_step', { workflow: wf, step_label: label })
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Failed');
        window.location.reload();
      })
      .catch((e) => toastErr(e.message));
  };

  window.haaRenameStep = function (wf, key, btn) {
    const span = btn.closest('.wf-step').querySelector('.step-label-text');
    const label = prompt('Rename step', span ? span.textContent : '');
    if (!label) return;
    post('rename_step', { workflow: wf, step_key: key, step_label: label })
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Failed');
        if (span) span.textContent = label;
        toastOk('Step renamed');
      })
      .catch((e) => toastErr(e.message));
  };

  window.haaDeleteStep = function (wf, key) {
    if (!confirm('Delete this custom step?')) return;
    post('delete_step', { workflow: wf, step_key: key })
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Failed');
        window.location.reload();
      })
      .catch((e) => toastErr(e.message));
  };
})();
