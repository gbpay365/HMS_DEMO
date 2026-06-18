// fix_all_emoji_v2.js — Replace broken emoji using hex byte matching
const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, 'views');
const ejsFiles = [];
fs.readdirSync(viewsDir).filter(f => f.endsWith('.ejs')).forEach(f => ejsFiles.push(path.join(viewsDir, f)));
const partialsDir = path.join(viewsDir, 'partials');
if (fs.existsSync(partialsDir)) {
  fs.readdirSync(partialsDir).filter(f => f.endsWith('.ejs')).forEach(f => ejsFiles.push(path.join(partialsDir, f)));
}

let totalFixes = 0;
const report = [];

ejsFiles.forEach(filePath => {
  const filename = path.basename(filePath);
  let buf = fs.readFileSync(filePath);
  let content = buf.toString('utf8');
  let fileFixed = 0;

  // Simple string replacements for known broken patterns
  const pairs = [
    // Broken degree sign
    ['\u00C2\u00B0', '&deg;'],
    // Broken middle dot
    ['\u00C2\u00B7', '&middot;'],
    // Broken non-breaking space
    ['\u00C2\u00A0', ' '],
    // Broken ellipsis
    ['\u00E2\u0080\u00A6', '&hellip;'],
    // Broken em-dash
    ['\u00E2\u0080\u0094', '&mdash;'],
    // Broken en-dash
    ['\u00E2\u0080\u0093', '&ndash;'],
    // Broken right single quote
    ['\u00E2\u0080\u0099', "'"],
    // Broken left single quote
    ['\u00E2\u0080\u0098', "'"],
    // Broken bullet
    ['\u00E2\u0080\u00A2', '&bull;'],
    // Broken heart
    ['\u00E2\u0099\u00A5', '&#x2665;'],
    // Broken subscript 2
    ['\u00E2\u0082\u0082', '&#x2082;'],
    // Broken scale
    ['\u00E2\u009A\u0096', '&#x2696;'],
    // Broken warning
    ['\u00E2\u009A\u00A0', '&#x26A0;'],
    // Broken checkmark
    ['\u00E2\u009C\u0094', '&#x2714;'],
    // Broken arrow right
    ['\u00E2\u0086\u0092', '&#x2192;'],
  ];

  pairs.forEach(([broken, safe]) => {
    while (content.includes(broken)) {
      content = content.split(broken).join(safe);
      fileFixed++;
    }
  });

  // Now handle raw multi-byte emoji that cause encoding issues on deployment
  // Replace them with HTML numeric character references
  const emojiMap = [
    ['\uD83D\uDCCB', '&#x1F4CB;'],  // 📋
    ['\uD83D\uDCB3', '&#x1F4B3;'],  // 💳
    ['\uD83D\uDEAA', '&#x1F6AA;'],  // 🚪
    ['\uD83E\uDDBE', '&#x1F9BE;'],  // 🦾
    ['\uD83E\uDE7A', '&#x1FA7A;'],  // 🩺
    ['\uD83C\uDF21', '&#x1F321;'],  // 🌡
    ['\uD83D\uDC89', '&#x1F489;'],  // 💉
    ['\uD83D\uDC8A', '&#x1F48A;'],  // 💊
    ['\uD83E\uDDEA', '&#x1F9EA;'],  // 🧪
    ['\uD83D\uDD2C', '&#x1F52C;'],  // 🔬
    ['\uD83D\uDCDD', '&#x1F4DD;'],  // 📝
    ['\uD83C\uDFE5', '&#x1F3E5;'],  // 🏥
    ['\uD83D\uDECF', '&#x1F6CF;'],  // 🛏
    ['\u2665', '&#x2665;'],          // ♥
    ['\u2082', '&#x2082;'],          // ₂
    ['\u2696', '&#x2696;'],          // ⚖
    ['\u26A0', '&#x26A0;'],          // ⚠
    ['\u00B0', '&deg;'],             // °
  ];

  emojiMap.forEach(([raw, entity]) => {
    while (content.includes(raw)) {
      content = content.split(raw).join(entity);
      fileFixed++;
    }
  });

  if (fileFixed > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    report.push({ file: filename, fixes: fileFixed });
    totalFixes += fileFixed;
  }
});

console.log('=== Comprehensive Emoji Fix Report ===');
console.log('Files scanned:', ejsFiles.length);
console.log('Total replacements:', totalFixes);
report.forEach(r => console.log('  ' + r.file + ': ' + r.fixes + ' fixes'));

// Check for remaining mojibake byte sequences
console.log('\n=== Remaining check ===');
let remaining = 0;
ejsFiles.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);
  content.split('\n').forEach((line, i) => {
    // Look for the telltale Ã‚ or Ã¢ double-encoding markers
    if (/[\u00C3][\u0080-\u00BF]/.test(line) || /[\u00C2][\u00A0-\u00BF]/.test(line)) {
      console.log(filename + ':' + (i+1) + ': ' + line.trim().substring(0, 90));
      remaining++;
    }
  });
});
if (remaining === 0) console.log('All clean!');

// Verify EJS syntax
console.log('\n=== EJS Lint ===');
try {
  require('child_process').execSync('npx ejs-lint views/ipd-ward-rounds.ejs', { cwd: __dirname, timeout: 15000 });
  console.log('ipd-ward-rounds.ejs: OK');
} catch(e) { console.log('ipd-ward-rounds.ejs: ' + (e.stderr||e.stdout||'').toString().split('\n')[0]); }
try {
  require('child_process').execSync('npx ejs-lint views/wards.ejs', { cwd: __dirname, timeout: 15000 });
  console.log('wards.ejs: OK');
} catch(e) { console.log('wards.ejs: ' + (e.stderr||e.stdout||'').toString().split('\n')[0]); }
