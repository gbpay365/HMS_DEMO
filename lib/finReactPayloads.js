/** Build finPageData payloads for React financials pages (JSON-serializable). */
const { finPageData } = require('./reactRouteHelpers');

function col(key, label, extra = {}) {
  return { key, label, ...extra };
}

function moneyCol(key, label) {
  return col(key, label, { align: 'right', format: 'money' });
}

function linkCol(key, label, linkTemplate, linkLabel) {
  return col(key, label, { format: 'link', linkTemplate, linkLabel: linkLabel || 'Open' });
}

function flattenGlAccounts(accounts = []) {
  const rows = [];
  for (const acct of accounts) {
    for (const line of acct.rows || []) {
      rows.push({
        id: `${acct.code}-${line.journal_id || line.line_id || line.entry_date}-${line.debit}-${line.credit}`,
        account_code: acct.code,
        account_label: acct.label,
        entry_date: line.entry_date,
        narration: line.narration || line.description,
        debit: line.debit,
        credit: line.credit,
        running: line.running,
        journal_id: line.journal_id || null,
      });
    }
  }
  return rows;
}

function flattenCoa(byClass = {}, classKeys = []) {
  const rows = [];
  for (const k of classKeys) {
    for (const a of byClass[k] || byClass[String(k)] || []) {
      const accountCode = String(a.account_code ?? a.code ?? '').trim();
      const accountLabel = String(a.account_label ?? a.label ?? a.name ?? a.label_en ?? '').trim();
      rows.push({
        id: a.id || `${k}-${accountCode || rows.length}`,
        class_num: k,
        account_code: accountCode,
        account_label: accountLabel,
        balance: a.balance ?? null,
        active: a.active,
      });
    }
  }
  return rows;
}

function arPayload(d) {
  return finPageData('accounts-receivable', 'ar', {
    title: 'Accounts receivable',
    subtitle: d.asofDisplay ? `As at ${d.asofDisplay}` : '',
    stats: [
      { label: 'Gross charges', value: d.sumGross, format: 'money' },
      { label: 'Paid', value: d.sumPaid, format: 'money' },
      { label: 'Adjustments', value: d.sumAdj, format: 'money' },
      { label: 'Net AR', value: d.sumNet, format: 'money' },
    ],
    columns: [
      col('patient_label', 'Patient'),
      col('charge_date', 'Date'),
      moneyCol('gross', 'Gross'),
      moneyCol('paid', 'Paid'),
      moneyCol('net', 'Net'),
    ],
    rows: d.arRows || [],
    panels: d.queryError ? [{ note: d.queryError, html: true }] : [],
    flash: d.flash,
    error: d.error,
  });
}

function apPayload(d) {
  return finPageData('accounts-payable', 'ap', {
    title: 'Accounts payable',
    subtitle: d.periodDisplay || '',
    stats: [{ label: 'Total AP', value: d.sumAp, format: 'money' }],
    columns: [
      col('expense_date', 'Date'),
      col('category', 'Category'),
      col('description', 'Description'),
      col('vendor', 'Vendor'),
      moneyCol('amount_xaf', 'Amount'),
    ],
    rows: d.apRows || [],
    panels: d.queryError ? [{ note: d.queryError, html: true }] : [],
    flash: d.flash,
    error: d.error,
  });
}

function glPayload(vm) {
  const flat = flattenGlAccounts(vm.accounts || []);
  return finPageData('general-ledger', 'ledger', {
    title: 'General ledger',
    subtitle: vm.d1 && vm.d2 ? `${vm.d1} → ${vm.d2}${vm.acct ? ` · ${vm.acct}` : ''}` : '',
    glAccounts: vm.accounts || [],
    columns: [
      col('account_code', 'Account'),
      col('entry_date', 'Date'),
      col('narration', 'Description'),
      moneyCol('debit', 'Debit'),
      moneyCol('credit', 'Credit'),
      moneyCol('running', 'Balance'),
      linkCol('journal_id', '', '/financials/journal-view?id={journal_id}', 'View'),
    ],
    rows: flat,
    stats: vm.opening && vm.acct ? [{ label: 'Opening', value: vm.opening[vm.acct] || 0, format: 'money' }] : [],
    panels: [
      ...(vm.glSiteHint ? [{ note: vm.glSiteHint, html: true }] : []),
      ...(vm.glExtraHint ? [{ note: vm.glExtraHint, html: true }] : []),
    ],
    flash: vm.flash,
    error: vm.error,
    finCanWrite: !!vm.canPostGl,
  });
}

function coaPayload(d) {
  const rows = flattenCoa(d.byClass, d.classKeys);
  return finPageData('chart-of-accounts', 'accounts', {
    title: 'Chart of accounts',
    subtitle: d.coaOk ? `${rows.length} accounts` : 'Chart unavailable',
    byClass: d.byClass,
    classKeys: d.classKeys,
    coaClassTitle: typeof d.coaClassTitle === 'function' ? undefined : d.coaClassTitle,
    columns: [
      col('class_num', 'Class'),
      col('account_code', 'Code'),
      col('account_label', 'Label'),
      moneyCol('balance', 'Balance'),
    ],
    rows,
    panels: d.coaError ? [{ note: d.coaError, html: true }] : [],
    flash: d.flash,
    error: d.error,
  });
}

function expensesPayload(d) {
  return finPageData('expenses', 'expenses', {
    title: 'Expense management',
    columns: [
      col('expense_date', 'Date'),
      col('category', 'Category'),
      col('description', 'Description'),
      col('vendor', 'Vendor'),
      moneyCol('amount_xaf', 'Amount'),
    ],
    rows: d.rows || [],
    panels: d.loadErr ? [{ note: d.loadErr, html: true }] : [],
    flash: d.flash,
    error: d.error,
  });
}

function expenseNewPayload(d) {
  return finPageData('expense-new', 'expenses', {
    title: 'New expense',
    formType: 'expense-new',
    categories: d.categories || [],
    body: d.body || {},
    tableOk: d.tableOk,
    finOk: d.finOk,
    flash: d.flash,
    error: d.error,
  });
}

function journalViewPayload(d) {
  return finPageData('journal-view', 'journal', {
    title: d.j ? (d.j.piece_number ? `Journal ${d.j.piece_number}` : `Journal #${d.j.id}`) : 'Journal entry',
    journal: d.j || null,
    detail: d.detail || null,
    columns: [
      col('acode', 'Account'),
      col('alabel', 'Label'),
      moneyCol('debit', 'Debit'),
      moneyCol('credit', 'Credit'),
      col('line_memo', 'Memo'),
    ],
    rows: d.lines || [],
    flash: d.flash,
    error: d.error,
  });
}

function catalogPricesForJournal() {
  const { loadCatalogPayload } = require('./hospitalServiceRevenueAccounts');
  const payload = loadCatalogPayload();
  const out = {};
  for (const [code, entry] of Object.entries(payload.by_account_code || {})) {
    const price = parseInt(entry.default_price, 10) || 0;
    out[code] = {
      default_price: price > 0 ? price : null,
      label: String(entry.label || entry.hms_subcategory || '').trim(),
      hms_subcategory: String(entry.hms_subcategory || '').trim(),
    };
  }
  return out;
}

function journalNewPayload(d) {
  const accounts = (d.accounts || []).map((a) => ({
    ...a,
    account_code: String(a.account_code ?? a.code ?? '').trim(),
    account_label: String(a.account_label ?? a.label ?? a.label_en ?? a.name ?? '').trim(),
    normal_side: a.normal_side || null,
    account_type: a.account_type || '',
  })).filter((a) => a.id != null && a.account_code);
  return finPageData('journal-new', 'journal', {
    title: 'New journal entry',
    formType: 'journal-new',
    accounts,
    catalogByAccount: d.catalogByAccount || catalogPricesForJournal(),
    body: d.body || {},
    flash: d.flash,
    error: d.error,
  });
}

function treasuryPayload(d) {
  return finPageData('treasury', 'treasury', {
    title: 'Treasury & bank',
    subtitle: d.asof ? `As at ${d.asof}` : '',
    stats: [
      { label: 'Class 5 balance', value: d.class5Balance, format: 'money' },
      { label: 'Class 5 movement', value: d.class5Movement, format: 'money' },
      { label: 'Default bank', value: d.defaultBankBalance, format: 'money' },
    ],
    columns: [
      col('account_code', 'Account'),
      col('account_label', 'Label'),
      moneyCol('balance', 'Balance'),
      moneyCol('movement', 'Movement'),
    ],
    rows: d.accounts || [],
    flash: d.flash,
    error: d.error,
  });
}

function bankReconPayload(d) {
  return finPageData('bank-reconciliation', 'bank', {
    title: 'Bank reconciliation',
    subtitle: d.asof ? `${d.bankCode} · ${d.asof}` : '',
    stats: [
      { label: 'Book balance', value: d.book, format: 'money' },
      { label: 'Statement', value: d.stmtAmount, format: 'money' },
      { label: 'Difference', value: d.diff, format: 'money' },
    ],
    columns: [],
    rows: [],
    bankCode: d.bankCode,
    asof: d.asof,
    stmtBal: d.stmtBal,
    flash: d.flash,
    error: d.error,
  });
}

function cashFlowPayload(d) {
  return finPageData('cash-flow', 'cashflow', {
    title: 'Cash flow statement',
    subtitle: d.d1 && d.d2 ? `${d.d1} → ${d.d2}` : '',
    stats: [
      { label: 'Cash opening', value: d.cashOpen, format: 'money' },
      { label: 'Cash closing', value: d.cashClose, format: 'money' },
      { label: 'Class 5 movement', value: d.m5, format: 'money' },
      { label: 'Net income (P&L)', value: d.pl?.resultat, format: 'money' },
    ],
    columns: [],
    rows: [],
    canSyncGl: d.canSyncGl,
    glMismatchOps: d.glMismatchOps,
    flash: d.flash,
    error: d.error,
  });
}

function balanceSheetPayload(d) {
  const classKeys = Object.keys(d.byClass || {})
    .map((k) => parseInt(k, 10))
    .filter((k) => Number.isFinite(k))
    .sort((a, b) => a - b);
  return finPageData('balance-sheet', 'balance', {
    title: 'Balance sheet',
    subtitle: d.asof ? `As at ${d.asof}` : '',
    byClass: d.byClass,
    classKeys,
    glOk: d.glOk !== false,
    glMessage: d.glMessage || null,
    columns: [
      col('account_code', 'Account'),
      col('account_label', 'Label'),
      moneyCol('balance', 'Balance'),
    ],
    rows: flattenCoa(d.byClass, classKeys),
    flash: d.flash,
    error: d.error,
  });
}

function livreJournalPayload(d) {
  return finPageData('livre-journal', 'journal', {
    title: 'Livre-journal',
    subtitle: d.subtitle || '',
    columns: d.columns || [],
    rows: d.rows || [],
    journalCodes: d.journalCodes || [],
    filterFrom: d.filterFrom,
    filterTo: d.filterTo,
    filterJournal: d.filterJournal || 'all',
    flash: d.flash,
    error: d.error,
  });
}

function settingsPayload(d) {
  return finPageData('settings', 'settings', {
    title: 'Accounting settings',
    formType: 'settings',
    section: d.section,
    m: d.m,
    y: d.y,
    tax: d.tax || {},
    betterpay: d.betterpay || {},
    rev: d.rev || {},
    accounting: d.accounting || {},
    ohadaClasses: d.ohadaClasses || [],
    dipeCount: d.dipeCount,
    canWrite: d.canWrite,
    flash: d.flash,
    error: d.error,
  });
}

function syncGlPayload(d) {
  return finPageData('sync-gl', 'journal', {
    title: 'Sync to GL',
    formType: 'sync-gl',
    finOk: d.finOk,
    canRun: d.canRun,
    rfD1: d.rfD1,
    rfD2: d.rfD2,
    exD1: d.exD1,
    exD2: d.exD2,
    flash: d.flash,
    error: d.error,
  });
}

function journalLoaderPayload(d) {
  return finPageData('journal-loader', 'journal', {
    title: 'Journal CSV loader',
    formType: 'journal-loader',
    finOk: d.finOk,
    canWrite: d.canWrite,
    columns: [
      col('entry_date', 'Date'),
      col('narration', 'Description'),
      col('reference', 'Reference'),
      col('source_type', 'Source'),
    ],
    rows: d.recent || [],
    flash: d.flash,
    error: d.error,
  });
}

function journalDiagnosticsPayload(d) {
  const snap = d.snap || {};
  return finPageData('journal-diagnostics', 'journal', {
    title: 'Journal / GL diagnostics',
    subtitle: d.d1 && d.d2 ? `${d.d1} → ${d.d2}` : '',
    formType: 'journal-diagnostics',
    d1: d.d1,
    d2: d.d2,
    snap,
    hint: d.hint,
    canRepair: d.canRepair,
    repairMsg: d.repairMsg,
    repairOk: d.repairOk,
    stats: [
      { label: 'Journal headers', value: snap.header_count ?? '—' },
      { label: 'Journal lines', value: snap.line_count ?? '—' },
      { label: 'Orphan lines', value: snap.orphan_line_count ?? '—' },
    ],
    flash: d.flash,
    error: d.error,
  });
}

function yearEndPayload(d) {
  return finPageData('year-end', 'balance', {
    title: 'Profit & loss — year end',
    subtitle: d.periodDisplay || '',
    fiscalYear: d.fiscalYear || new Date().getFullYear(),
    fiscalYearStatus: d.fiscalYearStatus || 'open',
    stats: [
      { label: 'Charges', value: d.pl?.charges, format: 'money' },
      { label: 'Produits', value: d.pl?.produits, format: 'money' },
      { label: 'Result', value: d.pl?.resultat, format: 'money' },
    ],
    columns: [
      col('account_code', 'Account'),
      col('account_label', 'Label'),
      moneyCol('balance', 'Balance'),
    ],
    rows: d.balanceRows || [],
    flash: d.flash,
    error: d.error,
  });
}

function statementMonthlyPayload(d) {
  const rows = [
    ...(d.incomeAccts || []).map((a) => ({ ...a, row_type: 'Income' })),
    ...(d.expenseAccts || []).map((a) => ({ ...a, row_type: 'Expense' })),
  ];
  return finPageData('statement-monthly', 'balance', {
    title: 'Monthly review',
    subtitle: d.periodDisplay || '',
    stats: [
      { label: 'Net (current)', value: d.netCur, format: 'money' },
      { label: 'Net (prior)', value: d.netPrev, format: 'money' },
      { label: 'Net YTD', value: d.netYtd, format: 'money' },
    ],
    columns: [
      col('row_type', 'Type'),
      col('account_code', 'Account'),
      col('account_label', 'Label'),
      moneyCol('cur', 'Current'),
      moneyCol('prev', 'Prior'),
      moneyCol('ytd', 'YTD'),
    ],
    rows,
    flash: d.flash,
    error: d.error,
  });
}

function stubPayload(d) {
  return finPageData('stub', 'dashboard', {
    title: d.stubTitle || 'Coming soon',
    stubTitle: d.stubTitle,
    phpPage: d.phpPage,
    phpApi: d.phpApi,
    panels: d.extraNote ? [{ note: d.extraNote, html: true }] : [],
    flash: d.flash,
    error: d.error,
  });
}

function platformOverviewPayload(d) {
  return finPageData('platform-overview', 'settings', {
    title: 'Help & setup',
    migrationSteps: d.migrationSteps || [],
    workflowSteps: d.workflowSteps || [],
    schemaStatus: d.schemaStatus || {},
    lang: d.lang,
    isAdmin: d.isAdmin,
    hasDemoDeck: d.hasDemoDeck,
    flash: d.flash,
    error: d.error,
  });
}

module.exports = {
  arPayload,
  apPayload,
  glPayload,
  coaPayload,
  expensesPayload,
  expenseNewPayload,
  journalViewPayload,
  journalNewPayload,
  treasuryPayload,
  bankReconPayload,
  cashFlowPayload,
  balanceSheetPayload,
  livreJournalPayload,
  settingsPayload,
  syncGlPayload,
  journalLoaderPayload,
  journalDiagnosticsPayload,
  yearEndPayload,
  statementMonthlyPayload,
  stubPayload,
  platformOverviewPayload,
};
