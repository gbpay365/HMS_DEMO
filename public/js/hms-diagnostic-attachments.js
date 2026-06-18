/**
 * File attachments for lab / radiology template workbench (results PDFs, scan images).
 */
(function (global) {
  var pendingFiles = [];

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isImageMime(mime) {
    return mime && String(mime).indexOf('image/') === 0;
  }

  function renderAttachmentList(attachments, includePending) {
    var html = '';
    (attachments || []).forEach(function (a) {
      var path = a.file_path || a.filePath || '';
      var name = a.original_name || a.originalName || 'Attachment';
      var mime = a.mime || '';
      html +=
        '<div class="diagtpl-attach-item diagtpl-attach-saved">' +
        (isImageMime(mime)
          ? '<a href="' +
            escapeHtml(path) +
            '" target="_blank" rel="noopener"><img src="' +
            escapeHtml(path) +
            '" alt=""></a>'
          : '<a href="' +
            escapeHtml(path) +
            '" target="_blank" rel="noopener" class="diagtpl-attach-file"><i class="fa fa-file-pdf-o mr-1"></i>' +
            escapeHtml(name) +
            '</a>') +
        '<span class="badge badge-success badge-pill ml-2">Saved</span></div>';
    });
    if (includePending) {
      pendingFiles.forEach(function (f, idx) {
        html +=
          '<div class="diagtpl-attach-item diagtpl-attach-pending">' +
          '<span class="diagtpl-attach-file"><i class="fa fa-paperclip mr-1"></i>' +
          escapeHtml(f.name) +
          '</span>' +
          '<button type="button" class="btn btn-link btn-sm text-danger p-0 ml-2" data-remove-idx="' +
          idx +
          '" title="Remove">×</button>' +
          '<span class="badge badge-warning badge-pill ml-2">Pending</span></div>';
      });
    }
    return html || '<div class="text-muted small">No files attached yet.</div>';
  }

  function refreshList() {
    var list = document.getElementById('diagTplAttachList');
    if (!list) return;
    var saved = list._savedAttachments || [];
    list.innerHTML = renderAttachmentList(saved, true);
  }

  function initDiagnosticAttachments(opts) {
    opts = opts || {};
    var input = document.getElementById(opts.inputId || 'diagTplAttachInput');
    var list = document.getElementById(opts.listId || 'diagTplAttachList');
    var hint = document.getElementById(opts.hintId || 'diagTplAttachHint');
    if (!input || !list) return;

    if (opts.accept) input.setAttribute('accept', opts.accept);
    if (hint && opts.hintText) hint.textContent = opts.hintText;

    list._savedAttachments = list._savedAttachments || [];

    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      files.forEach(function (f) {
        if (pendingFiles.length >= 8) return;
        pendingFiles.push(f);
      });
      input.value = '';
      refreshList();
    });

    list.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-remove-idx]');
      if (!btn) return;
      var idx = parseInt(btn.getAttribute('data-remove-idx'), 10);
      if (!isNaN(idx)) {
        pendingFiles.splice(idx, 1);
        refreshList();
      }
    });
  }

  function renderExisting(attachments) {
    var list = document.getElementById('diagTplAttachList');
    if (!list) return;
    list._savedAttachments = attachments || [];
    refreshList();
  }

  function appendExisting(attachments) {
    var list = document.getElementById('diagTplAttachList');
    if (!list) return;
    list._savedAttachments = (list._savedAttachments || []).concat(attachments || []);
    refreshList();
  }

  function hasPending() {
    return pendingFiles.length > 0;
  }

  function clearPending() {
    pendingFiles = [];
    refreshList();
  }

  function uploadPending(apiBase, meta) {
    if (!pendingFiles.length) return Promise.resolve(null);
    meta = meta || {};
    var fd = new FormData();
    pendingFiles.forEach(function (f) {
      fd.append('result_files', f);
    });
    if (meta.serviceCode) fd.append('serviceCode', meta.serviceCode);
    if (meta.opdOrderItemId) fd.append('opdOrderItemId', String(meta.opdOrderItemId));
    if (meta.labResultId) fd.append('labResultId', String(meta.labResultId));
    if (meta.radiologyResultId) fd.append('radiologyResultId', String(meta.radiologyResultId));
    if (meta.testName) fd.append('testName', meta.testName);
    if (meta.alertId) fd.append('alertId', String(meta.alertId));
    if (meta.fromAlert) fd.append('fromAlert', '1');

    return fetch(apiBase + '/report/attach', {
      method: 'POST',
      credentials: 'same-origin',
      body: fd
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.success) throw new Error(j.message || 'Upload failed');
        var uploaded = (j.data && j.data.attachments) || [];
        appendExisting(
          uploaded.map(function (u) {
            return {
              file_path: u.filePath,
              original_name: u.originalName,
              mime: u.mime
            };
          })
        );
        pendingFiles = [];
        refreshList();
        return j.data;
      });
  }

  global.HmsDiagAttachments = {
    init: initDiagnosticAttachments,
    renderExisting: renderExisting,
    appendExisting: appendExisting,
    uploadPending: uploadPending,
    hasPending: hasPending,
    clearPending: clearPending
  };
})(window);
