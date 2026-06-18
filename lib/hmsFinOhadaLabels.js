/** SYSCOHADA class from first digit of account code (PHP hms_fin_ohada_class_from_code). */
function ohadaClassFromCode(accountCode) {
 const c = String(accountCode || '').trim();
 if (!c) return 0;
 const d = c[0];
 return /^\d$/.test(d) ? parseInt(d, 10) : 0;
}

/** Short category label for trial balance (PHP hms_fin_report_category_from_class). */
function reportCategoryFromClass(cls) {
 switch (cls) {
  case 1:
   return 'Equity / long-term';
  case 2:
  case 3:
  case 5:
   return 'Asset';
  case 4:
   return 'Third parties';
  case 6:
   return 'Expense';
  case 7:
   return 'Income';
  default:
   return '—';
 }
}

module.exports = { ohadaClassFromCode, reportCategoryFromClass };
