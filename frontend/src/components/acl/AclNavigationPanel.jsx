import { useTranslation } from 'react-i18next';
import { aclPost } from '../../lib/aclApi';
import { navLabel } from '../../lib/aclI18n';
import { confirmModal } from '../../lib/modalBridge';
import { notifyError } from '../../lib/notifyBridge';
import { AclSwitch } from './AclSwitch';
import { AclNavStudioPanel } from './AclNavStudioPanel';

function NavSection({ section, selRole, onReload }) {
  const { t } = useTranslation('access');
  const toggle = (code, bundle, ev) => {
    const grant = ev.target.checked;
    ev.target.disabled = true;
    const act = bundle ? 'nav_grant_bundle' : 'nav_toggle';
    aclPost(act, { role_val: selRole, nav_code: code, grant: grant ? '1' : '0' })
      .then((j) => {
        if (!j.ok) throw new Error(j.error || t('shared.failed'));
        onReload();
      })
      .catch(() => {
        ev.target.checked = !grant;
      })
      .finally(() => {
        ev.target.disabled = false;
      });
  };

  const grantSection = () => {
    aclPost('nav_grant_bundle', { role_val: selRole, nav_code: section.code, grant: '1' }).then((j) => {
      if (j.ok) onReload();
      else notifyError(j.error || t('shared.failed'));
    });
  };

  const color = section.color || '#714b67';

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"
        style={{ borderLeftWidth: 4, borderLeftColor: color }}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: `${color}22`, color }}
          >
            <i className={`fa ${section.icon || 'fa-folder'}`} aria-hidden="true" />
          </span>
          <div>
            <div className="font-bold text-slate-800">{navLabel(section.code, section.label, t)}</div>
            <div className="text-xs text-slate-500">{t('navigation.top_bar_section')}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="hms-btn-secondary text-xs" onClick={grantSection}>
            {t('navigation.all_in_section')}
          </button>
          <AclSwitch checked={!!section.granted} onChange={(ev) => toggle(section.code, true, ev)} />
        </div>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
        {(section.children || []).map((ch) => (
          <label
            key={ch.code}
            className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
          >
            <span className="text-sm font-semibold text-slate-700">{navLabel(ch.code, ch.label, t)}</span>
            <AclSwitch checked={!!ch.granted} onChange={(ev) => toggle(ch.code, false, ev)} />
          </label>
        ))}
      </div>
    </div>
  );
}

export function AclNavigationPanel({
  selRole,
  selRoleTitle,
  isCoreRole,
  navAccessTree = [],
  navGrantMode = false,
  navGrantCount = 0,
  navStudioHmsHub,
  navStudioDashboard,
  navStudioAccounting,
  navStudioTopnav,
  navStudioSidebar}) {
  const { t } = useTranslation('access');
  if (!selRole) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">{t('navigation.select_prompt')}</p>
    );
  }

  if (isCoreRole) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {t('navigation.intro')}
      </p>
    );
  }

  const reload = () => window.location.reload();

  const grantAll = () => {
    const codes = (navAccessTree || []).map((s) => s.code);
    let chain = Promise.resolve();
    codes.forEach((c) => {
      chain = chain.then(() =>
        aclPost('nav_grant_bundle', { role_val: selRole, nav_code: c, grant: '1' })
      );
    });
    chain.then(() => reload()).catch((e) => notifyError(e.message || t('shared.failed')));
  };

  const revokeAll = async () => {
    const ok = await confirmModal({
      title: t('navigation.revoke_all_title'),
      message: t('navigation.confirm_revoke_all'),
      confirmLabel: t('navigation.revoke_all_btn'),
      tone: 'danger'});
    if (!ok) return;
    aclPost('nav_revoke_all', { role_val: selRole }).then((j) => {
      if (j.ok) reload();
      else notifyError(j.error || t('shared.failed'));
    });
  };

  return (
    <>
      <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        {t('navigation.hint')}
      </div>

      {navGrantMode ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {t(navGrantCount === 1 ? 'navigation.nav_only_one' : 'navigation.nav_only_many', { count: navGrantCount })}
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('navigation.legacy_hint')}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className="hms-btn-secondary text-xs" onClick={grantAll}>
          {t('navigation.grant_all_sections')}
        </button>
        <button type="button" className="hms-btn-secondary text-xs" onClick={revokeAll}>
          {t('navigation.clear_all')}
        </button>
        <a
          href={`/hms?preview_role=${selRole}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto hms-btn-primary text-xs"
        >
          {t('navigation.preview_menus')}
        </a>
      </div>

      {(navAccessTree || []).map((section) => (
        <NavSection key={section.code} section={section} selRole={selRole} onReload={reload} />
      ))}

      <AclNavStudioPanel
        selRole={selRole}
        selRoleTitle={selRoleTitle}
        navStudioHmsHub={navStudioHmsHub}
        navStudioDashboard={navStudioDashboard}
        navStudioAccounting={navStudioAccounting}
        navStudioTopnav={navStudioTopnav}
        navStudioSidebar={navStudioSidebar}
      />
    </>
  );
}
