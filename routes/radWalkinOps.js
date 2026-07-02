'use strict';

const ops = require('../lib/labLimsOps');

function radOdooLocals(extra) {
  return Object.assign({ radiologyOdooApp: true }, extra || {});
}

module.exports = function radWalkinOpsRoutes(app, pool, requireAuth, requirePerm) {
  const radWrite = requirePerm('radiology.write', 'clinical.write');

  function userId(req) {
    return req.session.userId || req.session.user?.id || null;
  }

  function facilityId(req) {
    return Math.max(1, parseInt(String(req.session.facilityId || 1), 10) || 1);
  }

  app.get('/radiology/ops/walk-in', requireAuth, radWrite, async (req, res) => {
    try {
      await require('../lib/ensureRadWalkinSchema')(pool);
      await require('../lib/ensureLabLimsPhaseSchema')(pool);
      await require('../lib/hmsCountryProfileService').ensureLoaded(pool).catch(() => {});
      const { listPendingWalkins, listRadiologyServiceCatalog } = require('../lib/radWalkinCashier');
      const catalog = await listRadiologyServiceCatalog(pool);
      const fid = facilityId(req);
      const [referrers, providers, pendingWalkins] = await Promise.all([
        ops.listReferrers(pool),
        ops.listCreditProviders(pool, { facilityId: fid }),
        listPendingWalkins(pool),
      ]);
      res.render('rad-ops-walk-in', radOdooLocals({
        title: 'Walk-in registration',
        catalog: catalog || [],
        referrers,
        providers,
        pendingWalkins,
        flash: req.query.msg || null,
        error: req.query.err || null,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/radiology/ops/walk-in', requireAuth, radWrite, async (req, res) => {
    try {
      await require('../lib/ensureRadWalkinSchema')(pool);
      const { registerWalkin } = require('../lib/radWalkinCashier');
      const result = await registerWalkin(pool, req.body, userId(req), facilityId(req));
      if (!result.ok) {
        return res.redirect('/radiology/ops/walk-in?err=' + encodeURIComponent(result.error || 'Registration failed'));
      }
      const { redirectAfterWalkinRegister } = require('../lib/walkinRegisterRedirect');
      const dest = redirectAfterWalkinRegister(res, result, '/radiology/ops/walk-in');
      return res.redirect(dest || '/radiology/ops/walk-in');
    } catch (e) {
      return res.redirect('/radiology/ops/walk-in?err=' + encodeURIComponent(e.message || 'Registration failed'));
    }
  });
};
