// fix_titles.js — fixes the mangled title strings after encoding cleanup
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'app.js');
let content = fs.readFileSync(file, 'utf8');
const before = content.length;

// Fix the pattern "=== - === -" or "=== - ===" that appear in title strings
// These were box-drawing chars (===) adjacent to em-dash ( - ) from the corrupted encoding

// Pattern: replace "=== - === - " or "= - = - " etc. followed by rest of title
// with a clean " - " separator
content = content.replace(/title:\s*'([^']*)'/g, (match, title) => {
    let clean = title
        .replace(/={2,}\s*-\s*={2,}\s*-?\s*/g, ' - ')  // === - === - → " - "
        .replace(/={2,}\s*-\s*/g, ' - ')                 // === - → " - "
        .replace(/\s*-\s*={2,}/g, ' - ')                 // - === → " - "
        .replace(/={2,}/g, '')                            // remaining === → nothing
        .replace(/\s{2,}/g, ' ')                          // multiple spaces → one
        .trim();
    return `title: '${clean}'`;
});

content = content.replace(/title:\s*`([^`]*)`/g, (match, title) => {
    let clean = title
        .replace(/={2,}\s*-\s*={2,}\s*-?\s*/g, ' - ')
        .replace(/={2,}\s*-\s*/g, ' - ')
        .replace(/\s*-\s*={2,}/g, ' - ')
        .replace(/={2,}/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    return `title: \`${clean}\``;
});

content = content.replace(/title:\s*"([^"]*)"/g, (match, title) => {
    let clean = title
        .replace(/={2,}\s*-\s*={2,}\s*-?\s*/g, ' - ')
        .replace(/={2,}\s*-\s*/g, ' - ')
        .replace(/\s*-\s*={2,}/g, ' - ')
        .replace(/={2,}/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    return `title: "${clean}"`;
});

// Also fix comment separators: "=== ===" → "========" for visual clarity
content = content.replace(/={3,}(\s*=){2,}/g, m => '='.repeat(30));

fs.writeFileSync(file, content, { encoding: 'utf8' });
console.log(`Done. Size: ${before} -> ${content.length}`);

// Show all title strings to verify
const titles = [...content.matchAll(/title:\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
const uniqueTitles = [...new Set(titles)].filter(t => t.includes('TSSF') || t.includes('Error'));
console.log('\nAll page titles:');
uniqueTitles.forEach(t => console.log(' ', t));

// Syntax check
const { execSync } = require('child_process');
try {
    execSync('node --check app.js', { cwd: __dirname });
    console.log('\nSyntax: OK');
} catch (e) {
    console.error('\nSyntax ERROR:', e.message.split('\n')[0]);
}
