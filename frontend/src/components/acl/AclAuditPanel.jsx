import { useTranslation } from 'react-i18next';
import { aclRoleLabel } from '../../lib/aclI18n';
import { auditActionClass } from '../../lib/aclApi';

const BADGE_CLASS = {
  success: 'bg-emerald-100 text-emerald-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-sky-100 text-sky-800',
  warning: 'bg-amber-100 text-amber-800',
  secondary: 'bg-slate-100 text-slate-700'};

export function AclAuditPanel({
  auditRows = [],
  auditFilter = {},
  auditActionOptions = [],
  allRoles = [],
  selRole = ''}) {
  const { t } = useTranslation(['access', 'superAdmin']);

  const exportCsv = () => {
    const qs = new URLSearchParams();
    if (auditFilter.role) qs.set('audit_role', auditFilter.role);
    if (auditFilter.action) qs.set('audit_action', auditFilter.action);
    if (auditFilter.actor) qs.set('audit_actor', auditFilter.actor);
    qs.set('audit_limit', String(auditFilter.limit || 500));
    window.location.href = `/access-control/audit-export.csv?${qs.toString()}`;
  };

  const filterUrl = (params) => {
    const p = new URLSearchParams();
    if (selRole) p.set('role', selRole);
    p.set('view', 'audit');
    Object.entries(params).forEach(([k, v]) => {
      if (v) p.set(k, v);
    });
    return `/hms-admin/access?${p.toString()}`;
  };

  const isFiltered = !!(auditFilter.role || auditFilter.action || auditFilter.actor);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-800">{t('audit.title')}</h2>
          <p className="text-sm text-slate-500">{t('audit.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <a href={filterUrl({})} className="hms-btn-secondary text-xs">
            {t('shared.refresh')}
          </a>
          <button type="button" className="hms-btn-primary text-xs" onClick={exportCsv}>
            {t('shared.export_csv')}
          </button>
        </div>
      </div>

      <form
        method="get"
        action="/hms-admin/access"
        className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <input type="hidden" name="role" value={selRole} />
        <input type="hidden" name="view" value="audit" />
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500">{t('shared.role')}</label>
          <select name="audit_role" defaultValue={auditFilter.role || ''} className="hms-input w-full text-sm">
            <option value="">{t('shared.all_roles')}</option>
            {allRoles.map((r) => (
              <option key={r.role} value={r.role}>
                {aclRoleLabel(r.role, r.title, t)} (#{r.role})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500">{t('shared.action')}</label>
          <select name="audit_action" defaultValue={auditFilter.action || ''} className="hms-input w-full text-sm">
            <option value="">{t('shared.all_actions')}</option>
            {auditActionOptions.map((a) => (
              <option key={a.action} value={a.action}>
                {a.action} ({a.n})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500">{t('shared.actor')}</label>
          <input
            name="audit_actor"
            defaultValue={auditFilter.actor || ''}
            className="hms-input w-full text-sm"
            placeholder={t('audit.actor_ph')}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500">{t('audit.show')}</label>
          <select name="audit_limit" defaultValue={String(auditFilter.limit || 100)} className="hms-input w-full text-sm">
            {[50, 100, 200, 500, 1000, 2000].map((n) => (
              <option key={n} value={n}>
                {t('shared.show_last', { n })}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="hms-btn-primary w-full text-sm">
            {t('shared.filter')}
          </button>
        </div>
      </form>

      {!auditRows.length ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          {t('audit.empty')}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">{t('shared.when')}</th>
                  <th className="px-4 py-3 text-left">{t('shared.actor')}</th>
                  <th className="px-4 py-3 text-left">{t('shared.action')}</th>
                  <th className="px-4 py-3 text-left">{t('shared.role')}</th>
                  <th className="px-4 py-3 text-left">{t('shared.target')}</th>
                  <th className="px-4 py-3 text-left">{t('shared.detail')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditRows.map((a) => {
                  const bucket = auditActionClass(a.action);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                        {a.created_at ? new Date(a.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {a.actor_name ? (
                          <>
                            <span className="font-semibold">{a.actor_name}</span>
                            {a.actor_id ? <span className="text-xs text-slate-400"> #{a.actor_id}</span> : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${BADGE_CLASS[bucket]}`}>
                          {a.action}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {a.role ? <code className="text-xs">#{a.role}</code> : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {a.target ? <code className="text-xs">{a.target}</code> : '—'}
                      </td>
                      <td className="max-w-xs truncate px-4 py-2 text-xs text-slate-500" title={a.detail || ''}>
                        {a.detail || ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            {t('audit.showing', { count: auditRows.length })}
            {isFiltered ? t('audit.filtered') : ''}.
          </p>
        </div>
      )}
    </>
  );
}
