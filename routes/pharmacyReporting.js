'use strict';

/**
 * Pharmacy Intelligence Reports — hub, period reports, print, export.
 */
const ensurePharmacySchema = require('../lib/ensurePharmacySchema');
const { listExpiryReport } = require('../lib/pharmacyExpiry');
const {
  REPORT_CATEGORIES,
  PHARMACY_REPORT_CATALOG,
  getReportMeta,
  runPharmacyReport,
  detectTypeFilterColumn,
  buildTypeFilterOptions,
  applyRowTypeFilter,
} = require('../lib/pharmacyReports');
const {
  PERIOD_OPTIONS,
  PERIOD_PRESET_OPTIONS,
  buildReportQueryString,
  resolvePharmacyReportRange,
} = require('../lib/pharmacyReportsPeriod');
const {
  buildReportCsv,
  buildReportXlsxBuffer,
  buildBulkCsv,
  buildBulkXlsxBuffer,
  exportFilename,
  bulkExportFilename,
} = require('../lib/pharmacyReportExport');

module.exports = function registerPharmacyReporting(app, pool, requireAuth, requirePerm) {
  const phaRead = requirePerm('pharmacy.read', 'pharmacy.write');

  function facilityId(req) {
    return Math.max(1, parseInt(req.session.facilityId, 10) || 1);
  }

  async function nursingBadge() {
    try {
      const [[r]] = await pool.query(
        "SELECT COUNT(*) AS c FROM tbl_nursing_supply_request WHERE status IN ('pending','preparing')"
      );
      return parseInt(r && r.c, 10) || 0;
    } catch (_) {
      return 0;
    }
  }

  function catalogForCategory(categoryKey) {
    const cat = String(categoryKey || 'all').toLowerCase();
    if (!cat || cat === 'all') return PHARMACY_REPORT_CATALOG;
    return PHARMACY_REPORT_CATALOG.filter((r) => r.category === cat);
  }

  async function loadReportBundle(req, reportId) {
    await ensurePharmacySchema(pool);
    const meta = getReportMeta(reportId);
    if (!meta) return null;
    const range = resolvePharmacyReportRange(req.query);
    const fid = facilityId(req);
    const raw = await runPharmacyReport(pool, reportId, req.query, fid);
    if (!raw) return null;
    const typeColumn = detectTypeFilterColumn(raw.columns);
    const rowtype = String(req.query.rowtype || 'all').trim();
    const typeOptions = buildTypeFilterOptions(raw.rows, typeColumn);
    const reportData = applyRowTypeFilter(raw, rowtype, typeColumn);
    return { meta, range, reportData, typeColumn, typeOptions, rowtype };
  }

  function buildExportUrls(reportId, range, extra = {}) {
    const qs = buildReportQueryString(range, extra);
    const base = reportId ? `/pharmacy/reporting/${reportId}` : '/pharmacy/reporting';
    return {
      pdf: reportId ? `${base}/print?${qs}` : `/pharmacy/reporting/print?${qs}`,
      csv: reportId ? `${base}/export/csv?${qs}` : `/pharmacy/reporting/export/csv?${qs}`,
      xlsx: reportId ? `${base}/export/xlsx?${qs}` : `/pharmacy/reporting/export/xlsx?${qs}`,
    };
  }

  async function renderPharmacyReport(req, res, reportId, printMode) {
    const bundle = await loadReportBundle(req, reportId);
    if (!bundle) {
      return res.redirect('/pharmacy/reporting?err=' + encodeURIComponent('Report not found.'));
    }
    const { meta, range, reportData, typeColumn, typeOptions, rowtype } = bundle;
    const extra = { rowtype };
    let reportQueryString = buildReportQueryString(range, extra);
    if (reportId === 'expiry' && reportData.expiryDays) {
      reportQueryString += `&days=${encodeURIComponent(String(reportData.expiryDays))}`;
    }
    const payload = {
      title: meta.title,
      pharmacyOdooApp: !printMode,
      phaOdooMenu: 'reporting',
      phaOdooSub: reportId,
      phaOdooTitle: meta.title,
      nursingSupplyPending: await nursingBadge(),
      reportMeta: meta,
      reportRange: range,
      reportData,
      periodOptions: PERIOD_OPTIONS,
      periodPresetOptions: PERIOD_PRESET_OPTIONS,
      reportQueryString,
      exportUrls: buildExportUrls(reportId, range, extra),
      typeColumn,
      typeOptions,
      rowtype,
      expiryDays: reportData.expiryDays,
      generatedAt: new Date().toLocaleString(),
      autoPrint: req.query.auto === '1',
      flash: req.query.msg || null,
      error: req.query.err || null,
    };
    if (printMode) {
      return res.render('pharmacy-report-print', payload);
    }
    return res.render('pharmacy-report-view', payload);
  }

  async function exportHubReports(req, res, format) {
    await ensurePharmacySchema(pool);
    const range = resolvePharmacyReportRange(req.query);
    const category = String(req.query.category || 'all').toLowerCase();
    const catalog = catalogForCategory(category);
    const fid = facilityId(req);
    const reports = [];
    for (const meta of catalog) {
      const raw = await runPharmacyReport(pool, meta.id, req.query, fid);
      if (!raw) continue;
      reports.push({ meta, range, data: { ...raw, range } });
    }
    if (!reports.length) {
      return res.status(404).send('No report data for export.');
    }
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${bulkExportFilename('csv', range)}"`);
      return res.send(buildBulkCsv(reports));
    }
    if (format === 'xlsx') {
      const buf = buildBulkXlsxBuffer(reports);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${bulkExportFilename('xlsx', range)}"`);
      return res.send(buf);
    }
    return res.status(400).send('Unsupported format.');
  }

  async function exportSingleReport(req, res, reportId, format) {
    const bundle = await loadReportBundle(req, reportId);
    if (!bundle) {
      return res.status(404).send('Report not found.');
    }
    const { meta, range, reportData } = bundle;
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(reportId, 'csv', range)}"`);
      return res.send(buildReportCsv(meta, range, reportData));
    }
    if (format === 'xlsx') {
      const buf = buildReportXlsxBuffer(meta, range, reportData);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(reportId, 'xlsx', range)}"`);
      return res.send(buf);
    }
    return res.status(400).send('Unsupported format.');
  }

  app.get('/pharmacy/reporting', requireAuth, phaRead, async (req, res) => {
    const q = { ...req.query };
    if (!q.preset && !q.period && !q.date && !q.week && !q.month && !q.quarter && !q.year) {
      q.preset = 'last30';
    }
    const range = resolvePharmacyReportRange(q);
    const category = String(q.category || 'all').toLowerCase();
    const preset = String(q.preset || '').toLowerCase();
    const exportUrls = buildExportUrls(null, range, { category });
    res.render('pharmacy-reporting-hub', {
      title: 'Pharmacy Intelligence Reports',
      pharmacyOdooApp: true,
      phaOdooMenu: 'reporting',
      phaOdooSub: reportId,
      phaOdooTitle: 'Intelligence Reports',
      nursingSupplyPending: await nursingBadge(),
      catalog: PHARMACY_REPORT_CATALOG,
      categories: REPORT_CATEGORIES,
      periodPresetOptions: PERIOD_PRESET_OPTIONS,
      activeCategory: category,
      activePreset: preset,
      reportRange: range,
      exportUrls: buildExportUrls(null, range, { category }),
      flash: req.query.msg || null,
      error: req.query.err || null,
    });
  });

  app.get('/pharmacy/reporting/export/csv', requireAuth, phaRead, (req, res) => exportHubReports(req, res, 'csv'));
  app.get('/pharmacy/reporting/export/xlsx', requireAuth, phaRead, (req, res) => exportHubReports(req, res, 'xlsx'));

  app.get('/pharmacy/reporting/print', requireAuth, phaRead, async (req, res) => {
    await ensurePharmacySchema(pool);
    const range = resolvePharmacyReportRange(req.query);
    const category = String(req.query.category || 'all').toLowerCase();
    const catalog = catalogForCategory(category);
    const fid = facilityId(req);
    const reportSections = [];
    for (const meta of catalog) {
      const raw = await runPharmacyReport(pool, meta.id, req.query, fid);
      if (!raw || !(raw.rows || []).length) continue;
      reportSections.push({ meta, data: raw });
    }
    return res.render('pharmacy-report-bulk-print', {
      title: 'Pharmacy reports',
      reportRange: range,
      reportSections,
      generatedAt: new Date().toLocaleString(),
    });
  });

  app.get('/pharmacy/reporting/expiry-classic', requireAuth, phaRead, async (req, res) => {
    await ensurePharmacySchema(pool);
    const days = parseInt(req.query.days, 10) || 30;
    const rows = await listExpiryReport(pool, { days });
    res.render('pharmacy-report-expiry', {
      title: 'Medicine expiry report',
      pharmacyOdooApp: true,
      phaOdooMenu: 'reporting',
      phaOdooSub: reportId,
      phaOdooTitle: 'Expiry report',
      nursingSupplyPending: await nursingBadge(),
      days,
      rows,
      flash: req.query.msg || null,
      error: req.query.err || null,
    });
  });

  app.get('/pharmacy/reporting/:reportId/print', requireAuth, phaRead, async (req, res) => {
    return renderPharmacyReport(req, res, String(req.params.reportId || '').trim(), true);
  });

  app.get('/pharmacy/reporting/:reportId/export/csv', requireAuth, phaRead, async (req, res) => {
    return exportSingleReport(req, res, String(req.params.reportId || '').trim(), 'csv');
  });

  app.get('/pharmacy/reporting/:reportId/export/xlsx', requireAuth, phaRead, async (req, res) => {
    return exportSingleReport(req, res, String(req.params.reportId || '').trim(), 'xlsx');
  });

  app.get('/pharmacy/reporting/:reportId', requireAuth, phaRead, async (req, res) => {
    const reportId = String(req.params.reportId || '').trim();
    if (reportId === 'expiry-legacy') {
      return res.redirect('/pharmacy/reporting/expiry');
    }
    return renderPharmacyReport(req, res, reportId, false);
  });
};
