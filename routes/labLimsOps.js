'use strict';

const ops = require('../lib/labLimsOps');

function labOdooLocals(extra) {
  return Object.assign({ laboratoryOdooApp: true }, extra || {});
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = function labLimsOpsRoutes(app, pool, requireAuth, requirePerm) {
  const labRead = requirePerm('lab.read', 'lab.write', 'clinical.read', 'clinical.write', 'nursing.read');
  const labWrite = requirePerm('lab.write', 'clinical.write');

  function facilityId(req) {
    return Math.max(1, parseInt(String(req.session.facilityId || 1), 10) || 1);
  }

  function userId(req) {
    return req.session.userId || req.session.user?.id || null;
  }

  app.get('/lims/ops/investigation', requireAuth, labRead, async (req, res) => {
    try {
      const date = String(req.query.date || todayIso()).slice(0, 10);
      const q = String(req.query.q || '').trim();
      const rows = await ops.listInvestigationOrders(pool, { date, q });
      res.render('lims-ops-investigation', labOdooLocals({
        title: 'Investigation order status',
        date,
        q,
        rows,
        flash: req.query.msg || null,
        error: req.query.err || null,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/lims/ops/status', requireAuth, labRead, async (req, res) => {
    try {
      const date = String(req.query.date || todayIso()).slice(0, 10);
      const status = String(req.query.status || 'all');
      const rows = await ops.listStatusOrders(pool, { date, status });
      res.render('lims-ops-status', labOdooLocals({
        title: 'Order status board',
        date,
        status,
        rows,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/lims/ops/priority', requireAuth, labRead, async (req, res) => {
    try {
      const emergencyOnly = req.query.all !== '1';
      const rows = await ops.listPriorityQueue(pool, { emergency: emergencyOnly });
      res.render('lims-ops-priority', labOdooLocals({
        title: 'Emergency priority queue',
        rows,
        emergencyOnly,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/lims/ops/dispatch', requireAuth, labRead, async (req, res) => {
    try {
      const pendingOnly = req.query.all !== '1';
      const rows = await ops.listDispatchQueue(pool, { pending: pendingOnly });
      res.render('lims-ops-dispatch', labOdooLocals({
        title: 'Dispatch management',
        rows,
        pendingOnly,
        flash: req.query.msg || null,
        error: req.query.err || null,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/lims/ops/dispatch/:id', requireAuth, labWrite, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const channel = String(req.body.channel || 'print').trim();
    const recipient = String(req.body.recipient || '').trim();
    const result = await ops.dispatchResult(pool, id, channel, userId(req), recipient);
    const qs = result.ok ? 'msg=Dispatched' : 'err=' + encodeURIComponent(result.error || 'Failed');
    res.redirect('/lims/ops/dispatch?' + qs);
  });

  app.post('/lims/ops/verify/:id', requireAuth, labWrite, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const back = String(req.body.returnTo || '/lims/ops/dispatch');
    const result = await ops.verifyResult(pool, id, userId(req));
    const qs = result.ok ? 'msg=Verified' : 'err=' + encodeURIComponent(result.error || 'Failed');
    res.redirect(back + (back.includes('?') ? '&' : '?') + qs);
  });

  app.post('/lims/ops/approve/:id', requireAuth, labWrite, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const back = String(req.body.returnTo || '/lims/ops/dispatch');
    const result = await ops.approveResult(pool, id, userId(req));
    const qs = result.ok ? 'msg=Approved' : 'err=' + encodeURIComponent(result.error || 'Failed');
    res.redirect(back + (back.includes('?') ? '&' : '?') + qs);
  });

  app.post('/lims/ops/print/:id', requireAuth, labWrite, async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const back = String(req.body.returnTo || '/lims/ops/dispatch');
    await ops.markPrinted(pool, id);
    res.redirect(back + (back.includes('?') ? '&' : '?') + 'msg=Marked+printed');
  });

  app.get('/lims/ops/dept-matrix', requireAuth, labRead, async (req, res) => {
    try {
      const date = String(req.query.date || todayIso()).slice(0, 10);
      const data = await ops.departmentMatrix(pool, date);
      res.render('lims-ops-dept-matrix', labOdooLocals({
        title: 'Department matrix',
        date,
        departments: data.departments,
        rows: data.rows,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/lims/ops/test-status', requireAuth, labRead, async (req, res) => {
    try {
      const date = String(req.query.date || todayIso()).slice(0, 10);
      const rows = await ops.testWiseStatus(pool, date);
      if (req.query.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="lab-test-status-${date}.csv"`);
        return res.send(ops.exportTestWiseCsv(rows));
      }
      res.render('lims-ops-test-status', labOdooLocals({
        title: 'Test-wise status',
        date,
        rows,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/lims/ops/referrers', requireAuth, labRead, async (req, res) => {
    try {
      const [referrers, providers] = await Promise.all([
        ops.listReferrers(pool),
        ops.listCreditProviders(pool),
      ]);
      res.render('lims-ops-referrers', labOdooLocals({
        title: 'Referrers & B2B providers',
        referrers,
        providers,
        flash: req.query.msg || null,
        error: req.query.err || null,
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/lims/ops/referrers', requireAuth, labWrite, async (req, res) => {
    const result = await ops.upsertReferrer(pool, req.body, facilityId(req));
    const qs = result.ok ? 'msg=Referrer+saved' : 'err=' + encodeURIComponent(result.error || 'Failed');
    res.redirect('/lims/ops/referrers?' + qs);
  });

  app.post('/lims/ops/credit-providers', requireAuth, labWrite, async (req, res) => {
    const result = await ops.upsertCreditProvider(pool, req.body, facilityId(req));
    const qs = result.ok ? 'msg=Provider+saved' : 'err=' + encodeURIComponent(result.error || 'Failed');
    res.redirect('/lims/ops/referrers?' + qs);
  });

  app.get('/lims/ops/walk-in', requireAuth, labWrite, async (req, res) => {
    try {
      await require('../lib/ensureLabWalkinSchema')(pool);
      await require('../lib/ensureLabLimsPhaseSchema')(pool);
      await require('../lib/hmsCountryProfileService').ensureLoaded(pool).catch(() => {});
      const { listPendingWalkins, listLaboratoryServiceCatalog } = require('../lib/labWalkinCashier');
      const catalog = await listLaboratoryServiceCatalog(pool);
      const fid = facilityId(req);
      const [referrers, providers, pendingWalkins] = await Promise.all([
        ops.listReferrers(pool),
        ops.listCreditProviders(pool, { facilityId: fid }),
        listPendingWalkins(pool),
      ]);
      res.render('lims-ops-walk-in', labOdooLocals({
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

  app.post('/lims/ops/walk-in', requireAuth, labWrite, async (req, res) => {
    try {
      await require('../lib/ensureLabWalkinSchema')(pool);
      const result = await ops.walkInRegister(pool, req.body, userId(req), facilityId(req));
      if (!result.ok) {
        return res.redirect('/lims/ops/walk-in?err=' + encodeURIComponent(result.error || 'Registration failed'));
      }
      const { redirectAfterWalkinRegister } = require('../lib/walkinRegisterRedirect');
      const dest = redirectAfterWalkinRegister(res, result, '/lims/ops/walk-in');
      return res.redirect(dest || '/lims/ops/walk-in');
    } catch (e) {
      return res.redirect('/lims/ops/walk-in?err=' + encodeURIComponent(e.message || 'Registration failed'));
    }
  });

  app.get('/lims/ops/mis', requireAuth, labRead, async (req, res) => {
    try {
      const date = String(req.query.date || todayIso()).slice(0, 10);
      const stats = await ops.misHubStats(pool, date);
      const testRows = await ops.testWiseStatus(pool, date);
      res.render('lims-ops-mis', labOdooLocals({
        title: 'Laboratory MIS',
        date,
        stats,
        testRows: (testRows || []).slice(0, 15),
      }));
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });
};
