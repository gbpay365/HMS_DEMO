import { useTranslation } from 'react-i18next';
import { aclRoleLabel } from '../../lib/aclI18n';
import { aclPost } from '../../lib/aclApi';
import { notifyError } from '../../lib/notifyBridge';

export function AclPortalsPanel({ selRole, selRoleTitle, isCoreRole, rolePortalRows = [] }) {
  const { t } = useTranslation(['access', 'superAdmin']);
  if (!selRole) {
    return <p className="py-8 text-center text-sm text-slate-500">{t('roles.select_prompt')}</p>;
  }

  if (isCoreRole) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {t('portals.intro')}
      </p>
    );
  }

  const toggleAssign = (code, assign, el) => {
    el.disabled = true;
    aclPost(assign ? 'portal_assign' : 'portal_unassign', { role_val: selRole, portal_code: code })
      .then((j) => {
        if (!j.ok) throw new Error(j.error || t('shared.failed'));
        window.location.reload();
      })
      .catch(() => {
        el.checked = !assign;
        el.disabled = false;
      });
  };

  const setHome = (code) => {
    aclPost('portal_set_home', { role_val: selRole, portal_code: code }).then((j) => {
      if (j.ok) window.location.reload();
      else notifyError(j.error || t('shared.failed'));
    });
  };

  return (
    <>
      <p className="mb-4 text-sm text-slate-500">
        {t('portals.hint', { role: aclRoleLabel(selRole, selRoleTitle, t) })}
      </p>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">{t('shared.portal')}</th>
              <th className="px-4 py-3 text-center">{t('shared.access')}</th>
              <th className="px-4 py-3 text-center">{t('shared.home')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rolePortalRows.map((pr) => (
              <tr key={pr.code} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-800">{pr.label}</div>
                  <code className="text-xs text-slate-400">{pr.code}</code>
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    defaultChecked={!!pr.assigned}
                    onChange={(ev) => toggleAssign(pr.code, ev.target.checked, ev.target)}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="radio"
                    name="acl_home_portal"
                    defaultChecked={!!pr.is_home}
                    disabled={!pr.assigned}
                    onChange={() => setHome(pr.code)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">{t('portals.home_hint')}</p>
    </>
  );
}
