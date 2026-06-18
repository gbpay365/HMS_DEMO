// fix_prescriptions_route.js
const fs = require('fs');
let src = fs.readFileSync('app.js', 'utf8');

const idx = src.indexOf("app.get('/prescriptions'");
if (idx < 0) { console.error('Cannot find /prescriptions route'); process.exit(1); }

// Find end of route
let depth = 0, i = idx, end = -1;
for (; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}

const newRoute = `app.get('/prescriptions', requireAuth, async (req, res) => {
 try {
 const [prescriptions] = await pool.query(\`
 SELECT r.*, p.first_name, p.last_name 
 FROM tbl_prescription r
 JOIN tbl_patient p ON p.id = r.patient_id
 ORDER BY r.id DESC LIMIT 100
 \`);
 const [patients] = await pool.query(
   'SELECT id, first_name, last_name FROM tbl_patient WHERE status=1 ORDER BY last_name, first_name'
 ).catch(() => [[]]);
 res.render('prescriptions', {
   title: 'Prescriptions - ZAIZENS HMS',
   prescriptions,
   patients: patients || [],
   flash: req.query.msg || null,
   error: req.query.err || null
 });
 } catch (err) {
 console.error(err);
 res.status(500).render('error', { title: 'Error', message: 'Could not fetch prescriptions.', status: 500 });
 }
})`;

src = src.slice(0, idx) + newRoute + src.slice(end + 1);
fs.writeFileSync('app.js', src, 'utf8');

try {
  require('child_process').execSync('node --check app.js', { cwd: __dirname });
  console.log('Prescriptions route updated - Syntax OK');
} catch(e) {
  console.error('Syntax ERROR:', e.stderr ? e.stderr.toString().split('\n')[0] : e.message);
}
