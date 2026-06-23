'use strict';

/**
 * Consultation tariffs (XAF) — Service Catalog (category: consultation).
 * Source of truth for General / Specialist consultation list prices.
 */
const CONSULTATION_CATALOG_2026 = [
  {
    sn: 1,
    name: 'General Consultation',
    subcategory: 'General Consultation',
    department_name: 'General Medicine',
    code: 'C001',
    legacyCpt: 'NW_GEN_CONS',
    price: 2000,
  },
  {
    sn: 2,
    name: 'Specialist Consultation',
    subcategory: 'Specialist Consultation',
    department_name: null,
    code: 'C010',
    legacyCpt: 'NW_SPEC_CONS',
    price: 5000,
  },
];

module.exports = {
  CONSULTATION_CATALOG_2026,
};
