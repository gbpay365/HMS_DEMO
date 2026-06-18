'use strict';

const { buildFinancialDashboard } = require('../lib/hmsFinDashboard');
const { searchPostingAccounts } = require('../lib/hmsFinPostingCatalog');

function finApiRead(req, res, next) {
 const p = res.locals.userPerms || [];
 const ok =
  p.includes('*') ||
  p.includes('accounting.read') ||
  p.includes('accounting.write') ||
  p.includes('financials.read') ||
  p.includes('financials.write') ||
  p.includes('billing.read') ||
  p.includes('billing.write');
 if (ok) return next();
 return res.status(403).json({ ok: false, error: 'Access denied.' });
}

/**
 * @param {import('express').Application} app
 * @param {import('mysql2/promise').Pool} pool
 * @param {import('express').RequestHandler} requireAuth
 * @param {(...keys: string[]) => import('express').RequestHandler} requirePerm
 */
module.exports = function mountFinancialsHub(app, pool, requireAuth, requirePerm) {
 const canView = requirePerm(
  'accounting.read',
  'accounting.write',
  'billing.write',
  'financials.read',
  'financials.write'
 );

 app.get('/api/financials/dashboard', requireAuth, canView, async (req, res) => {
  try {
   const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
   const data = await buildFinancialDashboard(pool, fid);
   res.json({ ok: true, ...data });
  } catch (e) {
   res.status(500).json({ ok: false, error: e.message || 'Dashboard failed.' });
  }
 });

 app.get('/api/financials/accounts', requireAuth, finApiRead, async (req, res) => {
  try {
   const q = String(req.query.q || '').trim();
   const limit = Math.min(80, Math.max(5, parseInt(String(req.query.limit || '40'), 10) || 40));
   const accounts = await searchPostingAccounts(pool, q, limit);
   res.json({ ok: true, accounts });
  } catch (e) {
   res.status(500).json({ ok: false, error: e.message || 'Account search failed.' });
  }
 });
};
