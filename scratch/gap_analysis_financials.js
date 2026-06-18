'use strict';

const ensureAclSchema = require('../lib/ensureAclSchema');

async function run() {
  const elements = [];

  // Mock database pool
  const mockPool = {
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO tbl_acl_ui_element') || sql.includes('INSERT IGNORE INTO tbl_acl_ui_element') || sql.includes('tbl_acl_ui_element')) {
        if (params) {
          elements.push({
            code: params[0],
            portal: params[1],
            kind: params[2],
            parent_code: params[3],
            label: params[4],
            url: params[5],
            icon: params[6],
            color: params[7],
            sort_order: params[8],
            required_perm: params[9]
          });
        }
      }
      if (sql.includes('SELECT COUNT(*)')) {
        return [[{ n: 0 }]];
      }
      return [[]];
    }
  };

  try {
    await ensureAclSchema(mockPool);
  } catch (e) {
    // Ignore schema errors
  }

  // Financials sidebar items (from financials-rail.ejs)
  const financialsSidebar = [
    { label: 'Dashboard', url: '/financials' },
    { label: 'Billing workspace', url: '/billing' },
    { label: 'Journal', url: '/financials/journal' },
    { label: 'Expenses', url: '/financials/expenses' },
    { label: 'Receive payment', url: '/cashier' },
    { label: 'Banking', url: '/financials/treasury' },
    { label: 'Reconcile', url: '/financials/bank-reconciliation' },
    { label: 'Chart of accounts', url: '/financials/accounts' },
    { label: 'General ledger', url: '/financials/general-ledger' },
    { label: 'Trial balance', url: '/financials/trial-balance' },
    { label: 'Balance sheet', url: '/financials/balance-sheet' },
    { label: 'Cash flow', url: '/financials/cash-flow' },
    { label: 'Receivables', url: '/financials/accounts-receivable' },
    { label: 'Payables', url: '/financials/accounts-payable' },
    { label: 'Monthly statement', url: '/financials/statement-monthly' },
    { label: 'Year-end', url: '/financials/year-end' },
    { label: 'Tax worksheets', url: '/financials/tax' },
    { label: 'Tax & compliance', url: '/tax' },
    { label: 'Sync to GL', url: '/financials/sync-gl' },
    { label: 'Journal loader', url: '/financials/journal-loader' },
    { label: 'Diagnostics', url: '/financials/journal-diagnostics' },
    { label: 'Help & setup', url: '/financials/platform-overview' },
    { label: 'Payroll & HR', url: '/payroll' },
  ];

  // Financials topnav items from DB (kind: fin_topnav_item or fin_topnav)
  const finTopnavItems = elements.filter(el => el.kind === 'fin_topnav_item');
  const finTopnavParents = elements.filter(el => el.kind === 'fin_topnav');

  // Let's add manual primary links for financials if any
  // ACCOUNTING_PRIMARY_CODES = ['fin.nav.dashboard', 'fin.nav.payroll']
  const finTopnavPrimary = [
    { label: 'Dashboard', url: '/financials', code: 'fin.nav.dashboard' },
    { label: 'Payroll', url: '/payroll', code: 'fin.nav.payroll' }
  ];

  function normalizeUrl(url) {
    if (!url) return '';
    let u = url.trim().toLowerCase();
    u = u.split('?')[0];
    if (u.endsWith('/')) u = u.slice(0, -1);
    return u;
  }

  // Compile all financials topnav URLs
  const finTopnavUrls = new Set();
  finTopnavItems.forEach(item => finTopnavUrls.add(normalizeUrl(item.url)));
  finTopnavPrimary.forEach(item => finTopnavUrls.add(normalizeUrl(item.url)));

  console.log('# Financials Navigation Gap Analysis\n');
  console.log('This table shows which links are present on the **Financials Sidebar Rail** (`financials-rail.ejs`) but **NOT** in the **Accounting top bar header dropdowns** (`accounting-odoo-nav.ejs`):\n');

  console.log('| Sidebar Link | Target URL | Status in Top Navigation |');
  console.log('| --- | --- | --- |');

  let gapCount = 0;
  financialsSidebar.forEach(item => {
    const itemUrl = normalizeUrl(item.url);
    if (!finTopnavUrls.has(itemUrl)) {
      gapCount++;
      console.log(`| **${item.label}** | \`${item.url}\` | ❌ Missing from Financials Topnav |`);
    } else {
      console.log(`| **${item.label}** | \`${item.url}\` | ✅ Matches top navigation |`);
    }
  });

  console.log(`\n**Total Financials Sidebar Links:** ${financialsSidebar.length}`);
  console.log(`**Financials Sidebar Links Missing from Topnav:** ${gapCount}`);
}

run().catch(console.error);
