export async function aclPost(action, data) {
  const body = new URLSearchParams();
  body.set('action', action);
  Object.entries(data || {}).forEach(([k, v]) => {
    if (v != null) body.set(k, v);
  });
  const r = await fetch('/access-control/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
    credentials: 'same-origin'});
  return r.json();
}

export function auditActionClass(action) {
  const a = String(action || '');
  if (/^grant$|portal_assign|portal_set_home|role_add|perm_add|ui_show/.test(a)) return 'success';
  if (/^revoke$|portal_unassign|role_delete|perm_delete|ui_hide/.test(a)) return 'danger';
  if (/_edit$/.test(a)) return 'info';
  if (/^wf_/.test(a)) return 'warning';
  return 'secondary';
}
