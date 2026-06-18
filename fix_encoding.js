// fix_encoding.js v2 — aggressive cleanup of all garbled UTF-8 in app.js
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'app.js');
let content = fs.readFileSync(file, 'utf8');
const before = content.length;

// Strategy: Any sequence of 3+ non-ASCII characters in a row
// is a garbled encoding artifact. Replace based on context.

// First: specific known replacements (em-dash, arrows, etc.)
const specific = [
    [/\u2014|\u2013/g, ' - '],  // actual em/en dash
    [/\u2192/g, '->'],           // → 
    [/\u2190/g, '<-'],           // ←
    [/\u2713/g, ''],             // ✓ (in comments just remove)
    [/\u2550/g, '='],            // ═
    [/\u00e2\u0080\u0094/g, ' - '], // UTF-8 bytes of em-dash read as Latin-1
];
for (const [pat, rep] of specific) {
    content = content.replace(pat, rep);
}

// Second: aggressive replacement of all remaining 3+ char non-ASCII runs
// These are ALWAYS garbled encoding artifacts in this JS file
// Preserve single non-ASCII chars (they might be intentional in data/comments)
content = content.replace(/[^\x00-\x7E]{3,}/g, (match, offset) => {
    // Check what's around it to decide replacement
    const before3 = content.substring(Math.max(0, offset - 3), offset);
    const after3  = content.substring(offset + match.length, offset + match.length + 3);
    
    // In a comment or at line start — use ' - '
    if (before3.includes('//') || before3.includes('* ')) return ' - ';
    // In a string after a word — likely em-dash
    if (before3.match(/\w$/) || after3.match(/^\w/)) return ' - ';
    // Box-drawing (═══ style) — use ===
    if (match.length > 5) return '===';
    return ' ';
});

// Third: clean up double spaces introduced
content = content.replace(/ {3,}/g, ' ');
content = content.replace(/=== ===/g, '======');
content = content.replace(/= = =/g, '===');

// Fix title strings specifically (they render in browser)
content = content.replace(/title:\s*['"]([^'"]*)['"]/g, (m, t) => {
    const clean = t.replace(/[^\x00-\x7E]+/g, ' - ').replace(/\s+/g, ' ').trim();
    return `title: '${clean}'`;
});

fs.writeFileSync(file, content, { encoding: 'utf8' });
console.log(`Size: ${before} -> ${content.length} (removed ${before - content.length} chars)`);

// Check remaining
const remaining = content.match(/[^\x00-\x7E]{3,}/g);
if (remaining) {
    const unique = [...new Set(remaining)];
    console.log(`Still ${unique.length} unique non-ASCII sequences (showing first 5):`);
    unique.slice(0, 5).forEach(s => console.log(' ', JSON.stringify(s)));
} else {
    console.log('CLEAN: No remaining long non-ASCII sequences!');
}

// Verify syntax
const { execSync } = require('child_process');
try {
    execSync('node --check app.js', { cwd: __dirname });
    console.log('Syntax: OK');
} catch (e) {
    console.error('Syntax ERROR:', e.message.split('\n')[0]);
}
