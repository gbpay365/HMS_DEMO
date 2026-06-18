/** Client-side mirror of lib/catalogAccess.js (pageData is JSON — no functions). */

const SECTIONS = ['consultation', 'laboratory', 'pharmacy', 'radiology', 'general'];

const IMPORT_ROUTE_SECTION = {
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
  '/catalog/scans-imaging/merge': 'radiology'};

function normCat(v) {
  return String(v || 'service').trim().toLowerCase() || 'service';
}

export function categoryToSection(category) {
  const s = normCat(category);
  if (s === 'consultation') return 'consultation';
  if (s === 'laboratory') return 'laboratory';
  if (s === 'pharmacy') return 'pharmacy';
  if (s === 'radiology' || s === 'scan' || s === 'scans_imaging') return 'radiology';
  return 'general';
}

export function tabToSection(tabKey) {
  if (tabKey === 'scans_imaging') return 'radiology';
  return categoryToSection(tabKey);
}

export function normalizeCatalogAccess(raw = {}) {
  const writeSections = raw.writeSections || [];
  const readSections = raw.readSections || writeSections;
  const canWriteTab = (tabKey) => writeSections.includes(tabToSection(tabKey));
  const canReadTab = (tabKey) => {
    if (tabKey === '__all') return readSections.length > 0;
    return readSections.includes(tabToSection(tabKey));
  };
  const canImportAction = (actionPath) => {
    const section = IMPORT_ROUTE_SECTION[actionPath];
    return section ? writeSections.includes(section) : false;
  };
  return {
    readSections,
    writeSections,
    canWriteAny: writeSections.length > 0,
    canImportAny: Object.values(IMPORT_ROUTE_SECTION).some((s) => writeSections.includes(s)),
    canWriteTab,
    canReadTab,
    canImportAction};
}

export function catalogCategoryWritable(writeSections, categoryValue) {
  return (writeSections || []).includes(categoryToSection(categoryValue || 'service'));
}

export { SECTIONS, IMPORT_ROUTE_SECTION };
