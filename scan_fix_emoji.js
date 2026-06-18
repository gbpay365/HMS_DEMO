// scan_fix_emoji.js — Find and fix all mojibake/broken encoding in EJS files
const fs = require('fs');
const path = require('path');
const glob = require('path');

// Get all EJS files
const viewsDir = path.join(__dirname, 'views');
const ejsFiles = fs.readdirSync(viewsDir).filter(f => f.endsWith('.ejs')).map(f => path.join(viewsDir, f));

// Also check partials
const partialsDir = path.join(viewsDir, 'partials');
if (fs.existsSync(partialsDir)) {
  fs.readdirSync(partialsDir).filter(f => f.endsWith('.ejs')).forEach(f => ejsFiles.push(path.join(partialsDir, f)));
}

// Mojibake replacement map
const replacements = [
  // Ellipsis
  [/â€¦/g, '...'],
  // Em-dash
  [/â€"/g, '\u2014'],
  [/â€"/g, '\u2013'],
  // Quotes
  [/â€™/g, "'"],
  [/â€˜/g, "'"],
  [/â€œ/g, '"'],
  [/â€\u009d/g, '"'],
  // Middle dot
  [/Â·/g, '\u00B7'],
  [/Ã‚Â·/g, '\u00B7'],
  // Degree
  [/Â°/g, '\u00B0'],
  [/Ã‚Â°/g, '\u00B0'],
  // Heart symbol
  [/â™¥/g, '\u2665'],
  // Subscript 2
  [/â‚‚/g, '\u2082'],
  // Scale/balance
  [/âš–/g, '\u2696'],
  // Thermometer emoji (4-byte)
  [/ðŸŒ¡/g, '\uD83C\uDF21'],
  // Stethoscope
  [/ðŸ©º/g, '\uD83E\uDE7A'],
  // Clipboard
  [/ðŸ"‹/g, '\uD83D\uDCCB'],
  // Door
  [/ðŸšª/g, '\uD83D\uDEAA'],
  // Mechanical arm
  [/ðŸ¦¾/g, '\uD83E\uDDBE'],
  // Hospital
  [/ðŸ¥/g, '\uD83C\uDFE5'],
  // Syringe
  [/ðŸ'‰/g, '\uD83D\uDC89'],
  // Pill
  [/ðŸ'Š/g, '\uD83D\uDC8A'],
  // Test tube
  [/ðŸ§ª/g, '\uD83E\uDDEA'],
  // Microscope
  [/ðŸ"¬/g, '\uD83D\uDD2C'],
  // Memo/note
  [/ðŸ"/g, '\uD83D\uDCDD'],
  // Warning
  [/âš /g, '\u26A0'],
  // Check mark
  [/âœ"/g, '\u2714'],
  [/âœ…/g, '\u2705'],
  // Cross mark
  [/âŒ/g, '\u274C'],
  // Arrow right
  [/â†'/g, '\u2192'],
  [/â†/g, '\u2190'],
  // Bullet
  [/â€¢/g, '\u2022'],
  // Non-breaking space artifacts
  [/Â /g, ' '],
  // Common Ã prefix artifacts (double-encoded UTF-8)
  [/Ã©/g, '\u00E9'],  // é
  [/Ã¨/g, '\u00E8'],  // è
  [/Ã /g, '\u00E0'],   // à (careful - only standalone)
  [/Ã§/g, '\u00E7'],  // ç
  [/Ã®/g, '\u00EE'],  // î
  [/Ã´/g, '\u00F4'],  // ô
  [/Ã¢/g, '\u00E2'],  // â
  [/Ã«/g, '\u00EB'],  // ë
  [/Ã¼/g, '\u00FC'],  // ü
  // The Æ' artifact in comments (leave as-is in comments, but note)
];

let totalFixes = 0;
const report = [];

ejsFiles.forEach(filePath => {
  const filename = path.basename(filePath);
  let content = fs.readFileSync(filePath, 'utf8');
  let fileFixed = 0;
  
  replacements.forEach(([pattern, replacement]) => {
    const matches = content.match(pattern);
    if (matches) {
      fileFixed += matches.length;
      content = content.replace(pattern, replacement);
    }
  });
  
  if (fileFixed > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    report.push({ file: filename, fixes: fileFixed });
    totalFixes += fileFixed;
  }
});

console.log('=== Emoji/Encoding Fix Report ===');
console.log('Files scanned:', ejsFiles.length);
console.log('Total fixes:', totalFixes);
report.forEach(r => console.log('  ' + r.file + ': ' + r.fixes + ' fixes'));

if (totalFixes === 0) {
  console.log('\nNo mojibake found in EJS files. Checking for HTML entity emoji that should be used instead...');
}

// Also scan for remaining suspicious patterns
console.log('\n=== Remaining suspicious patterns ===');
ejsFiles.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const filename = path.basename(filePath);
  lines.forEach((line, i) => {
    // Check for Ã character (double-encoding marker)
    if (/[ÃÂ]/.test(line) && !line.includes('<%') && !line.includes('//')) {
      // Skip lines that are just template code or comments
      const trimmed = line.trim();
      if (trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('*')) {
        console.log(filename + ':' + (i+1) + ': ' + trimmed.substring(0, 80));
      }
    }
  });
});
