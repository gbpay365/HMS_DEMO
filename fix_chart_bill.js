// fix_chart_bill.js — Replace broken emoji on Chart/Bill buttons with Font Awesome icons
const fs = require('fs');
const f = 'views/ipd-ward-rounds.ejs';
const lines = fs.readFileSync(f, 'utf8').split('\n');

let fixed = 0;
lines.forEach((line, i) => {
  // Fix Chart button - find line containing "Chart</a>"
  if (line.includes('Chart</a>') && line.includes('patient-chart')) {
    lines[i] = ' <a href="/patient-chart/<' + '%=adm.patient_id%' + '>" class="btn btn-outline-primary btn-sm" style="font-size:.72rem;"><i class="fa fa-clipboard mr-1"></i>Chart</a>\r';
    console.log('Fixed line ' + (i+1) + ': Chart button');
    fixed++;
  }
  // Fix Bill button - find line containing "Bill</a>"
  if (line.includes('Bill</a>') && line.includes('running-bill')) {
    lines[i] = ' <a href="/ipd/running-bill/<' + '%=adm.id%' + '>" class="btn btn-outline-secondary btn-sm" style="font-size:.72rem;"><i class="fa fa-credit-card mr-1"></i>Bill</a>\r';
    console.log('Fixed line ' + (i+1) + ': Bill button');
    fixed++;
  }
});

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Total fixes:', fixed);

// Also run a broad scan for any remaining mojibake in this file
const content = fs.readFileSync(f, 'utf8');
const remaining = [];
content.split('\n').forEach((line, i) => {
  // Check for common mojibake byte sequences
  if (/[\u00c3][\u0080-\u00bf]|[\u00c2][\u00a0-\u00bf]|\u00c6\u2019|\u00c3\u0192/.test(line)) {
    remaining.push((i+1) + ': ' + line.trim().substring(0, 80));
  }
});
if (remaining.length) {
  console.log('\nRemaining suspicious lines:');
  remaining.forEach(r => console.log('  ' + r));
} else {
  console.log('\nNo remaining mojibake found.');
}
