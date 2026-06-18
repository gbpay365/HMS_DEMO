'use strict';

const hmsFinSettings = require('../lib/hmsFinSettings');

module.exports = function mountFinancialsSettings(app, pool, requireAuth, requirePerm) {
  const readPerm = requirePerm(
    'accounting.read',
    'accounting.write',
    'financials.read',
    'financials.write'
  );
  const writePerm = requirePerm('accounting.write', 'financials.write');

  async function ensureFinSettingsTable(db) {
    await db
      .query(
        `CREATE TABLE IF NOT EXISTS tbl_hms_fin_setting (
         k VARCHAR(80) PRIMARY KEY,
         v TEXT NULL,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       )`
      )
      .catch(() => {});
  }

  app.get(
    '/financials/settings',
    requireAuth,
    readPerm,
    async (req, res) => {
      try {
        await ensureFinSettingsTable(pool);
        const section = String(req.query.section || 'general').slice(0, 32);
        const data = await hmsFinSettings.loadSettingsPage(pool, {
          section,
          m: req.query.m,
          y: req.query.y,
          canWrite: true,
        });
        const { settingsPayload } = require('../lib/finReactPayloads');
        res.render('financials-settings', {
          title: 'Accounting settings',
          ...settingsPayload({
            ...data,
            flash: req.query.msg || null,
            error: req.query.err || null,
          }),
        });
      } catch (e) {
        console.error('FIN SETTINGS:', e);
        res.status(500).render('error', {
          title: 'Error',
          message: e.message || 'Settings failed to load',
          status: 500,
        });
      }
    }
  );

  app.post(
    '/financials/settings/save',
    requireAuth,
    writePerm,
    async (req, res) => {
      try {
        await ensureFinSettingsTable(pool);
        const s = req.body.settings || {};
        const section = String(req.body.section || 'general').slice(0, 32);
        const pairs = [
          ['company.legal_name', s.company_legal_name],
          ['company.city', s.company_city],
          ['company.currency', s.company_currency || 'XAF'],
          ['company.fiscal_regime', s.company_fiscal_regime],
          ['accounting.chart', s.accounting_chart],
          ['tax.company_niu', s.company_niu],
          ['tax.tva_rate_standard', s.tva_rate_standard],
          ['tax.cnps_employer_pct', s.cnps_employer_pct],
        ];
        for (const [k, v] of pairs) {
          await hmsFinSettings.setFinSetting(pool, k, v);
        }
        if (section === 'payments') {
          const betterPayConfig = require('../lib/betterPayConfig');
          await betterPayConfig.saveSettings(pool, {
            partner_identifier: s.betterpay_partner_identifier,
            pay_base_url: s.betterpay_pay_base_url,
            webhook_secret: s.betterpay_webhook_secret,
            status_url: s.betterpay_status_url,
            api_key: s.betterpay_api_key,
          });
        }
        const q = new URLSearchParams({ section, msg: 'Settings saved.' });
        if (req.body.m) q.set('m', req.body.m);
        if (req.body.y) q.set('y', req.body.y);
        res.redirect('/financials/settings?' + q.toString());
      } catch (e) {
        const q = new URLSearchParams({
          section: req.body.section || 'general',
          err: e.message,
        });
        res.redirect('/financials/settings?' + q.toString());
      }
    }
  );

  app.get('/financials/tax', requireAuth, readPerm, (req, res) => {
    const q = new URLSearchParams();
    q.set('section', 'taxes');
    if (req.query.m) q.set('m', req.query.m);
    if (req.query.y) q.set('y', req.query.y);
    if (req.query.msg) q.set('msg', req.query.msg);
    if (req.query.err) q.set('err', req.query.err);
    res.redirect(302, '/financials/settings?' + q.toString());
  });

  app.post('/financials/tax/save', requireAuth, writePerm, async (req, res) => {
    try {
      await ensureFinSettingsTable(pool);
      const s = req.body.settings || {};
      for (const [k, v] of [
        ['tax.company_niu', s.company_niu],
        ['tax.tva_rate_standard', s.tva_rate_standard],
        ['tax.cnps_employer_pct', s.cnps_employer_pct],
      ]) {
        await hmsFinSettings.setFinSetting(pool, k, v);
      }
      const q = new URLSearchParams({ section: 'taxes', msg: 'Tax parameters saved.' });
      if (req.body.m) q.set('m', req.body.m);
      if (req.body.y) q.set('y', req.body.y);
      res.redirect('/financials/settings?' + q.toString());
    } catch (e) {
      res.redirect(
        '/financials/settings?section=taxes&err=' + encodeURIComponent(e.message)
      );
    }
  });
};
