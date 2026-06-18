'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../routes/staff.js'), 'utf8');
const start = src.indexOf('// Resolve display info for any module_code');
const end = src.indexOf('res.render(\'access-control\'');
if (start < 0 || end < 0) throw new Error('markers not found');
const head = `const [roles, portals, allPerms, allRoles, wfRows, modules] = await Promise.all([
            sq(\`SELECT t.role, t.title
                  FROM tbl_role t
                  INNER JOIN (SELECT role, MIN(id) AS id FROM tbl_role GROUP BY role) m
                          ON m.id = t.id
                 WHERE t.role NOT IN ('1','99')
                 ORDER BY CAST(t.role AS UNSIGNED)\`),
            sq('SELECT code, label FROM tbl_acl_portal ORDER BY sort_order'),
            sq('SELECT * FROM tbl_acl_permission ORDER BY module_code, action, label'),
            sq(\`SELECT t.role, t.title
                  FROM tbl_role t
                  INNER JOIN (SELECT role, MIN(id) AS id FROM tbl_role GROUP BY role) m
                          ON m.id = t.id
                 ORDER BY t.title\`),
            sq('SELECT * FROM tbl_workflow_step_roles ORDER BY workflow, step_order'),
            sq('SELECT code, label, icon, color, sort_order FROM tbl_acl_module ORDER BY sort_order, label')
                .catch(() => []),
        ]);
`;
const body = src.slice(start, end);
const out = `'use strict';

async function loadAccessControlContext(pool, query = {}) {
    async function sq(sql, params = []) {
        const [rows] = await pool.query(sql, params);
        return rows;
    }

        ${head}
        ${body.replace(/req\.query/g, 'query')}
    return {
        roles, portals, plMap,
        allPerms, allRoles,
        modules: modules || [],
        allPermsGrouped,
        assignedPermsGrouped, availablePermsGrouped,
        opdSteps, ipdSteps, emgSteps,
        selRole, selRoleTitle, assignedPerms, availablePerms,
        uiPortalTilesGrouped,
        uiGlobalSidebar,
        uiTopNavMenus,
        uiActionMenusGrouped,
        rolePortalRows,
        aclRoleSummary,
        navStudioSidebar,
        navStudioTopnav,
        navStudioAccounting,
        auditRows, auditActionOptions, auditFilter,
    };
}

module.exports = { loadAccessControlContext };
`;
fs.writeFileSync(path.join(__dirname, '../lib/loadAccessControlContext.js'), out);
console.log('written', out.length);
