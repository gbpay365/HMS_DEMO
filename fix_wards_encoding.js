// fix_wards_encoding.js — clean garbled text from wards.ejs
const fs = require('fs');
const file = 'views/wards.ejs';
let content = fs.readFileSync(file, 'utf8');
const before = content.length;

// Replace any run of 3+ non-ASCII chars
content = content.replace(/[^\x00-\x7E]{3,}/g, function(match) {
    if (match.length > 8) return '';   // long box-drawing → remove
    return '-';                         // short (em-dash etc) → hyphen
});

// Fix "Â€" + quote patterns (garbled em-dash variants)
content = content.replace(/Â€./g, '-');
content = content.replace(/\s*-\s*-\s*/g, ' - ');

// Clean up the workflow heading
content = content.replace(/IPD WORKFLOW\s*-+\s*10 STATIONS/gi, 'IPD WORKFLOW - 10 STATIONS');

// Clean multiple spaces
content = content.replace(/ {3,}/g, ' ');

fs.writeFileSync(file, content, 'utf8');
console.log('Done. ' + before + ' -> ' + content.length);

const bad = content.match(/[^\x00-\x7E]{3,}/g);
console.log('Remaining garbled:', bad ? bad.length : 0);
