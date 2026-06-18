import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { aclRoleLabel } from '../lib/aclI18n';
import { AclAuditPanel } from '../components/acl/AclAuditPanel';
import { AclCataloguePanel } from '../components/acl/AclCataloguePanel';
import { AclNavigationPanel } from '../components/acl/AclNavigationPanel';
import { AclPermissionsPanel } from '../components/acl/AclPermissionsPanel';
import { AclPortalCatalogPanel } from '../components/acl/AclPortalCatalogPanel';
import { AclPortalsPanel } from '../components/acl/AclPortalsPanel';
import { AclWorkflowPanel } from '../components/acl/AclWorkflowPanel';

const TAB_KEYS = [
  { id: 'permissions', labelKey: 'tabs.permissions', icon: 'fa-key' },
  { id: 'navigation', labelKey: 'tabs.navigation', icon: 'fa-compass' },
  { id: 'workflow', labelKey: 'tabs.workflow', icon: 'fa-sitemap' },
  { id: 'portals', labelKey: 'tabs.portals', icon: 'fa-link' },
  { id: 'portal-catalog', labelKey: 'tabs.portal_catalog', icon: 'fa-th-large' },
  { id: 'catalogue', labelKey: 'tabs.catalogue', icon: 'fa-cog' },
  { id: 'audit', labelKey: 'tabs.audit', icon: 'fa-history' },
];

const ROLE_OPTIONAL_VIEWS = new Set(['workflow', 'portal-catalog', 'catalogue', 'audit']);

export function HmsAdminAccessPageApp(props) {
  const {
    roles = [],
    selRole = '',
    selRoleTitle = '',
    view = 'permissions',
    permModuleRw = [],
    assignedPermIds = [],
    rolePortalRows = [],
    aclRoleSummary = null,
    navGrantCount = 0,
    navAccessTree = [],
    navGrantMode = false,
    auditRows = [],
    auditFilter = {},
    auditActionOptions = [],
    allPermsGrouped = [],
    allRoles = [],
    portalCatalog = [],
    portals = [],
    opdSteps = [],
    ipdSteps = [],
    emgSteps = [],
    plMap = {},
    navStudioHmsHub,
    navStudioDashboard,
    navStudioAccounting,
    navStudioTopnav,
    navStudioSidebar,
    flash = null,
    error = null,
    isCoreRole = false,
    isSuperAdmin = false} = props;

  const { t } = useTranslation(['access', 'superAdmin']);
  const [roleSearch, setRoleSearch] = useState('');

  useEffect(() => {
    const hashMap = {
      'section-modules': 'permissions',
      'section-navigation': 'navigation',
      'section-workflow': 'workflow',
      'section-setup': 'catalogue',
      'section-audit': 'audit',
    };
    const raw = window.location.hash.replace(/^#/, '');
    const mapped = hashMap[raw];
    if (!mapped) return;
    const u = new URL(window.location.href);
    if (u.searchParams.get('view') === mapped) {
      u.hash = '';
      window.history.replaceState(null, '', u.toString());
      return;
    }
    u.hash = '';
    u.searchParams.set('view', mapped);
    window.location.replace(u.toString());
  }, []);

  const displayRoleTitle = selRole ? aclRoleLabel(selRole, selRoleTitle, t) : '';

  const filteredRoles = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => `${r.role} ${r.title}`.toLowerCase().includes(q));
  }, [roles, roleSearch]);

  const tabUrl = (v, role) => {
    const params = new URLSearchParams();
    if (role) params.set('role', role);
    params.set('view', v);
    return `/hms-admin/access?${params.toString()}`;
  };

  const needsRole = !ROLE_OPTIONAL_VIEWS.has(view) && !selRole;

  return (
    <div className="flex min-h-screen flex-col font-sans">
      <FlashMessages flash={flash} error={error} />

      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 shadow-sm">
        <a href="/dashboard" className="text-sm font-bold text-brand-dark hover:text-brand">
          <i className="fa fa-cube mr-1" aria-hidden="true" /> ZAIZENS
        </a>
        <span className="text-sm text-slate-500">/ {t('header.breadcrumb')}</span>
        <div className="ml-auto flex gap-2">
          <a href="/workflow-guides" className="hms-btn-secondary text-xs">
            <i className="fa fa-book mr-1" aria-hidden="true" />
            {t('header.staff_guides')}
          </a>
          {isSuperAdmin ? (
            <a href="/super-admin" className="hms-btn-secondary text-xs">
              <i className="fa fa-shield mr-1" aria-hidden="true" />
              {t('header.super_admin')}
            </a>
          ) : null}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[260px_1fr]">
        <aside className="flex flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-3">
            <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('roles.title')}</h2>
            <label htmlFor="acl-role-search" className="sr-only">
              {t('roles.search_ph')}
            </label>
            <input
              id="acl-role-search"
              type="search"
              className="hms-input w-full text-sm"
              placeholder={t('roles.search_ph')}
              aria-label={t('roles.search_ph')}
              value={roleSearch}
              onChange={(ev) => setRoleSearch(ev.target.value)}
              autoComplete="off"
            />
          </div>
          <nav className="flex-1 overflow-y-auto p-2">
            {filteredRoles.map((r) => (
              <a
                key={r.role}
                href={tabUrl(view, r.role)}
                className={`mb-1 block rounded-lg border px-3 py-2 no-underline transition ${
                  String(selRole) === String(r.role)
                    ? 'border-brand-light bg-brand-light text-brand-dark'
                    : 'border-transparent text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-sm font-semibold">{aclRoleLabel(r.role, r.title, t)}</div>
                <div className="font-mono text-[10px] text-slate-400">#{r.role}</div>
              </a>
            ))}
          </nav>
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <h1 className="text-base font-bold text-slate-900">{displayRoleTitle || t('header.default_title')}</h1>
            <nav className="ml-auto flex flex-wrap gap-1">
              {TAB_KEYS.map((tab) => (
                <a
                  key={tab.id}
                  href={tabUrl(tab.id, selRole)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold no-underline ring-1 ring-inset transition ${
                    view === tab.id
                      ? 'bg-brand text-white ring-brand'
                      : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <i className={`fa ${tab.icon}`} aria-hidden="true" /> {t(tab.labelKey)}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex-1 overflow-y-auto bg-transparent p-4 hms-surface-module">
            {needsRole ? (
              <p className="py-12 text-center text-sm text-slate-500">{t('roles.select_prompt')}</p>
            ) : null}

            {view === 'permissions' && selRole ? (
              <AclPermissionsPanel
                selRole={selRole}
                isCoreRole={isCoreRole}
                permModuleRw={permModuleRw}
                assignedPermIds={assignedPermIds}
                aclRoleSummary={aclRoleSummary}
                navGrantCount={navGrantCount}
              />
            ) : null}

            {view === 'navigation' ? (
              <AclNavigationPanel
                selRole={selRole}
                selRoleTitle={selRoleTitle}
                isCoreRole={isCoreRole}
                navAccessTree={navAccessTree}
                navGrantMode={navGrantMode}
                navGrantCount={navGrantCount}
                navStudioHmsHub={navStudioHmsHub}
                navStudioDashboard={navStudioDashboard}
                navStudioAccounting={navStudioAccounting}
                navStudioTopnav={navStudioTopnav}
                navStudioSidebar={navStudioSidebar}
              />
            ) : null}

            {view === 'workflow' ? (
              <AclWorkflowPanel
                portals={portals}
                opdSteps={opdSteps}
                ipdSteps={ipdSteps}
                emgSteps={emgSteps}
                plMap={plMap}
              />
            ) : null}

            {view === 'portals' && selRole ? (
              <AclPortalsPanel
                selRole={selRole}
                selRoleTitle={selRoleTitle}
                isCoreRole={isCoreRole}
                rolePortalRows={rolePortalRows}
              />
            ) : null}

            {view === 'portal-catalog' ? (
              <AclPortalCatalogPanel portalCatalog={portalCatalog} selRole={selRole} selRoleTitle={selRoleTitle} />
            ) : null}

            {view === 'catalogue' ? (
              <AclCataloguePanel allPermsGrouped={allPermsGrouped} allRoles={allRoles} roles={roles} />
            ) : null}

            {view === 'audit' ? (
              <AclAuditPanel
                auditRows={auditRows}
                auditFilter={auditFilter}
                auditActionOptions={auditActionOptions}
                allRoles={allRoles}
                selRole={selRole}
              />
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
