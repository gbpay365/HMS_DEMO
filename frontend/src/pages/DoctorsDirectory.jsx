import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionMenu } from '../components/ActionMenu';
import { Pager } from '../components/Pager';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { useClientPagination } from '../hooks/useClientPagination';
import { DEFAULT_PAGE_SIZE } from '../lib/pagination';

function initials(first, last) {
  return `${(first || '')[0] || ''}${(last || '')[0] || ''}`.toUpperCase();
}

function DoctorCard({ doctor, t }) {
  const active = Number(doctor.status) === 1;
  const menuItems = [
    {
      href: '/doctor-roster?view=day',
      label: t('doctors.view_schedule'),
      icon: (
        <svg className="h-4 w-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )},
    {
      href: `/employees/${doctor.id}/edit`,
      label: t('doctors.edit_profile'),
      icon: (
        <svg className="h-4 w-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      )},
  ];

  return (
    <article className="group flex flex-col rounded-2xl border border-slate-100 bg-white p-5 text-center shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative mx-auto mb-4">
        <div className="absolute -right-1 -top-1 h-20 w-20 rounded-full bg-brand/10 blur-2xl" aria-hidden />
        <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-[3px] border-white bg-brand-light text-xl font-bold text-brand shadow-md">
          {doctor.photo_path ? (
            <img
              src={`/uploads/${doctor.photo_path}`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            initials(doctor.first_name, doctor.last_name)
          )}
        </div>
      </div>

      <h3 className="text-base font-bold text-ink">
        Dr. {doctor.first_name} {doctor.last_name}
      </h3>
      <p className="mt-1 text-sm font-semibold text-brand">
        {doctor.primary_department || t('doctors.general_physician')}
      </p>
      <p className="mt-3 line-clamp-2 min-h-[2.75rem] text-sm leading-relaxed text-ink-muted">
        {doctor.bio || t('doctors.default_bio')}
      </p>

      <div className="mt-4 flex justify-center">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
            active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-red-50 text-red-700 ring-1 ring-red-200'
          }`}
        >
          {active ? t('doctors.active') : t('doctors.inactive')}
        </span>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2 border-t border-slate-100 pt-4">
        {doctor.emailid ? (
          <a
            href={`mailto:${doctor.emailid}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-brand/30 hover:text-brand"
            title={t('doctors.email')}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </a>
        ) : null}
        {doctor.phone ? (
          <a
            href={`tel:${doctor.phone}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-brand/30 hover:text-brand"
            title={t('doctors.call')}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </a>
        ) : null}
        <ActionMenu items={menuItems} />
      </div>
    </article>
  );
}

export function DoctorsDirectory({ doctors = [], canAddDoctor = false, onAddDoctor }) {
  const { t } = useTranslation('ops');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const { setPage, pager, rows: pageDoctors } = useClientPagination(doctors, {
    pageSize,
    resetKeys: [pageSize]});

  const activeCount = doctors.filter((d) => Number(d.status) === 1).length;

  return (
    <div className="content px-4 pb-8 pt-2 sm:px-6">
      <SurfaceHero icon="user-md" title={t('doctors.title')} subtitle={t('doctors.subtitle')}>
        {canAddDoctor ? (
          <div className="hms-surface-hero-actions mt-4">
            <button type="button" className="hms-btn-primary text-xs" onClick={onAddDoctor}>
              <i className="fa fa-plus mr-1" aria-hidden="true" />
              {t('doctors.add_doctor')}
            </button>
          </div>
        ) : null}
      </SurfaceHero>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <StatCard label={t('doctors.stat_total')} value={doctors.length} tone="brand" icon="users" />
        <StatCard label={t('doctors.stat_active')} value={activeCount} tone="brand" icon="check-circle" />
      </div>

      {doctors.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
          <p className="text-sm text-ink-muted">{t('doctors.empty')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {pageDoctors.map((doc) => (
              <DoctorCard key={doc.id} doctor={doc} t={t} />
            ))}
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
      )}
    </div>
  );
}
