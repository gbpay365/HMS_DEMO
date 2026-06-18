'use strict';

const paymentValidity = require('../lib/paymentValidity');

/**
 * @param {import('express').Application} app
 * @param {import('mysql2/promise').Pool} pool
 * @param {import('express').RequestHandler} requireAuth
 * @param {(...keys: string[]) => import('express').RequestHandler} requirePerm
 */
module.exports = function mountPaymentValidity(app, pool, requireAuth, requirePerm) {
  const canView = requirePerm(
    'payment.validity.read',
    'payment.validity.write',
    'billing.write'
  );
  const canEdit = requirePerm('payment.validity.write', 'billing.write');

  function renderPage(req, res) {
    const fid = req.session.facilityId || 1;
    return paymentValidity.listPaymentValidityRules(pool, fid).then((rules) => {
      res.render('payment-validity', {
        title: 'Payment validity · ZAIZENS',
        rules: Array.isArray(rules) ? rules : [],
        flash: req.query.msg || null,
        error: req.query.err || null
      });
    });
  }

  app.get('/payment-validity', requireAuth, canView, async (req, res) => {
    try {
      await renderPage(req, res);
    } catch (e) {
      console.error('PAYMENT VALIDITY PAGE:', e.message);
      res.status(500).render('error', {
        title: 'Payment validity',
        message: e.message || 'Could not load rules.',
        status: 500
      });
    }
  });

  app.get('/settings/payment-validity', requireAuth, canView, async (req, res) => {
    try {
      await renderPage(req, res);
    } catch (e) {
      console.error('PAYMENT VALIDITY PAGE (alias):', e.message);
      res.status(500).render('error', {
        title: 'Payment validity',
        message: e.message || 'Could not load rules.',
        status: 500
      });
    }
  });

  app.post('/payment-validity/update', requireAuth, canEdit, async (req, res) => {
    try {
      await paymentValidity.updatePaymentValidityRule(pool, req.body);
      res.redirect('/payment-validity?msg=' + encodeURIComponent('Rule saved.'));
    } catch (e) {
      console.error('PAYMENT VALIDITY SAVE:', e.message);
      res.redirect('/payment-validity?err=' + encodeURIComponent(e.message || 'Save failed.'));
    }
  });

  app.post('/payment-validity/sync', requireAuth, canEdit, async (req, res) => {
    try {
      await paymentValidity.seedMissingPaymentValidityRules(pool, req.session.facilityId || 1);
      res.redirect('/payment-validity?msg=' + encodeURIComponent('Catalog kinds synced (new rows only).'));
    } catch (e) {
      console.error('PAYMENT VALIDITY SYNC:', e.message);
      res.redirect('/payment-validity?err=' + encodeURIComponent(e.message || 'Sync failed.'));
    }
  });
};
