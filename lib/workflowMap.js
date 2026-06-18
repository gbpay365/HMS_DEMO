'use strict';

/**
 * Clinical workflow map (OPD/IPD) from tbl_workflow_step_roles.
 * Used by Workflow Designer and Workflow Guides — does not grant permissions.
 */

async function loadWorkflowDesignerRows(pool) {
  const [rows] = await pool.query(
    `SELECT workflow, step_key, step_label, step_order, step_color, portal_codes, is_custom
     FROM tbl_workflow_step_roles
     ORDER BY workflow, step_order`
  );
  const opd = [];
  const ipd = [];
  for (const r of rows) {
    r.portals = String(r.portal_codes || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (r.workflow === 'opd') opd.push(r);
    else if (r.workflow === 'ipd') ipd.push(r);
  }
  return { opd, ipd, rows };
}

/** Build staff-facing guide steps from DB (portal labels, not duplicate permission grants). */
async function loadWorkflowForGuides(pool) {
  const { rows } = await loadWorkflowDesignerRows(pool);
  const [portals] = await pool.query('SELECT code, label FROM tbl_acl_portal').catch(() => [[]]);
  const [rolePortals] = await pool.query(
    'SELECT role, portal_code FROM tbl_acl_role_portal'
  ).catch(() => [[]]);
  const [roles] = await pool.query(
    `SELECT t.role, t.title FROM tbl_role t
     INNER JOIN (SELECT role, MIN(id) AS id FROM tbl_role GROUP BY role) m ON m.id = t.id`
  ).catch(() => [[]]);

  const plMap = Object.fromEntries(portals.map((p) => [p.code, p.label]));
  const roleTitle = Object.fromEntries(roles.map((r) => [String(r.role), r.title]));
  const portalToRoles = new Map();
  for (const rp of rolePortals) {
    const pc = String(rp.portal_code);
    if (!portalToRoles.has(pc)) portalToRoles.set(pc, []);
    portalToRoles.get(pc).push(String(rp.role));
  }

  const steps = { opd: [], ipd: [], emg: [] };

  for (const r of rows) {
    const wf = r.workflow === 'ipd' ? 'ipd' : r.workflow === 'emg' ? 'emg' : 'opd';
    if (!steps[wf]) steps[wf] = [];
    const portalCodes = String(r.portal_codes || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const roleIds = new Set();
    for (const pc of portalCodes) {
      for (const rid of portalToRoles.get(pc) || []) roleIds.add(rid);
    }
    const roleLabel =
      portalCodes.map((pc) => plMap[pc] || pc).join(' · ') || 'Assign a portal on this step';
    const roleNames = [...roleIds]
      .map((id) => roleTitle[id] || `Role ${id}`)
      .filter(Boolean)
      .join(', ');

    steps[wf].push({
      num: String(r.step_order),
      roleLabel,
      roleIds: [...roleIds].join(','),
      action: r.step_label,
      module: roleNames ? `Staff: ${roleNames}` : 'Configure portals in Workflow Designer',
      perms: 'Grant capabilities in Access Control → Roles (not here)',
      portalCodes,
    });
  }

  return { steps, plMap };
}

module.exports = {
  loadWorkflowDesignerRows,
  loadWorkflowForGuides,
};
