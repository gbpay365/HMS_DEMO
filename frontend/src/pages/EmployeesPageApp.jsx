import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionMenu } from '../components/ActionMenu';
import { FlashMessages } from '../components/FlashMessages';
import { Pager } from '../components/Pager';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { StatusBadge } from '../components/StatusBadge';
import { useClientPagination } from '../hooks/useClientPagination';
import { employeeStatus, employeeStatusLabel, formatDate, hasPerm, postForm } from '../lib/listUi';
import { confirmModal } from '../lib/modalBridge';
import { DEFAULT_PAGE_SIZE } from '../lib/pagination';
import { ResetEmployeePasswordModal } from '../modals/ResetEmployeePasswordModal';
import { EditEmployeeProfileModal } from '../modals/EditEmployeeProfileModal';
import { ExportEmployeesModal } from '../modals/ExportEmployeesModal';

function avatarEmoji(employee) {
  if (employee.profile_emoji) return employee.profile_emoji;
  const g = String(employee.gender || '').trim().toLowerCase();
  if (g === 'female') return '👩‍⚕️';
  if (g === 'male') return '👨‍⚕️';
  return '🧑';
}

function StaffAvatar({ employee }) {
  return (
    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-brand-light text-3xl leading-none">
      {employee.photo_path ? (
        <img src={`/uploads/${employee.photo_path}`} alt="" className="h-full w-full object-cover" />
      ) : (
        avatarEmoji(employee)
      )}
    </div>
  );
}

function canManageEmployeeTarget(actorRole, targetRole) {
  const actor = String(actorRole ?? '').trim();
  const target = String(targetRole ?? '').trim();
  if (actor === '99') return true;
  if (actor === '1') return target !== '99';
  return target !== '1' && target !== '99';
}

function canResetEmployeePassword(actorRole, targetRole, userPerms) {
  const actor = String(actorRole ?? '').trim();
  const target = String(targetRole ?? '').trim();
  if (actor === '99') return true;
  if (actor === '1') return target !== '99';
  if (target === '1' || target === '99') return false;
  const perms = userPerms || [];
  if (perms.includes('*') || perms.includes('employee.password.manage')) return true;
  return false;
}

export function EmployeesPageApp({
  employees = [],
  roleMap = {},
  flash = null,
  error = null,
  userRole = '',
  userPerms = [],
  directorRoleId = '',
  canDeleteEmployee = false,
  sessionUserId = 0,
  exportColumns = [],
  exportDefaultColumns = []}) {
  const { t } = useTranslation('ops');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [employeeRows, setEmployeeRows] = useState(employees);

  const isAdmin = userRole === '1' || userRole === '99' || hasPerm(userPerms, ['*', 'employee.write']);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employeeRows;
    return employeeRows.filter((e) => {
      const roleLabel = roleMap[String(e.role)] || String(e.role || '');
      const hay = [
        e.first_name,
        e.last_name,
        e.username,
        e.emailid,
        e.phone,
        e.primary_department,
        e.specialisation,
        roleLabel,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [employeeRows, search, roleMap]);

  const { setPage, pager, rows } = useClientPagination(filtered, {
    pageSize,
    resetKeys: [search, pageSize]});

  const menuFor = (e) => {
    const items = [];
    if (isAdmin || hasPerm(userPerms, ['employee.write'])) {
      items.push({
        label: t('employees.edit_profile'),
        icon: <span className="text-brand">✎</span>,
        onClick: () => {
          setEditTarget(e);
          setEditOpen(true);
        },
      });
    }
    if (canResetEmployeePassword(userRole, e.role, userPerms)) {
      items.push({
        label: t('employees.reset_password'),
        icon: <span className="text-slate-600">🔑</span>,
        onClick: () => {
          setResetTarget(e);
          setResetOpen(true);
        }});
    }
    if (hasPerm(userPerms, ['access_control.manage']) || isAdmin) {
      items.push({
        href: '/access-control',
        label: t('employees.access_control'),
        icon: <span className="text-brand">🔒</span>});
    }
    const mayDelete =
      canDeleteEmployee &&
      Number(e.id) !== Number(sessionUserId) &&
      canManageEmployeeTarget(userRole, e.role);
    if (mayDelete) {
      items.push({
        label: t('employees.delete'),
        icon: <span className="text-red-600">🗑</span>,
        danger: true,
        onClick: async () => {
          const name = `${e.first_name || ''} ${e.last_name || ''}`.trim() || `#${e.id}`;
          const ok = await confirmModal({
            title: t('employees.delete_title'),
            message: t('employees.delete_confirm', { name }),
            confirmLabel: t('employees.delete_yes'),
            tone: 'danger'});
          if (ok) postForm(`/employees/${e.id}/delete`, {});
        }});
    }
    return items;
  };

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="id-card" title={t('employees.title')} subtitle={t('employees.subtitle')}>
          <div className="hms-surface-hero-actions mt-4 flex flex-wrap gap-2">
            <button type="button" className="hms-btn-secondary text-xs" onClick={() => setExportOpen(true)}>
              <i className="fa fa-download mr-1" aria-hidden="true" />
              {t('employees.export')}
            </button>
            {isAdmin ? (
              <>
                <a href="/employees/add" className="hms-btn-primary text-xs">
                  {t('employees.add_employee')}
                </a>
                <a href="/access-control" className="hms-btn-secondary text-xs">
                  {t('employees.access_control')}
                </a>
              </>
            ) : null}
          </div>
        </SurfaceHero>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <StatCard label={t('employees.stat_total')} value={employeeRows.length} tone="brand" icon="users" />
          <StatCard label={t('employees.stat_showing')} value={filtered.length} tone="default" icon="search" />
        </div>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchField
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              placeholder={t('employees.search_ph')}
            />
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              {t('employees.total_count', { total: employeeRows.length, count: filtered.length })}
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('employees.col_name')}</th>
                  <th className="px-4 py-3">{t('employees.col_username')}</th>
                  <th className="px-4 py-3">{t('employees.col_contact')}</th>
                  <th className="px-4 py-3">{t('employees.col_department')}</th>
                  <th className="px-4 py-3">{t('employees.col_role')}</th>
                  <th className="px-4 py-3">{t('employees.col_status')}</th>
                  <th className="px-4 py-3">{t('employees.col_joined')}</th>
                  <th className="px-4 py-3 text-right">{t('employees.col_action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                      {t('employees.empty')}
                    </td>
                  </tr>
                ) : (
                  rows.map((e) => {
                    const st = employeeStatus(e.status);
                    const items = menuFor(e);
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
                          <div className="text-ink">{e.emailid || '—'}</div>
                          <div className="text-xs text-slate-500">{e.phone || ''}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {e.departments_all || e.primary_department || '—'}
                          {e.specialisations_all ? (
                            <div className="mt-0.5 text-xs text-violet-700">{e.specialisations_all}</div>
                          ) : e.specialisation ? (
                            <div className="mt-0.5 text-xs text-violet-700">{e.specialisation}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
                            {roleMap[String(e.role)] || e.role || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge variant={st.variant} label={employeeStatusLabel(t, e.status)} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDate(e.joining_date)}</td>
                        <td className="px-4 py-3 text-right">{items.length ? <ActionMenu items={items} /> : null}</td>
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

        <EditEmployeeProfileModal
          open={editOpen}
          employeeId={editTarget?.id}
          onClose={() => {
            setEditOpen(false);
            setEditTarget(null);
          }}
          onSaved={(updated) => {
            if (!updated?.id) {
              window.location.reload();
              return;
            }
            setEmployeeRows((prev) =>
              prev.map((row) =>
                Number(row.id) === Number(updated.id)
                  ? {
                      ...row,
                      first_name: updated.first_name,
                      last_name: updated.last_name,
                      username: updated.username,
                      emailid: updated.emailid,
                      phone: updated.phone,
                      gender: updated.gender,
                      profile_emoji: updated.profile_emoji,
                      photo_path: updated.photo_path,
                      joining_date: updated.joining_date,
                      role: updated.role,
                      primary_department: updated.primary_department,
                      specialisation: updated.specialisation,
                      status: updated.status,
                      departments_all: (updated.departments || []).join(', ') || updated.primary_department || '',
                      specialisations_all: (updated.specialisations || []).join(', ') || updated.specialisation || '',
                    }
                  : row
              )
            );
          }}
        />

        <ResetEmployeePasswordModal
          open={resetOpen}
          onClose={() => {
            setResetOpen(false);
            setResetTarget(null);
          }}
          employee={resetTarget}
        />

        <ExportEmployeesModal
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          search={search}
          exportColumns={exportColumns}
          defaultColumns={exportDefaultColumns}
        />
      </div>
    </div>
  );
}
