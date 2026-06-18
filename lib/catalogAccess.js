'use strict';

/** Service catalog section permissions (not role-based). */
const SECTIONS = Object.freeze(['consultation', 'laboratory', 'pharmacy', 'radiology', 'general']);

const READ_PERM = {
  consultation: 'service_catalog.consultation.read',
  laboratory: 'service_catalog.laboratory.read',
  pharmacy: 'service_catalog.pharmacy.read',
  radiology: 'service_catalog.radiology.read',
  general: 'service_catalog.general.read',
};

const WRITE_PERM = {
  consultation: 'service_catalog.consultation.write',
  laboratory: 'service_catalog.laboratory.write',
  pharmacy: 'service_catalog.pharmacy.write',
  radiology: 'service_catalog.radiology.write',
  general: 'service_catalog.general.write',
};

/** All catalog read permission keys (for route/nav gates). */
const ALL_CATALOG_READ_PERMS = Object.freeze(Object.values(READ_PERM));

/** All catalog write permission keys. */
const ALL_CATALOG_WRITE_PERMS = Object.freeze(Object.values(WRITE_PERM));

/** Import / maintenance POST paths → catalog section. */
const IMPORT_ROUTE_SECTION = Object.freeze({
  '/catalog/laboratory/import-price-list': 'laboratory',
  '/catalog/laboratory/import-file': 'laboratory',
  '/catalog/pharmacy/import-price-list': 'pharmacy',
  '/catalog/pharmacy/import-file': 'pharmacy',
  '/catalog/pharmacy/autofill-used-for': 'pharmacy',
  '/catalog/maternity/import-price-list': 'general',
  '/catalog/nursing-ward/import-price-list': 'general',
  '/catalog/surgery/import-price-list': 'general',
  '/catalog/radiology/import-price-list': 'radiology',
  '/catalog/radiology/import-file': 'radiology',
  '/catalog/scan/import-price-list': 'radiology',
  '/catalog/scans-imaging/merge': 'radiology',
});

function normCat(v) {
  return String(v || 'service').trim().toLowerCase() || 'service';
}

/** Map stored category to ACL section (mirrors frontend tabCat). */
function categoryToSection(category) {
  const s = normCat(category);
  if (s === 'consultation') return 'consultation';
  if (s === 'laboratory') return 'laboratory';
  if (s === 'pharmacy') return 'pharmacy';
  if (s === 'radiology' || s === 'scan' || s === 'scans_imaging') return 'radiology';
  return 'general';
}

function tabCat(category) {
  const s = normCat(category);
  if (s === 'radiology' || s === 'scan') return 'scans_imaging';
  return s;
}

function hasWildcard(perms) {
  return (perms || []).includes('*');
}

function hasPerm(perms, code) {
  return hasWildcard(perms) || (perms || []).includes(code);
}

function hasCatalogRead(perms, categoryOrSection) {
  if (hasWildcard(perms)) return true;
  const section = SECTIONS.includes(categoryOrSection)
    ? categoryOrSection
    : categoryToSection(categoryOrSection);
  return hasPerm(perms, READ_PERM[section]);
}

function hasCatalogWrite(perms, categoryOrSection) {
  if (hasWildcard(perms)) return true;
  const section = SECTIONS.includes(categoryOrSection)
    ? categoryOrSection
    : categoryToSection(categoryOrSection);
  return hasPerm(perms, WRITE_PERM[section]);
}

function readableSections(perms) {
  if (hasWildcard(perms)) return [...SECTIONS];
  return SECTIONS.filter((s) => hasPerm(perms, READ_PERM[s]));
}

function writableSections(perms) {
  if (hasWildcard(perms)) return [...SECTIONS];
  return SECTIONS.filter((s) => hasPerm(perms, WRITE_PERM[s]));
}

/** Filter catalog rows to sections the user may read. */
function filterServicesForPerms(services, perms) {
  if (hasWildcard(perms)) return services || [];
  const allowed = new Set(readableSections(perms));
  return (services || []).filter((s) => allowed.has(categoryToSection(s.category)));
}

/** UI tab key (e.g. scans_imaging) → can write. */
function buildCatalogPageAccess(perms) {
  const readSections = readableSections(perms);
  const writeSections = writableSections(perms);
  const canReadTab = (tabKey) => {
    if (hasWildcard(perms)) return true;
    if (tabKey === '__all') return readSections.length > 0;
    const section = tabKey === 'scans_imaging' ? 'radiology' : categoryToSection(tabKey);
    return readSections.includes(section);
  };
  const canWriteTab = (tabKey) => {
    if (hasWildcard(perms)) return true;
    const section = tabKey === 'scans_imaging' ? 'radiology' : categoryToSection(tabKey);
    return writeSections.includes(section);
  };
  const canImportAction = (actionPath) => {
    if (hasWildcard(perms)) return true;
    const section = IMPORT_ROUTE_SECTION[actionPath];
    return section ? writeSections.includes(section) : false;
  };
  return {
    readSections,
    writeSections,
    canReadTab,
    canWriteTab,
    canImportAction,
    canWriteAny: writeSections.length > 0,
    canImportAny: Object.entries(IMPORT_ROUTE_SECTION).some(([, sec]) => writeSections.includes(sec)),
  };
}

function routeToSection(pathname) {
  const p = String(pathname || '').split('?')[0];
  if (IMPORT_ROUTE_SECTION[p]) return IMPORT_ROUTE_SECTION[p];
  return null;
}

/** Express middleware: grant write when route section or body.category is allowed. */
function requireCatalogWrite(req, res, next) {
  const perms = res.locals.userPerms || [];
  if (hasWildcard(perms)) return next();

  let section = routeToSection(req.path);
  if (!section && req.body && req.body.category != null) {
    section = categoryToSection(req.body.category);
  }
  if (!section) section = 'general';

  if (hasCatalogWrite(perms, section)) return next();

  const msg = 'Access denied. Service catalog write permission required for this section.';
  if (req.method === 'POST' || (req.headers.accept || '').includes('application/json') || req.xhr) {
    return res.status(403).json({ ok: false, error: msg });
  }
  return res.redirect('/catalog?err=' + encodeURIComponent(msg));
}

module.exports = {
  SECTIONS,
  READ_PERM,
  WRITE_PERM,
  ALL_CATALOG_READ_PERMS,
  ALL_CATALOG_WRITE_PERMS,
  IMPORT_ROUTE_SECTION,
  normCat,
  categoryToSection,
  tabCat,
  hasCatalogRead,
  hasCatalogWrite,
  readableSections,
  writableSections,
  filterServicesForPerms,
  buildCatalogPageAccess,
  routeToSection,
  requireCatalogWrite,
};
