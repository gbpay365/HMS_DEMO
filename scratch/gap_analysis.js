'use strict';

const ensureAclSchema = require('../lib/ensureAclSchema');

async function run() {
  const elements = [];

  // Mock database pool to capture UI elements
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

  // Filter elements by kind
  const sidebarItems = elements.filter(el => el.kind === 'sidebar');
  const topnavItems = elements.filter(el => el.kind === 'topnav_item');
  const topnavParentMenus = elements.filter(el => el.kind === 'topnav');

  // Normalize URLs for comparison
  const normalizeUrl = (url) => {
    if (!url) return '';
    let u = url.trim().toLowerCase();
    if (u === '__home__') return '/hms';
    // Remove query params
    u = u.split('?')[0];
    if (u.endsWith('/')) u = u.slice(0, -1);
    return u;
  };

  console.log('# HMS Navigation Gap Analysis\n');
  console.log('Below is the list of buttons/links found on the **Sidebar** but **NOT** in the **Top Navigation Pane / Menus** (Odoo-style top headers).\n');

  console.log('| Sidebar Code | Label | Target URL | Icon | Permissions Required | Status |');
  console.log('| --- | --- | --- | --- | --- | --- |');

  let missingCount = 0;
  for (const sb of sidebarItems) {
    const sbUrl = normalizeUrl(sb.url);
    
    // Check if there is a topnav item pointing to the exact same URL
    let found = false;
    
    for (const tn of topnavItems) {
      if (normalizeUrl(tn.url) === sbUrl) {
        found = true;
        break;
      }
    }

    if (!found) {
      missingCount++;
      console.log(`| \`${sb.code}\` | **${sb.label}** | \`${sb.url}\` | \`<i class="fa ${sb.icon}"></i>\` | \`${sb.required_perm || '*'}\` | ❌ Missing from Topnav |`);
    }
  }

  console.log(`\n**Total Sidebar Items:** ${sidebarItems.length}`);
  console.log(`**Missing from Top Navigation Pane:** ${missingCount}`);
  
  console.log('\n---\n');
  console.log('### Detailed Comparison Table\n');
  console.log('| Sidebar Item | Topnav Match | URL | Description / Notes |');
  console.log('| --- | --- | --- | --- |');
  
  for (const sb of sidebarItems) {
    const sbUrl = normalizeUrl(sb.url);
    const matches = topnavItems.filter(tn => normalizeUrl(tn.url) === sbUrl);
    
    if (matches.length > 0) {
      const matchLabel = matches.map(m => `${m.label} (\`${m.code}\`)`).join(', ');
      console.log(`| **${sb.label}** (\`${sb.code}\`) | ✅ ${matchLabel} | \`${sb.url}\` | Matches top navigation |`);
    } else {
      console.log(`| **${sb.label}** (\`${sb.code}\`) | ❌ None | \`${sb.url}\` | Unique to sidebar |`);
    }
  }
}

run().catch(console.error);
