'use strict';

/** HMS clinical departments (legacy CC-* codes). */
const HMS_CLINICAL_CENTERS = [
  { code: 'CC-ADMIN', name: 'Administration', sort_order: 10 },
  { code: 'CC-OPD', name: 'Outpatient clinical services', sort_order: 20 },
  { code: 'CC-IPD', name: 'Inpatient clinical services', sort_order: 30 },
  { code: 'CC-LAB', name: 'Laboratory', sort_order: 40 },
  { code: 'CC-RAD', name: 'Radiology and imaging', sort_order: 50 },
  { code: 'CC-PHARM', name: 'Pharmacy', sort_order: 60 },
  { code: 'CC-SURG', name: 'Surgery and theatres', sort_order: 70 },
  { code: 'CC-SUPP', name: 'Support services (HR, IT, maintenance)', sort_order: 80 },
];

/** OHADA hospital template — parity with Account_Core OhadaCostCenterTemplateCatalog HOSPITAL. */
const OHADA_HOSPITAL_TEMPLATE = [
  { code: 'HOSP-01', name: 'Trésorerie & caisse', ohada_class: 5, related_account_code: '57', sort_order: 101 },
  { code: 'HOSP-02', name: 'Immo médicale', ohada_class: 2, related_account_code: '25', sort_order: 102 },
  { code: 'HOSP-03', name: 'Stocks & pharmacie', ohada_class: 3, related_account_code: '32', sort_order: 103 },
  { code: 'HOSP-04', name: 'Fournisseurs & créances', ohada_class: 4, related_account_code: '401', sort_order: 104 },
  { code: 'HOSP-05', name: 'Emplois de fonds', ohada_class: 1, related_account_code: '16', sort_order: 105 },
  { code: 'HOSP-64', name: 'Salaires & social', ohada_class: 6, related_account_code: '641', sort_order: 106 },
  { code: 'HOSP-6001', name: 'Achats pharmacie hôpital', ohada_class: 6, related_account_code: '601', sort_order: 107 },
  { code: 'HOSP-6002', name: 'Fournitures médicales', ohada_class: 6, related_account_code: '602', sort_order: 108 },
  { code: 'HOSP-6003', name: 'Laboratoire & consommables', ohada_class: 6, related_account_code: '61', sort_order: 109 },
  { code: 'HOSP-6004', name: 'Restauration & hébergement', ohada_class: 6, related_account_code: '62', sort_order: 110 },
  { code: 'HOSP-62', name: 'Énergie & entretien', ohada_class: 6, related_account_code: '62', sort_order: 111 },
  { code: 'HOSP-70', name: 'Prestations & soins', ohada_class: 7, related_account_code: '706', sort_order: 112 },
];

function allSeedRows() {
  return [...HMS_CLINICAL_CENTERS, ...OHADA_HOSPITAL_TEMPLATE];
}

module.exports = {
  HMS_CLINICAL_CENTERS,
  OHADA_HOSPITAL_TEMPLATE,
  allSeedRows,
};
