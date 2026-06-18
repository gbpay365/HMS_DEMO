/**
 * Render HMS documentation PDFs via PHP CLI + Dompdf (htdocs_php vendor).
 */
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const PHP_ROOT = path.join(__dirname, '..', 'htdocs_php', 'htdocs');

const DOC_CLI = {
 'user-guide': 'cli/doc-user-guide.php',
 'users-manual': 'cli/doc-users-manual.php',
 architecture: 'cli/doc-architecture.php',
 workflow: 'cli/doc-workflow.php'
};

function phpPdfAvailable() {
 const vendor = path.join(PHP_ROOT, 'vendor', 'autoload.php');
 return fs.existsSync(vendor);
}

/**
 * @returns {Promise<Buffer|null>}
 */
async function renderDocPdf(docKey) {
 const rel = DOC_CLI[docKey];
 if (!rel || !phpPdfAvailable()) return null;
 const phpBin = process.env.HMS_PHP_BIN || 'php';
 const script = path.join(PHP_ROOT, rel);
 if (!fs.existsSync(script)) return null;
 try {
  const { stdout } = await execFileAsync(phpBin, [script], {
   cwd: PHP_ROOT,
   maxBuffer: 32 * 1024 * 1024,
   windowsHide: true
  });
  if (!stdout || stdout.length < 100) return null;
  if (stdout.slice(0, 4).toString() !== '%PDF') return null;
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
 } catch (e) {
  console.warn('HMS docs PDF (' + docKey + '):', e.message || e);
  return null;
 }
}

function pdfFilename(docKey) {
 const d = new Date().toISOString().slice(0, 10);
 const map = {
  'user-guide': `HMS_User_Guide_${d}.pdf`,
  'users-manual': `HMS_Users_Manual_${d}.pdf`,
  architecture: `HMS_Architecture_Design_${d}.pdf`,
  workflow: `HMS_Workflow_${d}.pdf`
 };
 return map[docKey] || `HMS_Doc_${d}.pdf`;
}

module.exports = {
 PHP_ROOT,
 DOC_CLI,
 phpPdfAvailable,
 renderDocPdf,
 pdfFilename
};
