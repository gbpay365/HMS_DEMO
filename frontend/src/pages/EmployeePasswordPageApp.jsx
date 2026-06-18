import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { Pager } from '../components/Pager';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { StatusBadge } from '../components/StatusBadge';
import { useClientPagination } from '../hooks/useClientPagination';
import { employeeStatus, employeeStatusLabel, formatDate } from '../lib/listUi';
import { DEFAULT_PAGE_SIZE } from '../lib/pagination';
import { ResetEmployeePasswordModal } from '../modals/ResetEmployeePasswordModal';

function avatarEmoji(employee) {
  if (employee.profile_emoji) return employee.profile_emoji;
  const g = String(employee.gender || '').trim().toLowerCase();
  if (g === 'female') return '👩‍⚕️';
  if (g === 'male') return '👨‍⚕️';
  return '🧑';
}

function StaffAvatar({ employee }) {
  return (
    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-violet-50 text-2xl leading-none">
      {employee.photo_path ? (
        <img src={`/uploads/${employee.photo_path}`} alt="" className="h-full w-full object-cover" />
      ) : (
        avatarEmoji(employee)
      )}
    </div>
  );
}

export function EmployeePasswordPageApp({
  employees = [],
  roleMap = {},
  flash = null,
  error = null}) {
  const { t } = useTranslation('ops');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => {
      const roleLabel = roleMap[String(e.role)] || String(e.role || '');
      const hay = [e.first_name, e.last_name, e.username, e.emailid, e.phone, roleLabel]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [employees, search, roleMap]);

  const { setPage, pager, rows } = useClientPagination(filtered, {
    pageSize,
    resetKeys: [search, pageSize]});

  const openReset = (employee) => {
    setSelected(employee);
    setModalOpen(true);
  };

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="lock" title={t('employee_password.title')} subtitle={t('employee_password.subtitle')} />

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <StatCard label={t('employee_password.stat_total')} value={employees.length} tone="brand" icon="users" />
          <StatCard label={t('employee_password.stat_showing')} value={filtered.length} tone="default" icon="search" />
        </div>

        <div className="mb-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-4 text-sm text-violet-900">
          <strong className="font-semibold">{t('employee_password.notice_title')}</strong>
          <p className="mb-0 mt-1 text-violet-800">{t('employee_password.notice_body')}</p>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchField
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              placeholder={t('employee_password.search_ph')}
            />
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              {t('employee_password.total_count', { total: employees.length, count: filtered.length })}
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('employee_password.col_name')}</th>
                  <th className="px-4 py-3">{t('employee_password.col_username')}</th>
                  <th className="px-4 py-3">{t('employee_password.col_role')}</th>
                  <th className="px-4 py-3">{t('employee_password.col_status')}</th>
                  <th className="px-4 py-3 text-right">{t('employee_password.col_action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                      {t('employee_password.empty')}
                    </td>
                  </tr>
                ) : (
                  rows.map((e) => {
                    const st = employeeStatus(e.status);
                    return (
                      <tr key={e.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <StaffAvatar employee={e} />
                            <span className="font-semibold text-ink">
                              {e.first_name} {e.last_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">@{e.username || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
                            {roleMap[String(e.role)] || e.role || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge variant={st.variant} label={employeeStatusLabel(t, e.status)} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="hms-btn-secondary text-xs"
                            onClick={() => openReset(e)}
                          >
                            🔑 {t('employee_password.reset_btn')}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pager
            pager={pager}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>

        <ResetEmployeePasswordModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelected(null);
          }}
          employee={selected}
        />
      </div>
    </div>
  );
}
