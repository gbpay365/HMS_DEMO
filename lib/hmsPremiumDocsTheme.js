'use strict';

const brand = require('./hmsBrand');

const PREMIUM_CSS = `
:root {
  --navy: #0c2340;
  --navy-mid: #163a5f;
  --teal: #0c8b8b;
  --teal-light: #ccfbf1;
  --emerald: #059669;
  --emerald-light: #d1fae5;
  --gold: #c9a227;
  --gold-light: #fef9e7;
  --blue: #1a6bd8;
  --blue-light: #dbeafe;
  --ink: #1a2332;
  --body: #2d3748;
  --muted: #5a6578;
  --line: #d8dee9;
  --surface: #f4f7fb;
  --white: #ffffff;
  --accent: var(--teal);
  --accent-light: var(--teal-light);
}
:root[data-doc="product"] {
  --accent: var(--gold);
  --accent-light: var(--gold-light);
}
:root[data-doc="guide"] {
  --accent: var(--teal);
  --accent-light: var(--teal-light);
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; scroll-behavior: smooth; }
body {
  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  color: var(--body);
  line-height: 1.52;
  margin: 0;
  background: var(--white);
  font-size: 10pt;
}
.cover { page-break-after: always; break-after: page; }
.cover-top {
  background: linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 55%, #1e4d6b 100%);
  color: var(--white);
  padding: 16mm 18mm 14mm;
  position: relative;
  overflow: hidden;
}
.cover-top::after {
  content: "";
  position: absolute;
  right: -28mm;
  top: -18mm;
  width: 85mm;
  height: 85mm;
  border-radius: 50%;
  background: rgba(12, 139, 139, 0.18);
}
.cover-brand {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8mm;
  position: relative;
  z-index: 1;
}
.cover-brand .vendor {
  font-size: 8pt;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.72);
  margin: 0 0 2mm;
}
.cover-brand .vendor strong { color: var(--emerald-light); font-weight: 700; }
.cover-badge {
  font-size: 7.5pt;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(201, 162, 39, 0.22);
  border: 1px solid rgba(201, 162, 39, 0.55);
  color: #f5e6a8;
  padding: 2mm 4mm;
  border-radius: 3px;
  white-space: nowrap;
}
.cover-top h1 {
  font-family: Cambria, Georgia, "Times New Roman", serif;
  font-size: 22pt;
  font-weight: 700;
  line-height: 1.12;
  margin: 6mm 0 3mm;
  color: var(--white);
  position: relative;
  z-index: 1;
  max-width: 135mm;
}
.cover-top .subtitle {
  font-size: 10.5pt;
  font-weight: 400;
  color: rgba(255,255,255,0.84);
  margin: 0;
  max-width: 125mm;
  line-height: 1.42;
  position: relative;
  z-index: 1;
}
.cover-accent {
  height: 3px;
  background: linear-gradient(90deg, var(--teal), var(--gold), var(--teal));
}
.cover-body { padding: 11mm 18mm 14mm; }
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4mm 8mm;
  margin-bottom: 8mm;
}
.meta-grid .full { grid-column: 1 / -1; }
.meta-grid dt {
  font-size: 7.5pt;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  font-weight: 600;
  margin: 0 0 1mm;
}
.meta-grid dd {
  margin: 0;
  font-size: 9.5pt;
  color: var(--ink);
  font-weight: 600;
  line-height: 1.35;
}
.cover-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3mm 8mm;
  padding-top: 6mm;
  border-top: 1px solid var(--line);
  font-size: 8.5pt;
  color: var(--muted);
}
.doc-strip {
  background: var(--navy);
  color: rgba(255,255,255,0.88);
  font-size: 7.5pt;
  letter-spacing: 0.04em;
  padding: 2.5mm 18mm;
  display: flex;
  justify-content: space-between;
  gap: 4mm;
}
.doc-body { padding: 10mm 18mm 16mm; max-width: 210mm; margin: 0 auto; }
h2.section {
  font-family: Cambria, Georgia, serif;
  font-size: 14pt;
  color: var(--navy);
  margin: 0 0 4mm;
  padding-bottom: 2mm;
  border-bottom: 2px solid var(--accent);
  page-break-after: avoid;
}
h3 {
  font-size: 11pt;
  color: var(--ink);
  margin: 5mm 0 2mm;
  page-break-after: avoid;
}
h4 {
  font-size: 10pt;
  color: var(--navy-mid);
  margin: 4mm 0 2mm;
}
p { margin: 0 0 3mm; }
ul, ol { margin: 2mm 0 4mm 5mm; padding-left: 4mm; }
li { margin-bottom: 1.5mm; }
table.data {
  width: 100%;
  border-collapse: collapse;
  margin: 3mm 0 5mm;
  font-size: 9pt;
}
table.data th, table.data td {
  border: 1px solid var(--line);
  padding: 2.5mm 3mm;
  text-align: left;
  vertical-align: top;
}
table.data th {
  background: var(--surface);
  color: var(--ink);
  font-weight: 700;
}
table.data tr:nth-child(even) td { background: #fafbfc; }
.tip, .note, .warn {
  border-radius: 4px;
  padding: 3mm 4mm;
  margin: 3mm 0 4mm;
  font-size: 9pt;
}
.tip { background: var(--accent-light); border-left: 3px solid var(--accent); }
.note { background: var(--blue-light); border-left: 3px solid var(--blue); }
.warn { background: #fef2f2; border-left: 3px solid #dc2626; }
.flow {
  font-family: ui-monospace, "Consolas", monospace;
  font-size: 8.5pt;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 3mm 4mm;
  white-space: pre-wrap;
  margin: 3mm 0 4mm;
  line-height: 1.45;
}
.kpi-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3mm;
  margin: 4mm 0 5mm;
}
.kpi {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 3mm 4mm;
  text-align: center;
}
.kpi strong {
  display: block;
  font-size: 14pt;
  color: var(--navy);
  line-height: 1.1;
}
.kpi span { font-size: 8pt; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
.toc {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 4mm 5mm;
  margin: 4mm 0 6mm;
}
.toc ol { margin: 0; padding-left: 5mm; }
.toc a { color: var(--navy-mid); text-decoration: none; }
.toc a:hover { text-decoration: underline; }
.pill {
  display: inline-block;
  font-size: 7.5pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1mm 2.5mm;
  border-radius: 99px;
  background: var(--accent-light);
  color: var(--navy);
  margin-right: 1.5mm;
}
code, .code {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 8.5pt;
  background: #f1f5f9;
  padding: 0.5mm 1.5mm;
  border-radius: 2px;
}
.page-break { page-break-before: always; break-before: page; }
.footer-note {
  margin-top: 8mm;
  padding-top: 4mm;
  border-top: 1px solid var(--line);
  font-size: 8pt;
  color: var(--muted);
}
@media print {
  .doc-body { padding: 0; max-width: none; }
  .no-print { display: none !important; }
}
`;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generatedStamp() {
  return new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
}

function coverPage(opts) {
  const o = opts || {};
  const docLabel = esc(o.docLabel || 'Document');
  const title = esc(o.title || brand.productName);
  const subtitle = esc(o.subtitle || brand.tagline);
  const badge = esc(o.badge || 'Official Edition');
  const variant = esc(o.variant || 'product');
  const facility = esc(brand.facilityName || brand.orgName);
  const generated = esc(generatedStamp());

  return `
<section class="cover">
  <div class="cover-top">
    <div class="cover-brand">
      <div>
        <p class="vendor">Powered by <strong>${esc(brand.name)}</strong> · ${esc(brand.loginSubtitle)}</p>
      </div>
      <div class="cover-badge">${badge}</div>
    </div>
    <h1>${title}</h1>
    <p class="subtitle">${subtitle}</p>
  </div>
  <div class="cover-accent"></div>
  <div class="cover-body">
    <dl class="meta-grid">
      <div><dt>Product</dt><dd>${esc(brand.productName)}</dd></div>
      <div><dt>Organisation</dt><dd>${facility}</dd></div>
      <div class="full"><dt>Document type</dt><dd>${docLabel}</dd></div>
      <div class="full"><dt>Website</dt><dd>${esc(brand.websiteUrl)}</dd></div>
    </dl>
    <div class="cover-meta">
      <span>Version <strong>2.0</strong></span>
      <span>Generated <strong>${generated}</strong></span>
      <span>Platform <strong>Node.js HMS Edition</strong></span>
      <span>Languages <strong>English · Français</strong></span>
    </div>
  </div>
</section>
<div class="doc-strip">
  <span>${esc(brand.name)} · ${docLabel}</span>
  <span>${facility}</span>
</div>`;
}

function wrapPremiumDoc(opts) {
  const o = opts || {};
  const title = esc(o.title || brand.productName);
  const variant = esc(o.variant || 'product');
  const body = o.bodyHtml || '';
  return `<!DOCTYPE html>
<html lang="en" data-doc="${variant}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>${PREMIUM_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function section(id, title, inner) {
  const sid = id ? ` id="${esc(id)}"` : '';
  return `<div class="page-break"></div><h2 class="section"${sid}>${esc(title)}</h2>${inner}`;
}

module.exports = {
  PREMIUM_CSS,
  esc,
  generatedStamp,
  coverPage,
  wrapPremiumDoc,
  section,
  brand,
};
