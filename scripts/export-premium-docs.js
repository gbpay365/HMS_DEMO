'use strict';

const fs = require('fs');
const path = require('path');
const { buildProductDocumentHtml } = require('../lib/hmsProductDocument');
const { buildComprehensiveUserGuideHtml } = require('../lib/hmsComprehensiveUserGuide');

const outDir = path.join(__dirname, '..', 'docs');

const files = [
  ['ZAIZENS-Product-Document.html', buildProductDocumentHtml()],
  ['ZAIZENS-Comprehensive-User-Guide.html', buildComprehensiveUserGuideHtml()],
];

for (const [name, html] of files) {
  const target = path.join(outDir, name);
  fs.writeFileSync(target, html, 'utf8');
  console.log('Wrote', target, '(' + Buffer.byteLength(html, 'utf8') + ' bytes)');
}
