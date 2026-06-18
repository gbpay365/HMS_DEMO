'use strict';

const ensureAclSchema = require('../lib/ensureAclSchema');
const fs = require('fs');

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

  // Sidebar items from DB
  const sidebarDbItems = elements.filter(el => el.kind === 'sidebar');

  // Sidebar items from hms-nav-sidebar-extras.ejs (parsed manually)
  const sidebarExtras = [
    { label: 'Front Desk Portal', url: '/portal/front-desk', icon: 'fa-desktop', note: 'Staff portal' },
    { label: 'Patient Directory Portal', url: '/portal/patient', icon: 'fa-users', note: 'Staff portal' },
    { label: 'Patient Sign-in (Public)', url: '/portal/login', icon: 'fa-heartbeat', note: 'Public portal, open in new tab' },
    { label: 'Doctor Portal', url: '/portal/doctor', icon: 'fa-user-md', note: 'Staff portal' },
    { label: 'Nurse Portal', url: '/portal/nurse', icon: 'fa-heartbeat', note: 'Staff portal' },
    { label: 'Laboratory Portal', url: '/portal/lab', icon: 'fa-flask', note: 'Staff portal' },
    { label: 'Pharmacy Portal', url: '/portal/pharmacy', icon: 'fa-medkit', note: 'Staff portal' },
    { label: 'Radiology Portal', url: '/portal/radiology', icon: 'fa-film', note: 'Staff portal' },
    { label: 'Accountant Portal', url: '/portal/accountant', icon: 'fa-calculator', note: 'Staff portal (redirects to /financials)' },
    { label: 'Cashier Portal', url: '/portal/cashier', icon: 'fa-money', note: 'Staff portal' },
    { label: 'IPD/ER test alerts', url: '/laboratory/order-alerts', icon: 'fa-bell', note: 'Alert link for lab' },
    { label: 'Test templates', url: '/lab/templates', icon: 'fa-list-alt', note: 'Configuration link for lab' },
    { label: 'IPD/ER medication alerts', url: '/pharmacy/order-alerts', icon: 'fa-bell', note: 'Alert link for pharmacy' },
    { label: 'IPD/ER imaging alerts', url: '/radiology/order-alerts', icon: 'fa-bell', note: 'Alert link for radiology' },
  ];

  // Topnav elements from DB
  const topnavItems = elements.filter(el => el.kind === 'topnav_item');

  // Hardcoded/Layout-level Top Nav items
  // 1. Primary links defined in lib/aclLayout.js (TOPBAR_PRIMARY_CODES = ['sb.hms_hub', 'sb.patients', 'sb.appointments'])
  const topnavPrimary = [
    { label: 'HMS Hub', url: '/hms', code: 'sb.hms_hub' },
    { label: 'Patient Directory', url: '/patients', code: 'sb.patients' },
    { label: 'Appointments', url: '/appointments', code: 'sb.appointments' }
  ];

  // 2. Direct topnav links in header template (hms-nav-topbar.ejs)
  const topnavHardcoded = [
    { label: 'Dashboard (Brand Logo)', url: '/dashboard', note: 'Logo button in top-left' },
    { label: 'ER (Emergency / A&E)', url: '/emergency', note: 'Top-right red ambulance link' },
    { label: 'My profile', url: '/profile', note: 'User dropdown link' },
    { label: 'Settings (Account)', url: '/my-profile', note: 'User dropdown link' }
  ];

  // Compile all top navigation URLs
  const topnavUrls = new Set();
  
  // Add DB topnav items
  topnavItems.forEach(item => {
    if (item.url) topnavUrls.add(normalizeUrl(item.url));
  });

  // Add primary topnav links
  topnavPrimary.forEach(item => {
    topnavUrls.add(normalizeUrl(item.url));
  });

  // Add hardcoded topnav items
  topnavHardcoded.forEach(item => {
    topnavUrls.add(normalizeUrl(item.url));
  });

  function normalizeUrl(url) {
    if (!url) return '';
    let u = url.trim().toLowerCase();
    if (u === '__home__') return '/hms';
    u = u.split('?')[0];
    if (u.endsWith('/')) u = u.slice(0, -1);
    return u;
  }

  console.log('# Navigation Gap Analysis: Sidebar vs. Top Navigation Pane\n');
  console.log('This analysis examines navigation items configured in the HMS system, specifically highlighting which actions/menus are present on the **Sidebar** (seeded in the database and hardcoded in layout templates) but are **missing from the Top Navigation Pane / Dropdown Menus** (Odoo-style header bar).\n');
  
  console.log('## 1. Database-Seeded Global Sidebar Items (sb.*)');
  console.log('These items are registered in `tbl_acl_ui_element` with `kind = \'sidebar\'` but have no corresponding standard item, primary link, or layout button in the Top Navigation bar.\n');

  console.log('| Sidebar Code | Label | Target URL | Icon | Permissions Required | Status |');
  console.log('| --- | --- | --- | --- | --- | --- |');

  let dbMissingCount = 0;
  sidebarDbItems.forEach(sb => {
    const sbUrl = normalizeUrl(sb.url);
    if (!topnavUrls.has(sbUrl)) {
      dbMissingCount++;
      console.log(`| \`${sb.code}\` | **${sb.label}** | \`${sb.url}\` | \`<i class="fa ${sb.icon}"></i>\` | \`${sb.required_perm || '*'}\` | ❌ Missing |`);
    }
  });

  console.log(`\n**Total Seeded Sidebar Items:** ${sidebarDbItems.length}`);
  console.log(`**Seeded Items Missing from Topbar:** ${dbMissingCount}\n`);

  console.log('## 2. Hardcoded/Extra Sidebar Items (Extras Menu)');
  console.log('These items are hardcoded in `views/partials/hms-nav-sidebar-extras.ejs` to provide shortcut portals and alerts. None of these have general topnav representations in the top-bar dropdowns.\n');

  console.log('| Label | Target URL | Icon | Role / Module Scope | Context |');
  console.log('| --- | --- | --- | --- | --- |');

  let extraMissingCount = 0;
  sidebarExtras.forEach(ext => {
    const extUrl = normalizeUrl(ext.url);
    if (!topnavUrls.has(extUrl)) {
      extraMissingCount++;
      console.log(`| **${ext.label}** | \`${ext.url}\` | \`<i class="fa ${ext.icon}"></i>\` | ${ext.note} | ❌ Missing |`);
    }
  });

  console.log(`\n**Total Sidebar Extra Items:** ${sidebarExtras.length}`);
  console.log(`**Sidebar Extras Missing from Topbar:** ${extraMissingCount}\n`);

  console.log('## 3. Top Navigation Pane Structure (Odoo Navbar)');
  console.log('For completeness, this is how the top navigation pane is structured and what links are available there:\n');

  console.log('### A. Brand Logo and Direct Links');
  topnavHardcoded.forEach(item => {
    console.log(`- **${item.label}** links directly to \`${item.url}\` (${item.note})`);
  });

  console.log('\n### B. Topbar Primary Links');
  topnavPrimary.forEach(item => {
    console.log(`- **${item.label}** links directly to \`${item.url}\` (Code: \`${item.code}\`)`);
  });

  console.log('\n### C. Dropdown Parent Menus & Dropdown Options (Clinical, Operations, HR, Settings)');
  
  // Group topnav dropdown items by parent menu code
  const menus = {};
  elements.filter(el => el.kind === 'topnav').forEach(parent => {
    menus[parent.code] = { parent, children: [] };
  });

  topnavItems.forEach(ch => {
    if (ch.parent_code && menus[ch.parent_code]) {
      menus[ch.parent_code].children.push(ch);
    }
  });

  Object.values(menus).forEach(m => {
    console.log(`\n#### Dropdown: **${m.parent.label}** (Code: \`${m.parent.code}\`)`);
    m.children.forEach(ch => {
      console.log(`  - **${ch.label}** pointing to \`${ch.url}\` (Code: \`${ch.code}\`)`);
    });
  });
}

run().catch(console.error);
