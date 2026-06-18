import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hubItemLabel } from '../../lib/hubI18n';
import { aclRoleLabel, navLabel } from '../../lib/aclI18n';
import { aclPost } from '../../lib/aclApi';
import { notifyError } from '../../lib/notifyBridge';
import { AclSwitch } from './AclSwitch';

function ToggleRow({ item, shell, role, onReload }) {
  const { t } = useTranslation(['access', 'legacy', 'superAdmin']);
  const label = hubItemLabel(item.code, item.label, t);
  const toggle = (ev) => {
    const show = ev.target.checked;
    ev.target.disabled = true;
    aclPost(show ? 'ui_show' : 'ui_hide', { role_val: role, element_code: item.code })
      .then((j) => {
        if (!j.ok) throw new Error(j.error || t('shared.failed'));
      })
      .catch(() => {
        ev.target.checked = !show;
      })
      .finally(() => {
        ev.target.disabled = false;
      });
  };

  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm ${
        item.isHidden ? 'bg-slate-50 text-slate-400' : 'bg-white text-slate-800'
      }`}
    >
      <AclSwitch checked={!item.isHidden} onChange={toggle} />
      <span className="font-semibold">{label}</span>
      <code className="ml-auto text-[10px] text-slate-400">{item.code}</code>
    </label>
  );
}

function MenuCard({ menu, shell, role }) {
  const { t } = useTranslation(['access', 'nav']);
  const toggle = (code, ev) => {
    const show = ev.target.checked;
    ev.target.disabled = true;
    aclPost(show ? 'ui_show' : 'ui_hide', { role_val: role, element_code: code })
      .then((j) => {
        if (!j.ok) throw new Error(j.error || t('shared.failed'));
      })
      .catch(() => {
        ev.target.checked = !show;
      })
      .finally(() => {
        ev.target.disabled = false;
      });
  };

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${
        menu.parent.isHidden ? 'opacity-55' : ''
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-sm font-bold text-slate-800">{navLabel(menu.parent.code, menu.parent.label, t)}</span>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          {t('nav_studio.menu')}
          <AclSwitch checked={!menu.parent.isHidden} onChange={(ev) => toggle(menu.parent.code, ev)} />
        </label>
      </div>
      <div className="space-y-1 p-2">
        {(menu.children || []).map((ch) => (
          <label key={ch.code} className={`flex items-center gap-2 text-sm ${ch.isHidden ? 'text-slate-400' : ''}`}>
            <AclSwitch checked={!ch.isHidden} onChange={(ev) => toggle(ch.code, ev)} />
            <span>{navLabel(ch.code, ch.label, t)}</span>
          </label>
        ))}
      </div>
      <div className="border-t border-slate-100 px-3 py-1 text-[10px] text-slate-400">
        <code>{menu.parent.code}</code>
      </div>
    </div>
  );
}

export function AclNavStudioPanel({
  selRole,
  selRoleTitle,
  navStudioHmsHub = {},
  navStudioDashboard = {},
  navStudioAccounting = {},
  navStudioTopnav = {},
  navStudioSidebar = {}}) {
  const { t } = useTranslation('access');
  const [tab, setTab] = useState('hms_hub');
  const [studioOpen, setStudioOpen] = useState(false);

  const studioTabs = useMemo(
    () => [
      { id: 'hms_hub', label: t('nav_studio.tab_hms_hub'), icon: 'fa-hospital-o' },
      { id: 'dashboard', label: t('nav_studio.tab_dashboard'), icon: 'fa-dashboard' },
      { id: 'accounting', label: t('nav_studio.tab_accounting'), icon: 'fa-calculator' },
      { id: 'topnav', label: t('nav_studio.tab_topnav'), icon: 'fa-navicon' },
      { id: 'sidebar', label: t('nav_studio.tab_sidebar'), icon: 'fa-bars' },
    ],
    [t]
  );

  const bulkShell = (shell, show) => {
    aclPost('ui_bulk_shell', { role_val: selRole, shell, show: show ? '1' : '0' }).then((j) => {
      if (j.ok) window.location.reload();
      else notifyError(j.error || t('nav_studio.bulk_failed'));
    });
  };

  const renderHub = () => {
    const hub = navStudioHmsHub || {};
    const stats = hub.stats || [];
    const cards = hub.cards || [];
    const sections = hub.sections || [];
    if (!stats.length && !cards.length && !sections.length) {
      return (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('nav_studio.hub_empty')}
        </p>
      );
    }
    return (
      <div className="space-y-4">
        {stats.length ? (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t('nav_studio.kpi_stats')}</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((st) => (
                <ToggleRow key={st.code} item={st} shell="hms_hub" role={selRole} />
              ))}
            </div>
          </div>
        ) : null}
        {cards.length ? (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t('nav_studio.module_cards')}</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((c) => (
                <ToggleRow key={c.code} item={c} shell="hms_hub" role={selRole} />
              ))}
            </div>
          </div>
        ) : null}
        {sections.length ? (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t('nav_studio.side_panels')}</p>
            <div className="space-y-2">
              {sections.map((s) => (
                <ToggleRow key={s.code} item={s} shell="hms_hub" role={selRole} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderDashboard = () => {
    const dash = navStudioDashboard || {};
    const groupMap = {
      Toolbar: t('nav_studio.group_toolbar'),
      'Stat cards': t('nav_studio.group_stat_cards'),
      Panels: t('nav_studio.group_panels')};
    const items = [
      ...(dash.buttons || []).map((x) => ({ ...x, group: groupMap.Toolbar })),
      ...(dash.cards || []).map((x) => ({ ...x, group: groupMap['Stat cards'] })),
      ...(dash.sections || []).map((x) => ({ ...x, group: groupMap.Panels })),
    ];
    if (!items.length) {
      return (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('nav_studio.dash_empty')}
        </p>
      );
    }
    return (
      <div className="space-y-2">
        {items.map((it) => (
          <ToggleRow key={it.code} item={it} shell="dashboard" role={selRole} />
        ))}
      </div>
    );
  };

  const renderMenus = (pack, shell) => {
    const menus = pack.menus || [];
    const links = pack.primaryLinks || [];
    if (!menus.length && !links.length) {
      return (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('nav_studio.items_empty')}
        </p>
      );
    }
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {menus.map((m) => (
            <MenuCard key={m.parent.code} menu={m} shell={shell} role={selRole} />
          ))}
        </div>
        {links.length ? (
          <div className="mt-4 space-y-2">
            {links.map((lk) => (
              <ToggleRow key={lk.code} item={lk} shell={shell} role={selRole} />
            ))}
          </div>
        ) : null}
      </>
    );
  };

  const renderSidebar = () => {
    const sections = navStudioSidebar?.sections || [];
    if (!sections.length) {
      return (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('nav_studio.sidebar_empty')}
        </p>
      );
    }
    return sections.map((sec) => (
      <div key={sec.label} className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
          {navLabel(sec.code, sec.label, t)}
        </div>
        <table className="min-w-full text-sm">
          <tbody>
            {(sec.items || []).map((it) => (
              <tr key={it.code} className={it.isHidden ? 'bg-slate-50 text-slate-400' : ''}>
                <td className="w-12 px-3 py-2 text-center">
                  <AclSwitch
                    checked={!it.isHidden}
                    onChange={(ev) => {
                      const show = ev.target.checked;
                      ev.target.disabled = true;
                      aclPost(show ? 'ui_show' : 'ui_hide', { role_val: selRole, element_code: it.code })
                        .then((j) => {
                          if (!j.ok) throw new Error();
                        })
                        .catch(() => {
                          ev.target.checked = !show;
                        })
                        .finally(() => {
                          ev.target.disabled = false;
                        });
                    }}
                  />
                </td>
                <td className="px-3 py-2 font-semibold">{navLabel(it.code, it.label, t)}</td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  <code>{it.required_perm || '*'}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ));
  };

  const panelByTab = {
    hms_hub: renderHub(),
    dashboard: renderDashboard(),
    accounting: renderMenus(navStudioAccounting, 'accounting'),
    topnav: renderMenus(navStudioTopnav, 'topnav'),
    sidebar: renderSidebar()};

  return (
    <details
      className="mt-4 rounded-xl border border-slate-200 bg-white"
      open={studioOpen}
      onToggle={(ev) => setStudioOpen(ev.target.open)}
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-700">
        {t('nav_studio.summary', { role: aclRoleLabel(selRole, selRoleTitle, t) })}
      </summary>
      <div className="border-t border-slate-100 p-4">
        <p className="mb-3 text-sm text-slate-500">{t('nav_studio.hint')}</p>
        <a
          href={`/hms?preview_role=${selRole}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-dark hover:underline"
        >
          {t('nav_studio.preview_hub')}
        </a>

        <div className="mb-3 flex flex-wrap gap-2">
          {studioTabs.map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setTab(tabItem.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                tab === tabItem.id ? 'bg-brand-dark text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <i className={`fa ${tabItem.icon} mr-1`} aria-hidden="true" />
              {tabItem.label}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button type="button" className="hms-btn-secondary text-xs" onClick={() => bulkShell(tab, true)}>
              {t('nav_studio.show_all')}
            </button>
            <button type="button" className="hms-btn-secondary text-xs" onClick={() => bulkShell(tab, false)}>
              {t('nav_studio.hide_all')}
            </button>
          </div>
        </div>

        {panelByTab[tab]}
      </div>
    </details>
  );
}
