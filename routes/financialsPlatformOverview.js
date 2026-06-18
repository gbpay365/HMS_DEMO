/**
 * Help & database setup — parity with htdocs_php/htdocs/platform-overview.php.
 */
const path = require('path');
const fs = require('fs');
const {
 MIGRATION_STEPS,
 WORKFLOW_STEPS,
 MIGRATION_BASE,
 migrationPath,
 platformSchemaStatus
} = require('../lib/hmsPlatformOverview');
const { phpPdfAvailable } = require('../lib/hmsDocsPhpPdf');

function isAdmin(req) {
 const r = String(req.session?.user?.role || req.session?.role || '');
 return r === '1' || r === '99';
}

function currentLang(req) {
 const l = String(req.session?.lang || 'en').toLowerCase();
 return l === 'fr' ? 'fr' : 'en';
}

const { platformOverviewPayload } = require('../lib/finReactPayloads');

async function renderOverview(req, res, pool) {
 const schemaStatus = await platformSchemaStatus(pool);
 const demoHtml = path.join(__dirname, '..', 'htdocs_php', 'htdocs', 'docs', 'demo-presentation.html');
 res.render('financials-platform-overview', {
  title: 'Help & setup — ZAIZENS',
  ...platformOverviewPayload({
   migrationSteps: MIGRATION_STEPS,
   workflowSteps: WORKFLOW_STEPS,
   schemaStatus,
   lang: currentLang(req),
   isAdmin: isAdmin(req),
   hasDemoDeck: fs.existsSync(demoHtml),
   flash: req.query.msg || null,
   error: req.query.err || null,
  }),
 });
}

module.exports = function registerFinancialsPlatformOverview(app, pool, requireAuth) {
 app.get('/platform-overview', requireAuth, (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect('/financials/platform-overview' + q);
 });

 app.get('/financials/platform-overview', requireAuth, async (req, res) => {
  try {
   await renderOverview(req, res, pool);
  } catch (err) {
   console.error('PLATFORM OVERVIEW:', err.message);
   res.status(500).render('error', { title: 'Error', message: err.message, status: 500 });
  }
 });

 app.get('/docs/demo-presentation.html', requireAuth, (req, res) => {
  const file = path.join(__dirname, '..', 'htdocs_php', 'htdocs', 'docs', 'demo-presentation.html');
  if (!fs.existsSync(file)) {
   return res.status(404).render('error', {
    title: 'Not found',
    message: 'Demo presentation file is missing from the repository.',
    status: 404
   });
  }
  res.sendFile(file);
 });
};
