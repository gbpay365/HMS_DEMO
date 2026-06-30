import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionMenu } from '../components/ActionMenu';
import { FlashMessages } from '../components/FlashMessages';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { StatusBadge } from '../components/StatusBadge';
import { confirmModal } from '../lib/modalBridge';
import { employeeStatus, employeeStatusLabel, formatDate, postForm } from '../lib/listUi';

function canManageSystemUser(actorRole, targetRole) {
  const actor = String(actorRole ?? '').trim();
  const target = String(targetRole ?? '').trim();
  if (actor === '99') return true;
  if (actor === '1') return target !== '99';
  return false;
}

export function UsersPageApp({
  users = [],
  roleMap = {},
  flash = null,
  error = null,
  userRole = '',
  sessionUserId = 0,
  canAddUser = false}) {
  const { t } = useTranslation('ops');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const roleLabel = roleMap[String(u.role)] || String(u.role || '');
      const hay = [u.first_name, u.last_name, u.username, u.emailid, u.phone, roleLabel].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [users, search, roleMap]);

  const menuFor = (u) => {
    const items = [];
    if (canManageSystemUser(userRole, u.role)) {
      items.push({
        href: `/users/${u.id}/edit`,
        label: t('users.edit_user'),
        icon: <span className="text-brand">✎</span>});
    }
    const mayDelete =
      canManageSystemUser(userRole, u.role) && Number(u.id) !== Number(sessionUserId);
    if (mayDelete) {
      items.push({
        label: t('users.delete'),
        icon: <span className="text-red-600">🗑</span>,
        danger: true,
        onClick: async () => {
          const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || `#${u.id}`;
          const ok = await confirmModal({
            title: t('users.delete_title'),
            message: t('users.delete_confirm', { name }),
            confirmLabel: t('users.delete_yes'),
            tone: 'danger'});
          if (ok) postForm(`/users/${u.id}/delete`, {});
        }});
    }
    return items;
  };

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="key" title={t('users.title')} subtitle={t('users.subtitle')}>
          <div className="hms-surface-hero-actions mt-4">
            {canAddUser ? (
              <a href="/users/add" className="hms-btn-primary text-xs">
                {t('users.add_user')}
              </a>
            ) : null}
            <a href="/employees" className="hms-btn-secondary text-xs">
              {t('users.view_employees')}
            </a>
          </div>
        </SurfaceHero>

        <div className="hms-compact-kpi-grid mb-3">
          <StatCard label={t('users.stat_total')} value={users.length} tone="brand" icon="users" />
          <StatCard label={t('users.stat_showing')} value={filtered.length} tone="default" icon="search" />
        </div>

        <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-950">
          {t('users.hint')}
        </div>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <SearchField
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            placeholder={t('users.search_ph')}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('users.col_name')}</th>
                  <th className="px-4 py-3">{t('users.col_username')}</th>
                  <th className="px-4 py-3">{t('users.col_contact')}</th>
                  <th className="px-4 py-3">{t('users.col_role')}</th>
                  <th className="px-4 py-3">{t('users.col_status')}</th>
                  <th className="px-4 py-3">{t('users.col_joined')}</th>
                  <th className="px-4 py-3 text-right">{t('users.col_action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      {t('users.empty')}
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => {
                    const st = employeeStatus(u.status);
                    const items = menuFor(u);
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-semibold text-ink">
                          {u.first_name} {u.last_name}
                        </td>
                        <td className="px-4 py-3 text-slate-600">@{u.username || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="text-ink">{u.emailid || '—'}</div>
                          <div className="text-xs text-slate-500">{u.phone || ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                            {roleMap[String(u.role)] || u.role || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge variant={st.variant} label={employeeStatusLabel(t, u.status)} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDate(u.joining_date)}</td>
                        <td className="px-4 py-3 text-right">{items.length ? <ActionMenu items={items} /> : null}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
