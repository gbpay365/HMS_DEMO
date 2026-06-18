#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'views', 'cashier.ejs');
let s = fs.readFileSync(p, 'utf8');

s = s.replace(' <!-- RADIOLOGY -->', ' <!-- SCANS & IMAGING -->');
s = s.replace(
  '<label class="font-weight-bold small">Radiology Service</label>',
  '<label class="font-weight-bold small">Imaging Service</label>'
);
s = s.replace(
  '<option value="">&mdash; Select radiology service &mdash;</option>',
  '<option value="">&mdash; Select imaging service &mdash;</option>'
);
s = s.replace(
  '<small class="text-danger">No radiology services in catalog.</small>',
  '<small class="text-danger">No imaging services in catalog. Import tariffs on the Service Catalog page.</small>'
);

// Prepay radiology pane only (before surgeries)
const prepayRad = s.indexOf('id="pane-rad"');
const prepayEnd = s.indexOf('<!-- SURGERIES -->');
if (prepayRad > 0 && prepayEnd > prepayRad) {
  let chunk = s.slice(prepayRad, prepayEnd);
  chunk = chunk.replace(/\(radCatalog\|\|\[\]\)/g, '(imagingCatalog||radCatalog||[])');
  chunk = chunk.replace(/\(radCatalog\|\|\[\]\)\.forEach/g, '(imagingCatalog||radCatalog||[]).forEach');
  s = s.slice(0, prepayRad) + chunk + s.slice(prepayEnd);
}

const scanStart = s.indexOf(' <!-- SCAN (CT / MRI');
const surgStart = s.indexOf('<!-- SURGERIES -->');
if (scanStart > 0 && surgStart > scanStart) {
  s = s.slice(0, scanStart) + s.slice(surgStart);
}

// Alert banner after pane-rad open if missing
if (!s.includes('Collect prepayment for <strong>scans &amp; imaging</strong>')) {
  s = s.replace(
    '<div class="tab-pane fade" id="pane-rad" role="tabpanel">\n <div class="form-row">',
    '<motion class="tab-pane fade" id="pane-rad" role="tabpanel">\n <div class="alert alert-info border-0 py-2 mb-3 small">\n <i class="fa fa-info-circle mr-1"></i>\n Collect prepayment for <strong>scans &amp; imaging</strong> from Service Catalog &rarr; Scans &amp; Imaging.\n </div>\n <div class="form-row">'
      .replace(/motion/g, 'div')
  );
}

fs.writeFileSync(p, s);
console.log('patched cashier.ejs');
