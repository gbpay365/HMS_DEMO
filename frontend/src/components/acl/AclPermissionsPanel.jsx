import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { aclModuleLabel, aclPermLabel } from '../../lib/aclI18n';
import { aclPost } from '../../lib/aclApi';
import { AclSwitch } from './AclSwitch';

export function AclPermissionsPanel({
  selRole,
  isCoreRole,
  permModuleRw = [],
  assignedPermIds = [],
  aclRoleSummary = null,
  navGrantCount = 0}) {
  const { t } = useTranslation('access');
  const assignedSet = useMemo(() => new Set(assignedPermIds || []), [assignedPermIds]);

  const togglePerm = (permId, grant, el) => {
    el.disabled = true;
    aclPost(grant ? 'grant' : 'revoke', { role_val: selRole, permission_id: permId })
      .then((j) => {
        if (!j.ok) throw new Error(j.error || t('shared.failed'));
      })
      .catch(() => {
        el.checked = !grant;
      })
      .finally(() => {
        el.disabled = false;
      });
  };

  if (!selRole) {
    return <p className="py-8 text-center text-sm text-slate-500">{t('roles.select_prompt')}</p>;
  }

  if (isCoreRole) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {t('permissions.intro')}
      </p>
    );
  }

  return (
    <>
      <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        {t('permissions.hint')}
      </div>

      {aclRoleSummary ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-2xl font-extrabold text-brand-dark">
              {aclRoleSummary.permissionsGranted}/{aclRoleSummary.permissionsTotal}
            </div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('permissions.capabilities')}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-2xl font-extrabold text-brand-dark">{navGrantCount}</div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('permissions.nav_bundles')}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-2xl font-extrabold text-brand-dark">{aclRoleSummary.portalsAllowed}</div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('permissions.portals_kpi')}</div>
          </div>
        </div>
      ) : null}

      {permModuleRw.map((mod) => {
        const meta = mod.meta || {};
        const code = meta.code || mod.code || 'misc';
        const label = aclModuleLabel(code, meta.label || mod.label || code, t);
        const color = meta.color || '#475569';
        const icon = meta.icon || 'fa-cube';
        const items = [...(mod.readItems || []), ...(mod.writeItems || []), ...(mod.otherItems || [])];

        return (
          <div key={code} className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
                style={{ background: color }}
              >
                <i className={`fa ${icon}`} aria-hidden="true" />
              </span>
              <span className="flex-1 font-bold text-slate-800">{label}</span>
              <button
                type="button"
                className="hms-btn-secondary text-xs"
                onClick={() =>
                  aclPost('bulk_module_perms', { role_val: selRole, module_code: code, grant: '1' }).then(() =>
                    window.location.reload()
                  )
                }
              >
                {t('permissions.grant_all')}
              </button>
              <button
                type="button"
                className="text-xs font-semibold text-red-600 hover:underline"
                onClick={() =>
                  aclPost('bulk_module_perms', { role_val: selRole, module_code: code, grant: '0' }).then(() =>
                    window.location.reload()
                  )
                }
              >
                {t('permissions.revoke_all')}
              </button>
            </div>
            <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between border-b border-r border-slate-100 px-4 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium text-slate-800">{aclPermLabel(p.code, p.label, t)}</span>
                    <code className="mt-0.5 block text-[10px] text-slate-400">{p.code}</code>
                  </span>
                  <AclSwitch
                    checked={assignedSet.has(p.id)}
                    onChange={(ev) => togglePerm(p.id, ev.target.checked, ev.target)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
