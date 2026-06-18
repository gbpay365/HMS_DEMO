/**
 * HMS documentation — HTML guides + PDF via PHP/Dompdf when available.
 */
const { buildDocHtml } = require('../lib/hmsDocsHtml');
const { phpPdfAvailable, renderDocPdf, pdfFilename } = require('../lib/hmsDocsPhpPdf');

const DOC_META = {
 'user-guide': {
  title: 'User Guide',
  pdfKey: 'user-guide',
  legacyPaths: ['user-guide-pdf', 'user-guide-pdf.php']
 },
 'users-manual': {
  title: 'Users Manual',
  pdfKey: 'users-manual',
  legacyPaths: ['users-manual-pdf', 'users-manual-pdf.php']
 },
 'architecture-document': {
  title: 'Architecture design',
  pdfKey: 'architecture',
  legacyPaths: ['architecture-document-pdf', 'architecture-document-pdf.php']
 },
 'workflow-document': {
  title: 'Workflow document',
  pdfKey: 'workflow',
  legacyPaths: ['workflow-document-pdf', 'workflow-document-pdf.php']
 },
 'product-document': {
  title: 'Product Document',
  pdfKey: null,
  legacyPaths: []
 },
 'comprehensive-user-guide': {
  title: 'Comprehensive User Guide',
  pdfKey: null,
  legacyPaths: []
 },
 'opd-users-manual': {
  title: 'OPD User\'s Manual',
  pdfKey: null,
  legacyPaths: []
 },
 'ipd-users-manual': {
  title: 'IPD User\'s Manual',
  pdfKey: null,
  legacyPaths: []
 },
 'emergency-users-manual': {
  title: 'Emergency User\'s Manual',
  pdfKey: null,
  legacyPaths: []
 },
 'maternity-users-manual': {
  title: 'Maternity User\'s Manual',
  pdfKey: null,
  legacyPaths: []
 },
 'cashier-users-manual': {
  title: 'Cashier User\'s Manual',
  pdfKey: null,
  legacyPaths: []
 },
 'lab-users-manual': {
  title: 'Laboratory User\'s Manual',
  pdfKey: null,
  legacyPaths: []
 },
 'radiology-users-manual': {
  title: 'Radiology User\'s Manual',
  pdfKey: null,
  legacyPaths: []
 },
 'pharmacy-users-manual': {
  title: 'Pharmacy User\'s Manual',
  pdfKey: null,
  legacyPaths: []
 },
 'nursing-users-manual': {
  title: 'Nursing User\'s Manual',
  pdfKey: null,
  legacyPaths: []
 },
 'doctor-users-manual': {
  title: 'Doctor User\'s Manual',
  pdfKey: null,
  legacyPaths: []
 },
 'director-users-manual': {
  title: 'Hospital Director User\'s Manual',
  pdfKey: null,
  legacyPaths: []
 }
};

function resolveDocKey(slug) {
 if (DOC_META[slug]) return slug;
 for (const [key, meta] of Object.entries(DOC_META)) {
  if (meta.legacyPaths.includes(slug)) return key;
 }
 return null;
}

module.exports = function registerHmsDocs(app, requireAuth) {
 async function sendPdf(res, docKey) {
  const meta = DOC_META[docKey];
  if (!meta || !meta.pdfKey) {
   return res.status(503).render('error', {
    title: 'PDF unavailable',
    message:
     'PDF export is not configured for this document. Open the HTML guide and use Print → Save as PDF.',
    status: 503
   });
  }
  const buf = await renderDocPdf(meta.pdfKey);
  if (!buf) {
   return res.status(503).render('error', {
    title: 'PDF unavailable',
    message:
     'Could not generate PDF. Install PHP, run composer install in htdocs_php/htdocs (Dompdf), or open the HTML guide and use Print → Save as PDF.',
    status: 503
   });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${pdfFilename(DOC_META[docKey].pdfKey)}"`);
  res.send(buf);
 }

 function sendHtml(req, res, docKey) {
  const html = buildDocHtml(docKey);
  if (!html) {
   return res.status(404).render('error', { title: 'Not found', message: 'Unknown document.', status: 404 });
  }
  res.render('docs-print', {
   title: `${DOC_META[docKey].title} — ZAIZENS`,
   docKey,
   docTitle: DOC_META[docKey].title,
   bodyHtml: html,
   pdfAvailable: !!(DOC_META[docKey].pdfKey && phpPdfAvailable()),
   pdfUrl: `/docs/${docKey}?format=pdf`,
   backUrl: req.query.back || '/financials/platform-overview'
  });
 }

 app.get('/docs/:slug', requireAuth, async (req, res) => {
  const docKey = resolveDocKey(String(req.params.slug || '').replace(/\.php$/i, ''));
  if (!docKey) {
   return res.status(404).render('error', { title: 'Not found', message: 'Unknown document.', status: 404 });
  }
  if (String(req.query.format || '').toLowerCase() === 'pdf') {
   return sendPdf(res, docKey);
  }
  return sendHtml(req, res, docKey);
 });

 /** PHP parity paths: docs/user-guide-pdf.php */
 for (const [docKey, meta] of Object.entries(DOC_META)) {
  for (const legacy of meta.legacyPaths) {
   app.get(`/docs/${legacy}`, requireAuth, (req, res) => {
    if (String(req.query.view || '') === 'html') {
     return res.redirect(`/docs/${docKey}`);
    }
    return res.redirect(`/docs/${docKey}?format=pdf`);
   });
  }
 }
};
