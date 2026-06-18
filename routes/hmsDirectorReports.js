'use strict';

const reportsAccess = require('../lib/hmsDirectorReportsAccess');
const catalog = require('../lib/hmsDirectorReportsCatalog');
const { fetchLiveReports } = require('../lib/hmsDirectorReportsLive');
const {
  resolveReportRange,
  defaultRangeForSection,
} = require('../lib/hmsDirectorReportsPeriod');
const hmsBrand = require('../lib/hmsBrand');
const { resolveFinReportOrg, resolveFinReportEntity, facilityIdFromReq } = require('../lib/hmsFinReportOrg');
const portalRedirect = require('../lib/directorPortalRedirect');

function attachLiveData(sections, live) {
  const details = live.detailsByReport || {};
  return sections.map((s) => ({
    ...s,
    cards: (s.cards || []).map((c) => ({
      ...c,
      live: live.byCard[c.id] || null,
      details: details[c.id] || null,
    })),
    financialRows: (s.financialRows || []).map((r) => ({
      ...r,
      live: live.byFinancialRow[r.id] || null,
      details: details[r.id] || null,
    })),
    financialUnits: (s.financialUnits || []).map((u) => ({
      ...u,
      live: live.byFinancialUnit[u.id] || null,
      details: details[u.id] || null,
    })),
  }));
}

function filterSectionsByScope(sections, scope) {
  if (!scope || scope === 'all') return sections;
  return sections.filter((s) => s.key === scope);
}

function filterSectionsForReport(sections, target) {
  if (!target) return sections;
  return sections
    .filter((s) => s.key === target.sectionKey)
    .map((s) => {
      if (target.kind === 'card') {
        return {
          ...s,
          cards: (s.cards || []).filter((c) => c.id === target.entity.id),
          financialRows: [],
          financialUnits: [],
        };
      }
      if (target.kind === 'row') {
        return {
          ...s,
          cards: [],
          financialRows: (s.financialRows || []).filter((r) => r.id === target.entity.id),
          financialUnits: [],
        };
      }
      return {
        ...s,
        cards: [],
        financialRows: [],
        financialUnits: (s.financialUnits || []).filter((u) => u.id === target.entity.id),
      };
    })
    .filter(
      (s) =>
        (s.cards && s.cards.length) ||
        (s.financialRows && s.financialRows.length) ||
        (s.financialUnits && s.financialUnits.length)
    );
}

function reportCanView(perms, target) {
  const vm = reportsAccess.buildReportsViewModel(perms);
  for (const s of vm.sections) {
    if (s.key !== target.sectionKey) continue;
    if (target.kind === 'card' && (s.cards || []).some((c) => c.id === target.entity.id)) {
      return true;
    }
    if (target.kind === 'row' && (s.financialRows || []).some((r) => r.id === target.entity.id)) {
      return true;
    }
    if (target.kind === 'unit' && (s.financialUnits || []).some((u) => u.id === target.entity.id)) {
      return true;
    }
  }
  return false;
}

function reportDisplayTitle(target) {
  if (!target) return null;
  if (target.kind === 'unit') return target.entity.name;
  return target.entity.title;
}

function buildScopeLabel(printScope, activeTab, periodRange, reportTarget) {
  if (reportTarget && periodRange) {
    const title = reportDisplayTitle(reportTarget);
    const periodName =
      periodRange.period === 'day' ? 'Day' : periodRange.period === 'week' ? 'Week' : 'Month';
    return `${title} — ${periodName}: ${periodRange.label}`;
  }
  const scopeLabels = {
    all: 'Complete management report (all sections)',
    daily: 'Daily operational reports',
    weekly: 'Weekly trend reports',
    monthly: 'Monthly strategic reports',
    financial: 'Financial transactions & unit economics',
  };
  if (printScope === 'tab') return scopeLabels[activeTab] || activeTab;
  return scopeLabels[printScope] || printScope;
}

function buildReportMeta(req, res, pool) {
  const fid = facilityIdFromReq(req, res);
  return Promise.all([
    resolveFinReportOrg(pool, fid),
    resolveFinReportEntity(pool, fid),
  ]).then(([orgName, entityName]) => {
    const user = req.session?.user || {};
    const now = new Date();
    const reportRef =
      'MR-' +
      now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      '-' +
      String(Math.floor(Math.random() * 9000) + 1000);
    return {
      orgName,
      entityName,
      reportRef,
      printDate: now.toLocaleString('en-GB', {
        dateStyle: 'long',
        timeStyle: 'short',
      }),
      preparedBy: user.name || user.emailid || 'Authorised user',
      preparedRole: user.role_title || (user.role ? 'Role ' + user.role : ''),
      brand: hmsBrand,
    };
  });
}

module.exports = function mountHmsDirectorReports(app, pool, requireAuth) {
  function requireReportsAccess(req, res, next) {
    const perms = res.locals.userPerms || [];
    if (!reportsAccess.hasAnyReportAccess(perms)) {
      const msg = 'You do not have access to Management Reports.';
      if ((req.headers.accept || '').includes('application/json') || req.xhr) {
        return res.status(403).json({ ok: false, error: msg });
      }
      return res.redirect('/dashboard?err=' + encodeURIComponent(msg));
    }
    return next();
  }

  async function loadLive(pool, req, liveOpts = {}) {
    const facilityId =
      req.session?.user?.facility_id ||
      req.session?.user?.facilityId ||
      null;
    return fetchLiveReports(pool, {
      facilityId,
      periodRange: liveOpts.periodRange || null,
      reportFilter: liveOpts.reportFilter || null,
    });
  }

  function resolvePrintContext(req) {
    const reportId = String(req.query.report || '').trim();
    const reportType = String(req.query.type || '').trim();
    let reportTarget = null;
    let periodRange = resolveReportRange(req.query);

    if (reportId) {
      reportTarget = catalog.findReportEntity(reportId, reportType);
      if (!reportTarget) return { error: 'Unknown report.' };
      if (!periodRange) {
        const period = String(req.query.period || reportTarget.defaultPeriod || '').trim();
        periodRange = resolveReportRange({
          period,
          date: req.query.date,
          week: req.query.week,
          month: req.query.month,
        });
      }
      if (!periodRange) {
        periodRange = defaultRangeForSection(reportTarget.sectionKey);
      }
    }

    return { reportTarget, periodRange };
  }

  async function buildPageData(req, res, options = {}) {
    const perms = res.locals.userPerms || [];
    const vm = reportsAccess.buildReportsViewModel(perms);
    if (!vm.sections.length) return null;

    const { reportTarget, periodRange, error: ctxError } = resolvePrintContext(req);
    if (ctxError) return { error: ctxError };

    if (reportTarget && !reportCanView(perms, reportTarget)) {
      return { error: 'You do not have permission to print this report.' };
    }

    const tab = String(req.query.tab || '').trim();
    const activeTab =
      vm.sections.some((s) => s.key === tab) ? tab : vm.defaultSection;

    let live = {
      generatedAt: null,
      periodLabel: '',
      byCard: {},
      byFinancialRow: {},
      byFinancialUnit: {},
    };
    const includeDetails = String(req.query.details || '1').trim() !== '0';
    try {
      live = await loadLive(pool, req, {
        periodRange: reportTarget ? periodRange : null,
        reportFilter: reportTarget
          ? {
              kind: reportTarget.kind,
              id: reportTarget.entity.id,
              sectionKey: reportTarget.sectionKey,
            }
          : null,
        includeDetails,
      });
    } catch (err) {
      console.error('management-reports live:', err);
      live.loadError = err.message || 'Failed to load live figures';
    }

    const printScope =
      options.scope || String(req.query.scope || 'all').trim() || 'all';
    let sections = filterSectionsByScope(
      attachLiveData(vm.sections, live),
      printScope === 'tab' ? activeTab : printScope
    );

    if (reportTarget) {
      sections = filterSectionsForReport(sections, reportTarget);
    }

    if (!sections.length) return { error: 'No report content available for this selection.' };

    const meta = await buildReportMeta(req, res, pool);
    const reportTitle = reportTarget ? reportDisplayTitle(reportTarget) : null;

    return {
      vm,
      activeTab: reportTarget ? reportTarget.sectionKey : activeTab,
      sections,
      live,
      meta,
      periodRange: periodRange || live.periodRange || null,
      reportTitle,
      scopeLabel: buildScopeLabel(printScope, activeTab, periodRange, reportTarget),
    };
  }

  app.get(
    '/management-reports/api/live',
    requireAuth,
    requireReportsAccess,
    async (req, res) => {
      try {
        const { reportTarget, periodRange, error: ctxError } = resolvePrintContext(req);
        if (ctxError) return res.status(400).json({ ok: false, error: ctxError });
        const live = await loadLive(pool, req, {
          periodRange: reportTarget ? periodRange : null,
          reportFilter: reportTarget
            ? {
                kind: reportTarget.kind,
                id: reportTarget.entity.id,
                sectionKey: reportTarget.sectionKey,
              }
            : null,
        });
        res.json({ ok: true, ...live });
      } catch (err) {
        console.error('management-reports live API:', err);
        res.status(500).json({ ok: false, error: err.message || 'Failed to load live data' });
      }
    }
  );

  app.get(
    '/management-reports/print',
    requireAuth,
    requireReportsAccess,
    async (req, res) => {
      try {
        const data = await buildPageData(req, res);
        if (!data) {
          return res.redirect(
            portalRedirect.managementReportsLandingUrl(req, {
              err: 'No report sections available to print.',
            })
          );
        }
        if (data.error) {
          return res.redirect(
            portalRedirect.managementReportsLandingUrl(req, { err: data.error })
          );
        }
        res.render('management-reports-print', {
          title:
            (data.reportTitle ? data.reportTitle + ' — ' : '') +
            (data.meta.orgName || hmsBrand.name),
          sections: data.sections,
          activeTab: data.activeTab,
          liveGeneratedAt: data.live.periodLabel,
          scopeLabel: data.scopeLabel,
          reportTitle: data.reportTitle,
          periodRange: data.periodRange,
          reportsBackUrl: portalRedirect.managementReportsBackUrl(data.activeTab),
          ...data.meta,
        });
      } catch (err) {
        console.error('management-reports print:', err);
        res.status(500).render('error', {
          title: 'Error',
          message: 'Could not prepare print report.',
          status: 500,
        });
      }
    }
  );

  app.get(
    '/management-reports',
    requireAuth,
    requireReportsAccess,
    async (req, res) => {
      try {
        const perms = res.locals.userPerms || [];
        const vm = reportsAccess.buildReportsViewModel(perms);
        if (portalRedirect.shouldRedirectManagementReportsToPortal(req, { sections: vm.sections })) {
          return res.redirect(302, portalRedirect.directorPortalUrlFromLegacyQuery(req));
        }

        const data = await buildPageData(req, res);
        if (!data) {
          return res.redirect(
            '/dashboard?err=' +
              encodeURIComponent(
                'No report sections are assigned to your role. Ask an administrator.'
              )
          );
        }
        if (data.error && String(req.query.report || '').trim()) {
          return res.redirect(
            portalRedirect.managementReportsLandingUrl(req, { err: data.error })
          );
        }

        res.render('management-reports', {
          title: 'Management Reports — ZAIZENS',
          sections: data.sections,
          activeTab: data.activeTab,
          hasFullAccess: data.vm.hasFullAccess,
          liveGeneratedAt: data.live.periodLabel,
          liveLoadError: data.live.loadError || null,
          ...data.meta,
          flash: req.query.msg || null,
          error: req.query.err || null,
        });
      } catch (err) {
        console.error('management-reports:', err);
        res.status(500).render('error', {
          title: 'Error',
          message: 'Could not load management reports.',
          status: 500,
        });
      }
    }
  );

  app.get('/director-reports', requireAuth, (req, res) => {
    return res.redirect(301, portalRedirect.directorPortalUrlFromLegacyQuery(req));
  });
};
