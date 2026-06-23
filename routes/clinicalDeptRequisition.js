// Laboratory & radiology supply requisitions → procurement purchase requests
const ensureClinicalDeptRequisitionSchema = require('../lib/ensureClinicalDeptRequisitionSchema');
const { ensureProcurementExtendedSchema } = require('../lib/ensureProcurementExtendedSchema');
const {
  ITEM_TYPES,
  departmentLabel,
  nextReqNumber,
  buildItemOptions,
  loadInventoryForDepartment,
  loadRequisitionsForUser,
  parseLinesFromBody,
  createProcurementPrFromRequisition,
} = require('../lib/clinicalDeptRequisitionProcurement');
const { PROCUREMENT_UNITS } = require('../lib/procurementUnits');

function userId(req) {
  return parseInt(req.session.userId || req.session.user?.id, 10) || 0;
}

function fid(req) {
  return req.session && req.session.facilityId ? Number(req.session.facilityId) : 1;
}

function deptConfig(department) {
  const dept = String(department || '').toLowerCase();
  if (dept === 'radiology') {
    return {
      department: 'radiology',
      readPerm: 'radiology.read',
      writePerm: 'radiology.write',
      basePath: '/radiology/supply-requests',
      reactPage: 'clinical-dept-supply-requests',
      view: 'radiology-supply-requests',
      odooMenu: 'supply_requests',
      odooTitle: 'Radiology — Procurement requests',
      laboratoryOdooApp: false,
      radiologyOdooApp: true,
      heroIcon: 'radiology',
      portalHref: '/portal/hub/radiology',
    };
  }
  return {
    department: 'laboratory',
    readPerm: 'lab.read',
    writePerm: 'lab.write',
    basePath: '/laboratory/supply-requests',
    reactPage: 'clinical-dept-supply-requests',
    view: 'laboratory-supply-requests',
    odooMenu: 'supply_requests',
    odooTitle: 'Laboratory — Procurement requests',
    laboratoryOdooApp: true,
    radiologyOdooApp: false,
    heroIcon: 'laboratory',
    portalHref: '/portal/hub/laboratory',
  };
}

function renderPage(res, cfg, pageData, extraLocals) {
  res.render(cfg.view, {
    title: cfg.odooTitle,
    ...extraLocals,
    laboratoryOdooApp: cfg.laboratoryOdooApp,
    radiologyOdooApp: cfg.radiologyOdooApp,
    labOdooMenu: cfg.laboratoryOdooApp ? cfg.odooMenu : undefined,
    labOdooTitle: cfg.laboratoryOdooApp ? cfg.odooTitle : undefined,
    radOdooMenu: cfg.radiologyOdooApp ? cfg.odooMenu : undefined,
    radOdooTitle: cfg.radiologyOdooApp ? cfg.odooTitle : undefined,
    pageData,
    flash: pageData.flash || null,
    error: pageData.error || null,
  });
}

module.exports = function (app, pool, requireAuth, requirePerm) {
  async function handleGet(req, res, department) {
    const cfg = deptConfig(department);
    try {
      await ensureClinicalDeptRequisitionSchema(pool);
      await ensureProcurementExtendedSchema(pool);
      const uid = userId(req);
      const requests = await loadRequisitionsForUser(pool, fid(req), cfg.department, uid);
      const inventoryItems = await loadInventoryForDepartment(pool, cfg.department);
      const itemOptionsByType = buildItemOptions(cfg.department, inventoryItems);
      renderPage(res, cfg, {
        department: cfg.department,
        departmentLabel: departmentLabel(cfg.department),
        basePath: cfg.basePath,
        requests,
        inventoryItems,
        itemOptionsByType,
        itemTypes: ITEM_TYPES,
        units: PROCUREMENT_UNITS,
        flash: req.query.msg || null,
        error: req.query.err || null,
      });
    } catch (e) {
      res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
    }
  }

  async function handlePost(req, res, department) {
    const cfg = deptConfig(department);
    try {
      await ensureClinicalDeptRequisitionSchema(pool);
      await ensureProcurementExtendedSchema(pool);
      const uid = userId(req);
      if (uid < 1) return res.redirect(`${cfg.basePath}?err=` + encodeURIComponent('Not signed in.'));

      const notes = String(req.body.notes || '').trim().slice(0, 2000) || null;
      let neededBy = String(req.body.needed_by || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) neededBy = null;

      const lines = parseLinesFromBody(req.body);
      if (!lines.length) {
        return res.redirect(
          `${cfg.basePath}?err=` +
            encodeURIComponent('Add at least one line with a description or inventory item.')
        );
      }

      const facilityId = fid(req);
      const reqNumber = await nextReqNumber(pool, facilityId, cfg.department);
      const [ins] = await pool.query(
        `INSERT INTO tbl_clinical_dept_requisition
           (facility_id, department, req_number, requested_by, status, notes, needed_by)
         VALUES (?, ?, ?, ?, 'submitted', ?, ?)`,
        [facilityId, cfg.department, reqNumber, uid, notes, neededBy]
      );
      const reqId = ins.insertId;

      for (const ln of lines) {
        await pool.query(
          `INSERT INTO tbl_clinical_dept_requisition_line
            (requisition_id, item_type, description, quantity, uom, inventory_item_id, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [reqId, ln.item_type, ln.description, ln.quantity, ln.uom, ln.inventory_item_id, ln.remarks]
        );
      }

      const { prId, prNumber } = await createProcurementPrFromRequisition(pool, {
        facilityId,
        userId: uid,
        department: cfg.department,
        reqId,
        reqNumber,
        notes,
        neededBy,
        lines,
      });

      const msg = `Request ${reqNumber} sent to Procurement (PR ${prNumber}). Track status below or in Procurement → Purchase requests.`;
      res.redirect(`${cfg.basePath}?msg=` + encodeURIComponent(msg));
    } catch (e) {
      res.redirect(`${cfg.basePath}?err=` + encodeURIComponent(e.message || 'Submit failed.'));
    }
  }

  app.get(
    '/laboratory/supply-requests',
    requireAuth,
    requirePerm('lab.read', 'lab.write'),
    (req, res) => handleGet(req, res, 'laboratory')
  );
  app.post(
    '/laboratory/supply-requests',
    requireAuth,
    requirePerm('lab.write'),
    (req, res) => handlePost(req, res, 'laboratory')
  );

  app.get(
    '/radiology/supply-requests',
    requireAuth,
    requirePerm('radiology.read', 'radiology.write'),
    (req, res) => handleGet(req, res, 'radiology')
  );
  app.post(
    '/radiology/supply-requests',
    requireAuth,
    requirePerm('radiology.write'),
    (req, res) => handlePost(req, res, 'radiology')
  );
};
