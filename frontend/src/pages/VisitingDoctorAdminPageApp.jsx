import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { formatDate } from '../lib/listUi';
import { confirmModal } from '../lib/modalBridge';
import { notifyError } from '../lib/notifyBridge';

function statusBadge(account, t) {
  if (!account.inUse) {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">{t('available')}</span>;
  }
  if (account.setupInProgress) {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{t('setup_in_progress')}</span>;
  }
  if (account.expiringSoon) {
    return <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">{t('admin.expiring_soon')}</span>;
  }
  return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">{t('in_use')}</span>;
}

export function VisitingDoctorAdminPageApp({
  accounts = [],
  sessions = [],
  summary = {},
  defaultPassword = '12345',
  flash = null,
  error = null}) {
  const { t } = useTranslation('visitingDoctor');
  const [releasingId, setReleasingId] = useState(null);
  const [localAccounts, setLocalAccounts] = useState(accounts);
  const [localSessions, setLocalSessions] = useState(sessions);

  const stats = useMemo(
    () => ({
      total: summary.total ?? localAccounts.length,
      inUse: summary.inUse ?? localAccounts.filter((a) => a.inUse).length,
      available: summary.available ?? localAccounts.filter((a) => a.available).length,
      expiringSoon: summary.expiringSoon ?? localAccounts.filter((a) => a.expiringSoon).length}),
    [summary, localAccounts]
  );

  async function refreshPool() {
    const res = await fetch('/api/admin/visiting-doctors', { headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (data?.ok) {
      setLocalAccounts(data.accounts || []);
      setLocalSessions(data.sessions || []);
    }
  }

  async function releaseAccount(id, username) {
    const ok = await confirmModal({
      title: t('admin.release_title'),
      message: t('admin.release_confirm', { username }),
      confirmLabel: t('admin.release_btn'),
      tone: 'danger'});
    if (!ok) return;
    setReleasingId(id);
    try {
      const res = await fetch(`/admin/visiting-doctors/${id}/release`, {
        method: 'POST',
        headers: { Accept: 'application/json' }});
      const data = await res.json();
      if (!data?.ok) throw new Error(data.error || t('admin.release_failed'));
      await refreshPool();
    } catch (e) {
      notifyError(e.message || t('admin.release_failed'));
    } finally {
      setReleasingId(null);
    }
  }

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="user-md" title={t('admin.title')} subtitle={t('admin.subtitle')}>
          <div className="hms-surface-hero-actions mt-4">
            <a href="/admin/visiting-doctors/print-cards" target="_blank" rel="noreferrer" className="hms-btn-secondary text-xs">
              <i className="fa fa-print mr-1" aria-hidden="true" />
              {t('admin.print_cards')}
            </a>
            <button type="button" className="hms-btn-secondary text-xs" onClick={() => refreshPool()}>
              <i className="fa fa-refresh mr-1" aria-hidden="true" />
              {t('admin.refresh')}
            </button>
          </div>
        </SurfaceHero>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('admin.stat_total')} value={stats.total} tone="brand" icon="users" />
          <StatCard label={t('admin.stat_in_use')} value={stats.inUse} tone="danger" icon="user-md" />
          <StatCard label={t('admin.stat_available')} value={stats.available} tone="brand" icon="check-circle" />
          <StatCard label={t('admin.stat_expiring')} value={stats.expiringSoon} tone="warning" icon="clock-o" />
        </div>

        <div className="mb-4 rounded-xl border border-brand/20 bg-brand-light/40 px-4 py-3 text-sm text-slate-700">
          {t('admin.default_password_note', { password: defaultPassword })}
        </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('admin.col_account')}</th>
              <th className="px-4 py-3">{t('admin.col_status')}</th>
              <th className="px-4 py-3">{t('admin.col_doctor')}</th>
              <th className="px-4 py-3">{t('admin.col_department')}</th>
              <th className="px-4 py-3">{t('admin.col_room')}</th>
              <th className="px-4 py-3">{t('admin.col_visit')}</th>
              <th className="px-4 py-3 text-right">{t('admin.col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {localAccounts.map((acc) => (
              <tr key={acc.username} className="border-t border-slate-100">
                <td className="px-4 py-3 font-bold text-slate-900">{acc.username}</td>
                <td className="px-4 py-3">{statusBadge(acc, t)}</td>
                <td className="px-4 py-3">
                  {acc.doctorName || <span className="text-slate-400">—</span>}
                  {acc.phone ? <div className="text-xs text-slate-500">{acc.phone}</div> : null}
                </td>
                <td className="px-4 py-3">{acc.department || '—'}</td>
                <td className="px-4 py-3">{acc.room || '—'}</td>
                <td className="px-4 py-3">
                  {acc.visitStartDate || acc.visitEndDate ? (
                    <div>
                      <div>{acc.visitStartDate || '—'} → {acc.visitEndDate || '—'}</div>
                      {acc.daysRemaining != null ? (
                        <div className={`text-xs ${acc.expiringSoon ? 'font-bold text-orange-700' : 'text-slate-500'}`}>
                          {t('admin.days_left', { count: acc.daysRemaining })}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {acc.inUse ? (
                    <button
                      type="button"
                      className="hms-btn hms-btn-outline-danger text-xs"
                      disabled={releasingId === acc.id}
                      onClick={() => releaseAccount(acc.id, acc.username)}
                    >
                      {releasingId === acc.id ? t('admin.releasing') : t('admin.force_release')}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">{t('admin.no_action')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-extrabold text-slate-900">{t('admin.session_history')}</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('admin.col_account')}</th>
                <th className="px-4 py-3">{t('admin.col_doctor')}</th>
                <th className="px-4 py-3">{t('admin.col_department')}</th>
                <th className="px-4 py-3">{t('admin.col_visit')}</th>
                <th className="px-4 py-3">{t('admin.col_claimed')}</th>
                <th className="px-4 py-3">{t('admin.col_released')}</th>
              </tr>
            </thead>
            <tbody>
              {!localSessions.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    {t('admin.no_sessions')}
                  </td>
                </tr>
              ) : (
                localSessions.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold">{s.username}</td>
                    <td className="px-4 py-3">{s.doctorName || '—'}</td>
                    <td className="px-4 py-3">{s.department || '—'}</td>
                    <td className="px-4 py-3">
                      {(s.visitStartDate || '—') + ' → ' + (s.visitEndDate || '—')}
                    </td>
                    <td className="px-4 py-3">{s.claimedAt ? formatDate(s.claimedAt) : '—'}</td>
                    <td className="px-4 py-3">{s.releasedAt ? formatDate(s.releasedAt) : t('admin.still_active')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
