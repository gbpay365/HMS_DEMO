// fix_all_views.js — fix encoding in all EJS view files
const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, 'views');
const files = fs.readdirSync(viewsDir).filter(f => f.endsWith('.ejs'));

let totalFixed = 0;
for (const filename of files) {
    const filepath = path.join(viewsDir, filename);
    let content = fs.readFileSync(filepath, 'utf8');
    const before = content.length;

    // Replace runs of 3+ non-ASCII characters
    content = content.replace(/[^\x00-\x7E]{3,}/g, function(match) {
        if (match.length > 8) return '';
        return '-';
    });
    content = content.replace(/Â€./g, '-');
    content = content.replace(/\s*-\s{2,}/g, ' - ');
    content = content.replace(/ {3,}/g, ' ');

    if (content.length !== before) {
        fs.writeFileSync(filepath, content, 'utf8');
        const removed = before - content.length;
        console.log(`Fixed: ${filename} (removed ${removed} chars)`);
        totalFixed++;
    }
}
console.log(`\nDone. Fixed ${totalFixed}/${files.length} files.`);
