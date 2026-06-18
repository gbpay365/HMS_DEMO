'use strict';

const catalog = require('./hmsDirectorReportsCatalog');

function normalizePerms(userPerms) {
  const p = userPerms || [];
  if (p.includes('*')) return { all: true, set: new Set(['*']) };
  const set = new Set(p);
  if (set.has('hms_reports.full')) return { all: true, set };
  return { all: false, set };
}

function hasPerm(set, all, code) {
  if (all) return true;
  return set.has(code);
}

function canViewSection(set, all, sectionKey) {
  if (all) return true;
  if (set.has(`hms_reports.${sectionKey}`)) return true;
  if (set.has('hms_reports.read')) {
    const prefix = `hms_reports.${sectionKey}.`;
    for (const p of set) {
      if (p.startsWith(prefix) || p === `hms_reports.financial`) return true;
    }
  }
  for (const c of catalog.CARDS) {
    if (c.section === sectionKey && set.has(c.perm)) return true;
  }
  if (sectionKey === 'financial') {
    for (const r of catalog.FINANCIAL_ROWS) if (set.has(r.perm)) return true;
    for (const u of catalog.FINANCIAL_UNITS) if (set.has(u.perm)) return true;
  }
  return false;
}

function canViewCard(set, all, card) {
  if (all) return true;
  if (set.has(card.perm)) return true;
  if (set.has(`hms_reports.${card.section}`)) return true;
  return false;
}

function canViewFinancialRow(set, all, row) {
  if (all) return true;
  if (set.has(row.perm)) return true;
  if (set.has('hms_reports.financial')) return true;
  return false;
}

function canViewFinancialUnit(set, all, unit) {
  if (all) return true;
  if (set.has(unit.perm)) return true;
  if (set.has('hms_reports.financial')) return true;
  return false;
}

function hasAnyReportAccess(userPerms) {
  const { set, all } = normalizePerms(userPerms);
  if (all) return true;
  if (set.has('hms_reports.read')) return true;
  for (const [code] of catalog.ALL_REPORT_PERMISSIONS) {
    if (set.has(code)) return true;
  }
  return false;
}

/** Build filtered view model for management-reports page. */
function buildReportsViewModel(userPerms) {
  const { set, all } = normalizePerms(userPerms);
  const sections = catalog.SECTIONS.filter((s) => canViewSection(set, all, s.key)).map((s) => ({
    ...s,
    cards: catalog.CARDS.filter((c) => c.section === s.key && canViewCard(set, all, c)),
    financialRows:
      s.key === 'financial'
        ? catalog.FINANCIAL_ROWS.filter((r) => canViewFinancialRow(set, all, r))
        : [],
    financialUnits:
      s.key === 'financial'
        ? catalog.FINANCIAL_UNITS.filter((u) => canViewFinancialUnit(set, all, u))
        : [],
  })).filter(
    (s) =>
      s.cards.length > 0 ||
      s.financialRows.length > 0 ||
      s.financialUnits.length > 0
  );

  const defaultSection = sections[0]?.key || null;
  return { sections, defaultSection, hasFullAccess: all };
}

module.exports = {
  hasAnyReportAccess,
  buildReportsViewModel,
  canViewSection,
  canViewCard,
  canViewFinancialRow,
  canViewFinancialUnit,
};
