(function () {
  'use strict';

  function addLineRow(tbody, template) {
    if (!tbody || !template) return;
    const tr = template.content.cloneNode(true);
    tbody.appendChild(tr);
  }

  document.addEventListener('DOMContentLoaded', function () {
    const groupSelect = document.getElementById('radTestGroupId');
    const linesBody = document.getElementById('radLinesBody');
    const lineTpl = document.getElementById('radLineRowTpl');
    const addBtn = document.getElementById('radAddLineBtn');

    if (addBtn && linesBody && lineTpl) {
      addBtn.addEventListener('click', function () {
        addLineRow(linesBody, lineTpl);
      });
    }

    if (groupSelect && linesBody) {
      groupSelect.addEventListener('change', async function () {
        const gid = groupSelect.value;
        if (!gid) return;
        try {
          const res = await fetch('/radiology/api/test-group/' + encodeURIComponent(gid));
          const data = await res.json();
          if (!data.ok || !data.lines) return;
          linesBody.innerHTML = '';
          data.lines.forEach(function (ln) {
            addLineRow(linesBody, lineTpl);
            const rows = linesBody.querySelectorAll('tr');
            const row = rows[rows.length - 1];
            if (!row) return;
            const nameIn = row.querySelector('[name="exam_name[]"]');
            const modIn = row.querySelector('[name="line_modality[]"]');
            const partIn = row.querySelector('[name="line_body_part[]"]');
            if (nameIn) nameIn.value = ln.exam_name || '';
            if (modIn) modIn.value = ln.modality || '';
            if (partIn) partIn.value = ln.body_part || '';
          });
        } catch (e) {
          console.warn('test group load', e);
        }
      });
    }

    document.querySelectorAll('[data-rad-remove-line]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tr = btn.closest('tr');
        if (tr) tr.remove();
      });
    });
  });
})();
