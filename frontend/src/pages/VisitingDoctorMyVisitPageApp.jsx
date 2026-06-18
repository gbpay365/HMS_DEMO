import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { SurfaceHero } from '../components/SurfaceHero';
import { formatDate } from '../lib/listUi';

export function VisitingDoctorMyVisitPageApp({ visit = null, username = '', flash = null, error = null }) {
  const { t } = useTranslation('visitingDoctor');
  const [endDate, setEndDate] = useState(visit?.visitEndDate || '');
  const [saving, setSaving] = useState(false);
  const [localVisit, setLocalVisit] = useState(visit);
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(null);

  async function extendStay(ev) {
    ev.preventDefault();
    setSaving(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      const res = await fetch('/visiting-doctor/extend-stay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ visit_end_date: endDate })});
      const data = await res.json();
      if (!data?.ok) throw new Error(data.error || t('my_visit.extend_failed'));
      setLocalVisit((prev) => ({
        ...prev,
        visitEndDate: data.visit_end_date,
        daysRemaining: data.daysRemaining,
        expiringSoon: data.daysRemaining != null && data.daysRemaining <= 1 && data.daysRemaining >= 0}));
      setFormSuccess(t('my_visit.extend_success', { date: data.visit_end_date }));
    } catch (e) {
      setFormError(e.message || t('my_visit.extend_failed'));
    } finally {
      setSaving(false);
    }
  }

  const v = localVisit || {};

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <div className="mx-auto max-w-2xl">
          <SurfaceHero icon="calendar-check-o" title={t('my_visit.title')} subtitle={t('my_visit.subtitle', { username })} />

        {v.expiringSoon ? (
          <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
            <i className="fa fa-exclamation-triangle mr-2" aria-hidden="true" />
            {t('my_visit.expiring_banner', { date: v.visitEndDate, count: v.daysRemaining })}
          </div>
        ) : null}

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('admin.col_account')}</dt>
              <dd className="font-semibold text-slate-900">{v.username || username}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('department')}</dt>
              <dd className="font-semibold text-slate-900">{v.department || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('specialisation')}</dt>
              <dd className="font-semibold text-slate-900">{v.specialisation || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('consultation_room')}</dt>
              <dd className="font-semibold text-slate-900">{v.room || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('visit_start')}</dt>
              <dd className="font-semibold text-slate-900">{v.visitStartDate || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('visit_end')}</dt>
              <dd className="font-semibold text-slate-900">
                {v.visitEndDate || '—'}
                {v.daysRemaining != null ? (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    ({t('admin.days_left', { count: v.daysRemaining })})
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-base font-extrabold text-slate-900">{t('my_visit.extend_title')}</h2>
          <p className="mb-4 text-sm text-slate-600">{t('my_visit.extend_hint')}</p>

          {formError ? (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{formError}</div>
          ) : null}
          {formSuccess ? (
            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{formSuccess}</div>
          ) : null}

          <form onSubmit={extendStay} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label htmlFor="vd-extend-end" className="mb-1 block text-xs font-bold text-slate-600">
                {t('visit_end')}
              </label>
              <input
                id="vd-extend-end"
                type="date"
                className="hms-input w-full"
                value={endDate}
                min={v.visitEndDate || undefined}
                required
                onChange={(ev) => setEndDate(ev.target.value)}
              />
            </div>
            <button type="submit" className="hms-btn hms-btn-primary text-sm" disabled={saving}>
              {saving ? t('my_visit.saving') : t('my_visit.extend_submit')}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm">
          <a href="/portal/hub/doctor" className="font-semibold text-brand hover:underline">
            ← {t('my_visit.back_portal')}
          </a>
        </p>
        </div>
      </div>
    </div>
  );
}

export function VisitingDoctorVisitBanner({ visit }) {
  const { t } = useTranslation('visitingDoctor');
  if (!visit?.visitEndDate) return null;
  const tone = visit.expiringSoon
    ? 'border-orange-200 bg-orange-50 text-orange-900'
    : 'border-sky-200 bg-sky-50 text-sky-900';
  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong>{t('banner.title', { username: visit.username })}</strong>
          <span className="ml-2">
            {t('banner.until', { date: visit.visitEndDate })}
            {visit.daysRemaining != null ? ` · ${t('admin.days_left', { count: visit.daysRemaining })}` : ''}
          </span>
        </div>
        <a href="/visiting-doctor/my-visit" className="hms-btn hms-btn-secondary text-xs">
          {t('banner.manage_visit')}
        </a>
      </div>
    </div>
  );
}
