'use strict';

const ANNUAL_SHARED_PERM =
  'director.annual.read|director.dashboard.read|hms_reports.full|hms_reports.read|dashboard.read';

const DOMAIN_DEFS = [
  { id: 'clinical', code: 'dir.yr.domain.clinical', perm: 'director.annual.domain.clinical', label: 'Clinical quality', color: '#1B5FA8', lightColor: '#EAF1FB', sort: 10 },
  { id: 'financial', code: 'dir.yr.domain.financial', perm: 'director.annual.domain.financial', label: 'Financial health', color: '#1A7A55', lightColor: '#E5F5EE', sort: 20 },
  { id: 'patient', code: 'dir.yr.domain.patient', perm: 'director.annual.domain.patient', label: 'Patient experience', color: '#7B3FA0', lightColor: '#F2EBF9', sort: 30 },
  { id: 'workforce', code: 'dir.yr.domain.workforce', perm: 'director.annual.domain.workforce', label: 'Workforce', color: '#B05C0A', lightColor: '#FDF0E3', sort: 40 },
  { id: 'safety', code: 'dir.yr.domain.safety', perm: 'director.annual.domain.safety', label: 'Safety & compliance', color: '#B81C1C', lightColor: '#FCEAEA', sort: 50 },
];

const PANEL_DEFS = [
  { id: 'hero_summary', code: 'dir.yr.panel.hero_summary', perm: 'director.annual.panel.hero_summary', label: 'Overall performance', sort: 5 },
  { id: 'domain_radar', code: 'dir.yr.panel.domain_radar', perm: 'director.annual.panel.domain_radar', label: 'Domain radar', sort: 10 },
  { id: 'trend_chart', code: 'dir.yr.panel.trend_chart', perm: 'director.annual.panel.trend_chart', label: '5-year performance', sort: 20 },
];

const DOMAIN_BY_CODE = new Map(DOMAIN_DEFS.map((r) => [r.code, r]));
const PANEL_BY_CODE = new Map(PANEL_DEFS.map((r) => [r.code, r]));

function permWithFallback(perm) {
  return `${perm}|${ANNUAL_SHARED_PERM}`;
}

function aclUiElements() {
  const rows = [
    [
      'dir.section.annual_scorecard',
      'director',
      'section',
      'Annual performance scorecard',
      null,
      null,
      null,
      ANNUAL_SHARED_PERM,
      4,
      null,
    ],
  ];

  for (const panel of PANEL_DEFS) {
    rows.push([
      panel.code,
      'director',
      'section',
      panel.label,
      null,
      null,
      null,
      permWithFallback(panel.perm),
      panel.sort,
      'dir.section.annual_scorecard',
    ]);
  }

  for (const domain of DOMAIN_DEFS) {
    rows.push([
      domain.code,
      'director',
      'section',
      domain.label,
      null,
      null,
      domain.color,
      permWithFallback(domain.perm),
      domain.sort,
      'dir.section.annual_scorecard',
    ]);
  }

  return rows;
}

const ALL_DIRECTOR_ANNUAL_PERMISSIONS = [
  ['director.annual.read', 'Director annual scorecard (all widgets)', 'director'],
  ...PANEL_DEFS.map((p) => [p.perm, `Director annual panel — ${p.id}`, 'director']),
  ...DOMAIN_DEFS.map((d) => [d.perm, `Director annual domain — ${d.id}`, 'director']),
];

function codesForWidgets(visible) {
  const codes = new Set();
  for (const item of visible || []) {
    if (item?.code) codes.add(String(item.code));
  }
  return codes;
}

function filterWidgetDefs(defs, visibleCodes, map) {
  return defs.filter((def) => visibleCodes.has(def.code)).map((def) => {
    const acl = map.get(def.code);
    return { ...def, label: acl?.label || def.label || def.id };
  });
}

function buildVisibleAnnualModel(aclPack) {
  const sections = aclPack.sections || [];
  const allCodes = codesForWidgets(sections);
  const hasShell = allCodes.has('dir.section.annual_scorecard');

  const panels = filterWidgetDefs(PANEL_DEFS, allCodes, PANEL_BY_CODE).map((p) => ({
    ...p,
    label: sections.find((s) => s.code === p.code)?.label || p.label,
  }));

  const domains = filterWidgetDefs(DOMAIN_DEFS, allCodes, DOMAIN_BY_CODE).map((d) => ({
    ...d,
    label: sections.find((s) => s.code === d.code)?.label || d.label,
  }));

  return { hasShell, panels, domains, allCodes };
}

module.exports = {
  DOMAIN_DEFS,
  PANEL_DEFS,
  DOMAIN_BY_CODE,
  PANEL_BY_CODE,
  ANNUAL_SHARED_PERM,
  aclUiElements,
  ALL_DIRECTOR_ANNUAL_PERMISSIONS,
  buildVisibleAnnualModel,
};
