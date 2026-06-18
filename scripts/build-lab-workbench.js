'use strict';
const fs = require('fs');
const path = require('path');

const srcPath = path.join('C:', 'Users', 'Souleman', 'Downloads', 'files', 'lab-template-engine.html');
const outDir = path.join(__dirname, '..', 'assets');
const outPath = path.join(outDir, 'lab-workbench.html');

fs.mkdirSync(outDir, { recursive: true });
let s = fs.readFileSync(srcPath, 'utf8');

const startNeedle =
  '// ─────────────────────────────────────────────────────\n// EMBEDDED TEMPLATES (same data as Node.js module)';
const i1 = s.indexOf(startNeedle);
if (i1 === -1) throw new Error('start not found');

const stateNeedle = '// ─────────────────────────────────────────────────────\n// STATE';
const i2 = s.indexOf(stateNeedle, i1);
if (i2 === -1) throw new Error('STATE marker not found');

const inject = `// ─────────────────────────────────────────────────────
// Templates from /api/lab/bundle (lib/labTestTemplates.js)
// ─────────────────────────────────────────────────────
let LAB_TEST_TEMPLATES = {};
async function loadLabTemplates() {
  const r = await fetch('/api/lab/bundle', { credentials: 'same-origin' });
  if (!r.ok) throw new Error('Could not load lab templates (HTTP ' + r.status + ')');
  const j = await r.json();
  if (!j.success || !j.data) throw new Error(j.message || 'Invalid response');
  LAB_TEST_TEMPLATES = j.data;
}

const __qs = new URLSearchParams(location.search);
window.__LAB_ORDER = {
  serviceCode: (__qs.get('code') || '').trim(),
  opdOrderItemId: parseInt(__qs.get('oi') || '', 10) || 0
};

function ageFromDob(dob) {
  if (!dob) return '';
  try {
    const d = new Date(dob);
    if (isNaN(d.getTime())) return '';
    const t2 = new Date();
    let a = t2.getFullYear() - d.getFullYear();
    const mn = t2.getMonth() - d.getMonth();
    if (mn < 0 || (mn === 0 && t2.getDate() < d.getDate())) a--;
    return a + 'y';
  } catch (e) {
    return '';
  }
}

async function maybeLoadOrderContext() {
  const code = window.__LAB_ORDER.serviceCode;
  const oid = window.__LAB_ORDER.opdOrderItemId;
  if (!code || !oid) return;
  const r = await fetch(
    '/api/lab/order-context?code=' + encodeURIComponent(code) + '&oi=' + encodeURIComponent(String(oid)),
    { credentials: 'same-origin' }
  );
  const j = await r.json();
  if (!j.success) throw new Error(j.message || 'Could not load order context');
  const p = j.patient;
  document.getElementById('pid').value = p.id;
  document.getElementById('pname').value = [p.first_name, p.last_name].filter(Boolean).join(' ');
  const ag = ageFromDob(p.dob);
  document.getElementById('page').value = [ag, p.gender].filter(Boolean).join(' / ');
}

`;

s = s.slice(0, i1) + inject + s.slice(i2);

const oldInit = `// ─────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────
buildSidebar();
document.getElementById('totalCount').textContent = getAllCount() + ' tests';`;

const newInit = `// ─────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────
loadLabTemplates()
  .then(() => {
    return maybeLoadOrderContext().catch((e) => {
      console.warn('order context', e);
      if (window.__LAB_ORDER && window.__LAB_ORDER.serviceCode) {
        showToast('Order context: ' + (e.message || String(e)));
      }
    });
  })
  .then(() => {
    buildSidebar();
    document.getElementById('totalCount').textContent = getAllCount() + ' tests';
  })
  .catch((err) => {
    const list = document.getElementById('catList');
    if (list) {
      list.innerHTML =
        '<p style="padding:12px;color:#ef4444;font-size:13px;">' +
        (err && err.message ? err.message : String(err)) +
        '</p>';
    }
    document.getElementById('totalCount').textContent = '0 tests';
  });`;

if (!s.includes(oldInit)) throw new Error('init block not found');
s = s.replace(oldInit, newInit);

const oldSave = `  // In production: POST to /api/lab/report/generate
  console.log('REPORT SAVED:', report);
  showToast('✓ Report saved successfully');`;

const newSave = `  const persistBody = {
    patientInfo: report.patientInfo,
    testId: report.testId,
    values: report.values,
    conclusion: report.conclusion
  };
  if (window.__LAB_ORDER.serviceCode && window.__LAB_ORDER.opdOrderItemId) {
    persistBody.serviceCode = window.__LAB_ORDER.serviceCode;
    persistBody.opdOrderItemId = window.__LAB_ORDER.opdOrderItemId;
  }
  fetch('/api/lab/report/persist', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(persistBody)
  })
    .then((r) => r.json())
    .then((j) => {
      if (!j.success) throw new Error(j.message || 'Save failed');
      console.log('REPORT SAVED:', j.data && j.data.report);
      showToast('✓ Saved to lab registry #' + ((j.data && j.data.labResultId) || ''));
    })
    .catch((e) => {
      console.error(e);
      showToast('Save failed: ' + (e.message || String(e)));
    });`;

if (!s.includes(oldSave)) throw new Error('saveReport block not found');
s = s.replace(oldSave, newSave);

fs.writeFileSync(outPath, s);
console.log('Wrote', outPath, 'bytes', s.length);
