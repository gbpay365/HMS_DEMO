'use strict';
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'views', 'access-control.ejs');
let content = fs.readFileSync(filePath, 'utf8');

const replacements = [
  [/â€¦/g, '...'],
  // UTF-8 em dash misread as Windows-1252 (â + € + right quote)
  [/\u00e2\u20ac\u201d/g, '\u2014'],
  [/\u20ac\u201d/g, '\u2014'],
  [/\u00e2\u20ac\u201c/g, '\u2014'],
  [/\u20ac\u201c/g, '\u2014'],
  [/â€"/g, '\u2014'],
  [/â€"/g, '\u2013'],
  [/â€“/g, '\u2013'],
  [/â€™/g, "'"],
  [/â€˜/g, "'"],
  [/â€œ/g, '"'],
  [/â€\u009d/g, '"'],
  [/â‹¯/g, '\u22EE'],
  [/â‹™/g, '\u22EE'],
  [/Â·/g, '\u00B7'],
];

let total = 0;
for (const [pattern, replacement] of replacements) {
  const matches = content.match(pattern);
  if (matches) {
    total += matches.length;
    content = content.replace(pattern, replacement);
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed', total, 'mojibake sequences in access-control.ejs');

const remaining = content.match(/â€|â‹|â€™|Ã‚|Â·/g);
console.log('Remaining suspicious tokens:', remaining ? remaining.length : 0);
