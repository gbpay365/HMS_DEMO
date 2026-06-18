'use strict';

const hmsBrand = require('../lib/hmsBrand');
const ensureAssetManagementSchema = require('../lib/ensureAssetManagementSchema');
const { insertAssetAudit, loadAssetAudit } = require('../lib/assetAudit');
const {
  ASSET_TYPES,
  ASSET_STATUSES,
  loadCategories,
  loadAssetList,
  loadAssetDetail,
  loadAssetStats,
  createAsset,
  updateAsset,
  loadEmployees,
} = require('../lib/assetRegistry');
const {
  MAINT_TYPES,
  MAINT_STATUSES,
  loadMaintenanceList,
  createMaintenance,
  completeMaintenance,
} = require('../lib/assetMaintenance');
const {
  UNIT_STATUSES,
  CONTRACT_STATUSES,
  loadRentalUnits,
  loadRentalContracts,
  loadContractPayments,
  createRentalUnit,
  createRentalContract,
  recordRentalPayment,
  endRentalContract,
} = require('../lib/assetRental');

module.exports = function registerAssetManagement(app, pool, requireAuth, requirePerm) {
  const assetRead = requirePerm('assets.read', 'assets.write');
  const assetWrite = requirePerm('assets.write');

  function facilityId(req) {
    return Math.max(1, parseInt(req.session.facilityId, 10) || 1);
  }

  function sessionUid(req) {
    return parseInt(req.session.userId || req.session.user?.id, 10) || 0;
  }

  function userCanWrite(res) {
    const p = res.locals.userPerms || [];
    return p.includes('*') || p.includes('assets.write');
  }

  function redirectWithMsg(res, url, msg, err) {
    const q = err ? `err=${encodeURIComponent(err)}` : `msg=${encodeURIComponent(msg || '')}`;
    return res.redirect(`${url}?${q}`);
  }

  function statusBadge(status) {
    const s = String(status || '').toLowerCase();
    const map = {
      active: 'success',
      maintenance: 'warning',
      retired: 'secondary',
      disposed: 'dark',
      scheduled: 'info',
      in_progress: 'primary',
      completed: 'success',
      cancelled: 'secondary',
      overdue: 'danger',
      available: 'success',
      occupied: 'primary',
      inactive: 'secondary',
      ended: 'secondary',
    };
    return map[s] || 'light';
  }

  app.get('/assets', requireAuth, assetRead, async (req, res) => {
    try {
      await ensureAssetManagementSchema(pool).catch(() => {});
      const fid = facilityId(req);
      const stats = await loadAssetStats(pool, fid);
      const recentAssets = await loadAssetList(pool, fid, {});
      res.render('assets-hub', {
        title: hmsBrand.pageTitle('Asset Management'),
        stats,
        recentAssets: (recentAssets || []).slice(0, 8),
        canWrite: userCanWrite(res),
        flash: req.query.msg || null,
        error: req.query.err || null,
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/assets/registry', requireAuth, assetRead, async (req, res) => {
    try {
      await ensureAssetManagementSchema(pool).catch(() => {});
      const fid = facilityId(req);
      const rows = await loadAssetList(pool, fid, {
        q: req.query.q,
        status: req.query.status,
        categoryId: req.query.category,
      });
      const categories = await loadCategories(pool, fid);
      res.render('assets-registry', {
        title: hmsBrand.pageTitle('Asset registry'),
        rows,
        categories,
        assetTypes: ASSET_TYPES,
        assetStatuses: ASSET_STATUSES,
        filters: {
          q: req.query.q || '',
          status: req.query.status || '',
          category: req.query.category || '',
        },
        canWrite: userCanWrite(res),
        statusBadge,
        flash: req.query.msg || null,
        error: req.query.err || null,
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/assets/registry/new', requireAuth, assetWrite, async (req, res) => {
    try {
      await ensureAssetManagementSchema(pool).catch(() => {});
      const fid = facilityId(req);
      res.render('assets-registry-form', {
        title: hmsBrand.pageTitle('Register asset'),
        asset: null,
        categories: await loadCategories(pool, fid),
        employees: await loadEmployees(pool),
        assetTypes: ASSET_TYPES,
        assetStatuses: ASSET_STATUSES,
        flash: null,
        error: req.query.err || null,
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/assets/registry/:id', requireAuth, assetRead, async (req, res) => {
    try {
      await ensureAssetManagementSchema(pool).catch(() => {});
      const fid = facilityId(req);
      const assetId = parseInt(req.params.id, 10) || 0;
      const asset = await loadAssetDetail(pool, fid, assetId);
      if (!asset) return res.status(404).render('error', { title: 'Not found', message: 'Asset not found.', status: 404 });
      const maintenance = await loadMaintenanceList(pool, fid, { assetId });
      const audit = await loadAssetAudit(pool, assetId);
      res.render('assets-detail', {
        title: hmsBrand.pageTitle(asset.asset_tag),
        asset,
        maintenance,
        audit,
        maintTypes: MAINT_TYPES,
        maintStatuses: MAINT_STATUSES,
        canWrite: userCanWrite(res),
        statusBadge,
        flash: req.query.msg || null,
        error: req.query.err || null,
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.get('/assets/registry/:id/edit', requireAuth, assetWrite, async (req, res) => {
    try {
      await ensureAssetManagementSchema(pool).catch(() => {});
      const fid = facilityId(req);
      const assetId = parseInt(req.params.id, 10) || 0;
      const asset = await loadAssetDetail(pool, fid, assetId);
      if (!asset) return res.status(404).render('error', { title: 'Not found', message: 'Asset not found.', status: 404 });
      res.render('assets-registry-form', {
        title: hmsBrand.pageTitle('Edit asset'),
        asset,
        categories: await loadCategories(pool, fid),
        employees: await loadEmployees(pool),
        assetTypes: ASSET_TYPES,
        assetStatuses: ASSET_STATUSES,
        flash: null,
        error: req.query.err || null,
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/assets/registry', requireAuth, assetWrite, async (req, res) => {
    try {
      const fid = facilityId(req);
      const uid = sessionUid(req);
      const created = await createAsset(pool, fid, req.body, uid);
      await insertAssetAudit(pool, {
        asset_id: created.id,
        facility_id: fid,
        action: 'create',
        to_status: 'active',
        note: `Registered ${created.asset_tag}`,
        performed_by: uid,
      });
      return redirectWithMsg(res, `/assets/registry/${created.id}`, 'Asset registered.');
    } catch (e) {
      return redirectWithMsg(res, '/assets/registry/new', null, e.message);
    }
  });

  app.post('/assets/registry/:id', requireAuth, assetWrite, async (req, res) => {
    try {
      const fid = facilityId(req);
      const uid = sessionUid(req);
      const assetId = parseInt(req.params.id, 10) || 0;
      const change = await updateAsset(pool, fid, assetId, req.body, uid);
      await insertAssetAudit(pool, {
        asset_id: assetId,
        facility_id: fid,
        action: 'update',
        from_status: change.from_status,
        to_status: change.to_status,
        performed_by: uid,
      });
      return redirectWithMsg(res, `/assets/registry/${assetId}`, 'Asset updated.');
    } catch (e) {
      return redirectWithMsg(res, `/assets/registry/${req.params.id}/edit`, null, e.message);
    }
  });

  app.get('/assets/maintenance', requireAuth, assetRead, async (req, res) => {
    try {
      await ensureAssetManagementSchema(pool).catch(() => {});
      const fid = facilityId(req);
      const rows = await loadMaintenanceList(pool, fid, {
        status: req.query.status,
        assetId: req.query.asset,
      });
      const assets = await loadAssetList(pool, fid, {});
      res.render('assets-maintenance', {
        title: hmsBrand.pageTitle('Maintenance log'),
        rows,
        assets,
        maintTypes: MAINT_TYPES,
        maintStatuses: MAINT_STATUSES,
        filters: { status: req.query.status || '', asset: req.query.asset || '' },
        canWrite: userCanWrite(res),
        statusBadge,
        flash: req.query.msg || null,
        error: req.query.err || null,
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/assets/maintenance', requireAuth, assetWrite, async (req, res) => {
    try {
      const fid = facilityId(req);
      const uid = sessionUid(req);
      const assetId = parseInt(req.body.asset_id, 10) || 0;
      await createMaintenance(pool, fid, req.body, uid);
      const dest = assetId > 0 ? `/assets/registry/${assetId}` : '/assets/maintenance';
      return redirectWithMsg(res, dest, 'Maintenance record saved.');
    } catch (e) {
      const assetId = parseInt(req.body.asset_id, 10) || 0;
      const dest = assetId > 0 ? `/assets/registry/${assetId}` : '/assets/maintenance';
      return redirectWithMsg(res, dest, null, e.message);
    }
  });

  app.post('/assets/maintenance/:id/complete', requireAuth, assetWrite, async (req, res) => {
    try {
      const fid = facilityId(req);
      const uid = sessionUid(req);
      const maintId = parseInt(req.params.id, 10) || 0;
      await completeMaintenance(pool, fid, maintId, uid, req.body);
      return redirectWithMsg(res, req.body.return_to || '/assets/maintenance', 'Maintenance marked complete.');
    } catch (e) {
      return redirectWithMsg(res, req.body.return_to || '/assets/maintenance', null, e.message);
    }
  });

  app.get('/assets/rentals', requireAuth, assetRead, async (req, res) => {
    try {
      await ensureAssetManagementSchema(pool).catch(() => {});
      const fid = facilityId(req);
      const units = await loadRentalUnits(pool, fid);
      const contracts = await loadRentalContracts(pool, fid, { status: req.query.status || '' });
      const assets = await loadAssetList(pool, fid, {});
      let payments = [];
      const contractId = parseInt(req.query.contract, 10) || 0;
      if (contractId > 0) payments = await loadContractPayments(pool, contractId, fid);
      res.render('assets-rentals', {
        title: hmsBrand.pageTitle('Rentals'),
        units,
        contracts,
        payments,
        assets,
        unitStatuses: UNIT_STATUSES,
        contractStatuses: CONTRACT_STATUSES,
        selectedContractId: contractId,
        filters: { status: req.query.status || '' },
        canWrite: userCanWrite(res),
        statusBadge,
        flash: req.query.msg || null,
        error: req.query.err || null,
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  });

  app.post('/assets/rentals/units', requireAuth, assetWrite, async (req, res) => {
    try {
      const fid = facilityId(req);
      const uid = sessionUid(req);
      const created = await createRentalUnit(pool, fid, req.body, uid);
      return redirectWithMsg(res, '/assets/rentals', `Rental unit ${created.unit_code} created.`);
    } catch (e) {
      return redirectWithMsg(res, '/assets/rentals', null, e.message);
    }
  });

  app.post('/assets/rentals/contracts', requireAuth, assetWrite, async (req, res) => {
    try {
      const fid = facilityId(req);
      const uid = sessionUid(req);
      const contractId = await createRentalContract(pool, fid, req.body, uid);
      return redirectWithMsg(res, `/assets/rentals?contract=${contractId}`, 'Rental contract created.');
    } catch (e) {
      return redirectWithMsg(res, '/assets/rentals', null, e.message);
    }
  });

  app.post('/assets/rentals/payments', requireAuth, assetWrite, async (req, res) => {
    try {
      const fid = facilityId(req);
      const uid = sessionUid(req);
      const contractId = parseInt(req.body.contract_id, 10) || 0;
      await recordRentalPayment(pool, fid, req.body, uid);
      return redirectWithMsg(res, `/assets/rentals?contract=${contractId}`, 'Payment recorded.');
    } catch (e) {
      const contractId = parseInt(req.body.contract_id, 10) || 0;
      return redirectWithMsg(res, `/assets/rentals?contract=${contractId}`, null, e.message);
    }
  });

  app.post('/assets/rentals/contracts/:id/end', requireAuth, assetWrite, async (req, res) => {
    try {
      const fid = facilityId(req);
      const uid = sessionUid(req);
      const contractId = parseInt(req.params.id, 10) || 0;
      await endRentalContract(pool, fid, contractId, uid);
      return redirectWithMsg(res, '/assets/rentals', 'Contract ended.');
    } catch (e) {
      return redirectWithMsg(res, '/assets/rentals', null, e.message);
    }
  });
};
