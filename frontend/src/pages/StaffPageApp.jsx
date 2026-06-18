import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionMenu } from '../components/ActionMenu';
import { FlashMessages } from '../components/FlashMessages';
import { Pager } from '../components/Pager';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { useClientPagination } from '../hooks/useClientPagination';
import { formatDate } from '../lib/listUi';
import { DEFAULT_PAGE_SIZE } from '../lib/pagination';
import { AddStaffModal } from '../modals/AddStaffModal';

function avatarEmoji(person) {
  if (person.profile_emoji) return person.profile_emoji;
  const g = String(person.gender || '').trim().toLowerCase();
  if (g === 'female') return '👩‍⚕️';
  if (g === 'male') return '👨‍⚕️';
  return '🧑';
}

function StaffAvatar({ person }) {
  return (
    <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-brand/10 text-3xl leading-none">
      {person.photo_path ? (
        <img src={`/uploads/${person.photo_path}`} alt="" className="h-full w-full object-cover" />
      ) : (
        avatarEmoji(person)
      )}
    </span>
  );
}

export function StaffPageApp({
  staff = [],
  roleMap = {},
  flash = null,
  error = null,
  canAddStaff = false}) {
  const { t } = useTranslation('ops');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((p) => {
      const roleLabel = roleMap[String(p.role)] || String(p.role || '');
      const hay = [p.first_name, p.last_name, p.username, p.emailid, p.phone, roleLabel].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [staff, search, roleMap]);

  const { setPage, pager, rows } = useClientPagination(filtered, {
    pageSize,
    resetKeys: [search, pageSize]});

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="users" title={t('staff.title')} subtitle={t('staff.subtitle')}>
          {canAddStaff ? (
            <div className="hms-surface-hero-actions mt-4">
              <button type="button" className="hms-btn-primary text-xs" onClick={() => setAddOpen(true)}>
                {t('staff.add_employee')}
              </button>
            </div>
          ) : null}
        </SurfaceHero>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <StatCard label={t('staff.stat_total')} value={staff.length} tone="brand" icon="users" />
          <StatCard label={t('staff.stat_showing')} value={filtered.length} tone="default" icon="search" />
        </div>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchField
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              placeholder={t('staff.search_ph')}
            />
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              {t('staff.count_of', { filtered: filtered.length, total: staff.length })}
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('staff.col_name')}</th>
                  <th className="px-4 py-3">{t('staff.col_username')}</th>
                  <th className="px-4 py-3">{t('staff.col_email_phone')}</th>
                  <th className="px-4 py-3">{t('staff.col_role')}</th>
                  <th className="px-4 py-3">{t('staff.col_joined')}</th>
                  <th className="px-4 py-3 text-right">{t('staff.col_action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                      {t('staff.empty')}
                    </td>
                  </tr>
                ) : (
                  rows.map((person) => (
                    <tr key={person.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StaffAvatar person={person} />
                          <span className="font-semibold text-ink">
                            {person.first_name} {person.last_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">@{person.username}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-ink">{person.emailid || '—'}</div>
                        <div className="text-xs text-slate-500">{person.phone || '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
                          {roleMap[String(person.role)] || person.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(person.joining_date)}</td>
                      <td className="px-4 py-3 text-right">
                        <ActionMenu
                          items={[
                            { href: `/employees/${person.id}/edit`, label: t('staff.edit_profile'), icon: '✎' },
                          ]}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pager pager={pager} onPage={setPage} pageSize={pageSize} onPageSize={setPageSize} />
        </div>

        <AddStaffModal open={addOpen} onClose={() => setAddOpen(false)} />
      </div>
    </div>
  );
}
