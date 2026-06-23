'use strict';

const cfg = require('../lib/integrationConfig');
const { getSettings } = require('../lib/facilityIntegrationSettings');
const { ensureIntegrationSchema } = require('../lib/ensureIntegrationSchema');
const { upsertLink } = require('../lib/integrationEntityLink');
const { finTablesOk } = require('../lib/hmsFinGeneralLedger');
const { journalPostExtended } = require('../lib/hmsFinJournalPost');

function createIntegrationApiKeyGuard(pool) {
  return async function integrationApiKeyGuard(req, res, next) {
    try {
      const facilityId = parseFacilityId(req, req.body?.facility_id);
      const settings = await getSettings(pool, facilityId);
      const expected = settings.hms_api_key_inbound || cfg.hmsInboundApiKey();
      const got = String(req.headers['x-api-key'] || '').trim();
      if (!got || got !== expected) {
        return res.status(401).json({ error: 'Invalid integration API key.' });
      }
      req.integrationFacilityId = facilityId;
      return next();
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  };
}

function parseFacilityId(req, bodyFacility = 0) {
  const h = parseInt(String(req.headers['x-facility-id'] || ''), 10);
  if (h > 0) return h;
  const b = parseInt(String(bodyFacility || ''), 10);
  return b > 0 ? b : cfg.facilityId();
}

async function upsertFinAccount(pool, facilityId, acct) {
  const code = String(acct.code || '').trim();
  if (!/^\d{6}$/.test(code)) return false;
  const label = acct.label_en || acct.label || acct.name || code;
  const ohada = parseInt(String(acct.ohada_class || code[0]), 10) || 0;
  const type = String(acct.account_type || 'expense');
  const posting = acct.is_posting === false || acct.is_posting === 0 ? 0 : 1;
  const active = acct.active === false || acct.active === 0 ? 0 : 1;

  const [[exists]] = await pool
    .query(`SELECT id FROM tbl_fin_account WHERE code=? LIMIT 1`, [code])
    .catch(() => [[null]]);

  if (exists?.id) {
    await pool.query(
      `UPDATE tbl_fin_account
          SET label_en=?, name=?, ohada_class=?, account_type=?, is_posting=?, active=?, facility_id=?
        WHERE id=?`,
      [label, label, ohada, type, posting, active, facilityId, exists.id]
    );
  } else {
    await pool.query(
      `INSERT INTO tbl_fin_account (code, account_number, label_en, name, ohada_class, account_type, is_posting, active, facility_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [code, code, label, label, ohada, type, posting, active, facilityId]
    );
  }
  return true;
}

module.exports = function mountIntegrations(app, pool) {
  const integrationApiKeyGuard = createIntegrationApiKeyGuard(pool);

  app.get('/api/v1/integrations/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'HMS_JS',
      integrationsEnabled: cfg.isIntegrationEnabled(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/integrations/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'HMS_JS',
      integrationsEnabled: cfg.isIntegrationEnabled(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/integrations', integrationApiKeyGuard);

  app.post('/api/integrations/chart-of-accounts', async (req, res) => {
    try {
      await ensureIntegrationSchema(pool);
      if (!(await finTablesOk(pool))) {
        return res.status(503).json({ error: 'Financial tables not installed.' });
      }
      const facilityId = parseFacilityId(req, req.body?.facility_id);
      const acct = req.body?.account || req.body;
      const ok = await upsertFinAccount(pool, facilityId, acct);
      if (!ok) return res.status(422).json({ error: 'Invalid account payload.' });
      await upsertLink(pool, facilityId, 'ACCOUNT_CORE', 'account', acct.code, acct.code, null);
      return res.status(201).json({ status: 'upserted', code: acct.code });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post('/api/integrations/journal-entry', async (req, res) => {
    try {
      await ensureIntegrationSchema(pool);
      if (!(await finTablesOk(pool))) {
        return res.status(503).json({ error: 'Financial tables not installed.' });
      }
      const facilityId = parseFacilityId(req, req.body?.facility_id);
      const entry = req.body?.entry || req.body;
      const extRef = String(req.body?.external_reference || entry.external_reference || '').trim();
      if (!extRef) return res.status(422).json({ error: 'external_reference required.' });

      const [[dup]] = await pool
        .query(
          `SELECT id FROM tbl_fin_journal_header WHERE source_type='account_core' AND source_id=? LIMIT 1`,
          [extRef]
        )
        .catch(() => [[null]]);
      if (dup?.id) return res.status(409).json({ status: 'duplicate', journalId: dup.id });

      const lines = (entry.lines || []).map((ln) => ({
        account_code: String(ln.account_code || '').trim(),
        account_label: ln.line_description || ln.account_code || '',
        debit: parseFloat(ln.debit) || 0,
        credit: parseFloat(ln.credit) || 0,
        line_memo: ln.line_description || '',
      }));
      if (lines.length < 2) return res.status(422).json({ error: 'At least 2 lines required.' });

      const r = await journalPostExtended(pool, {
        facilityId,
        sourceType: 'account_core',
        sourceId: extRef,
        reference: entry.reference || extRef,
        narration: entry.description || entry.narration || 'Account_Core journal',
        createdBy: 0,
        lines,
        entryDate: String(entry.entry_date || '').slice(0, 10),
        journalCode: entry.journal_type === 'ACH' ? 'ACH' : 'OD',
        status: 'posted',
      });
      if (r.duplicate) return res.status(409).json({ status: 'duplicate' });
      if (r.code !== 1) return res.status(422).json({ error: 'Journal post failed.' });
      return res.status(201).json({ status: 'created', code: r.code });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  });

};
