import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { HmsDataTable } from '../components/HmsDataTable';
import { SurfaceHero } from '../components/SurfaceHero';
import { SurfaceStatLink } from '../components/SurfaceStatLink';
import { TrendChart } from '../components/TrendChart';
import { badgeClass } from '../lib/listUi';
import { DASHBOARD_TILE_SECTIONS } from '../lib/dashboardTileCatalog';

const LINKS = [
  { code: 'dash.link.lobby', href: '/portal/call-queue/enter', labelKey: 'links.lobby', external: true, icon: 'fa-desktop' },
  { code: 'dash.link.hms_hub', href: '/hms', labelKey: 'links.hms_hub', icon: 'fa-th' },
  { code: 'dash.link.reports', href: '/hms/reports', labelKey: 'links.reports', icon: 'fa-bar-chart' },
  { code: 'dash.link.front_desk', href: '/front-desk', labelKey: 'links.front_desk', icon: 'fa-hand-o-right' },
  { code: 'dash.link.wards', href: '/wards', labelKey: 'links.wards', icon: 'fa-hospital-o' },
];

function vis(uiVis, code) {
  return uiVis?.[code] !== false && uiVis?.[code] !== 0;
}

function initials(fn, ln) {
  return `${(fn || '?')[0] || ''}${(ln || '?')[0] || ''}`.toUpperCase();
}

function formatTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function formatTileValue(tile, stats) {
  if (tile.stat == null) return undefined;
  const raw = stats[tile.stat] ?? 0;
  if (tile.format === 'money') return Number(raw || 0).toLocaleString('fr-FR');
  return raw;
}

export function DashboardPageApp({
  stats = {},
  chartLabels = [],
  chartValues = [],
  recentPatients = [],
  recentAppts = [],
  recentDoctors = [],
  erPatients = [],
  flash = null,
  uiVis = {}}) {
  const { t } = useTranslation('dashboard');
  const enrichedStats = { ...stats, erCount: erPatients.length };
  const visibleLinks = LINKS.filter((l) => vis(uiVis, l.code));

  const visibleSections = DASHBOARD_TILE_SECTIONS.map((section) => ({
    ...section,
    tiles: section.tiles.filter((tile) => vis(uiVis, tile.code)),
  })).filter((section) => section.tiles.length > 0);

  return (
    <div className="page-wrapper hms-surface-module hms-dashboard-page">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} />

        <SurfaceHero
          icon="fa-hospital-o"
          badge={t('hospital')}
          title={t('title')}
          subtitle={t('subtitle')}
        >
          {(visibleLinks.length > 0 || vis(uiVis, 'dash.btn.new')) ? (
            <div className="hms-surface-hero-actions mt-4 flex flex-wrap gap-2">
              {vis(uiVis, 'dash.btn.new') ? (
                <a href="/patients?action=new" className="hms-btn-primary text-xs">
                  <i className="fa fa-user-plus mr-1" aria-hidden="true" />
                  {t('new_patient')}
                </a>
              ) : null}
              {visibleLinks.map((l) => (
                <a
                  key={l.code}
                  href={l.href}
                  className="hms-btn-secondary text-xs"
                  {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  <i className={`fa ${l.icon} mr-1`} aria-hidden="true" />
                  {t(l.labelKey)}
                </a>
              ))}
            </div>
          ) : null}
        </SurfaceHero>

        {visibleSections.map((section) => (
          <section key={section.id} className="hms-stat-section mb-6">
            <h2 className="hms-stat-section__title">{t(section.labelKey)}</h2>
            <div className="hms-stat-grid">
              {section.tiles.map((tile) => (
                <SurfaceStatLink
                  key={tile.code}
                  href={tile.href}
                  label={t(tile.labelKey)}
                  value={tile.stat != null ? formatTileValue(tile, enrichedStats) : undefined}
                  icon={tile.icon}
                  color={tile.color}
                  hint={tile.hintKey ? t(tile.hintKey) : null}
                  valueless={tile.valueless || tile.stat == null}
                  tone={tile.tone}
                />
              ))}
            </div>
          </section>
        ))}

        {vis(uiVis, 'dash.panel.er_list') && erPatients.length > 0 ? (
          <div className="hms-flash hms-flash--error mb-6 rounded-2xl p-4">
            <h2 className="mb-3 text-sm font-bold">
              <i className="fa fa-heartbeat mr-1" aria-hidden="true" />
              {t('panels.active_emergencies')}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {erPatients.map((er) => {
                const name = `${er.first_name || ''} ${er.last_name || ''}`.trim() || t('panels.unknown');
                return (
                  <a
                    key={er.id}
                    href="/emergency"
                    className="rounded-xl border border-red-100 bg-white px-3 py-2 text-sm text-ink transition hover:border-red-300"
                  >
                    <div className="font-semibold">{name}</div>
                    <div className="text-xs text-slate-500">
                      {formatTime(er.queue_started_at)} · {(er.queue_status || 'unknown').replace(/_/g, ' ')}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-12">
          {vis(uiVis, 'dash.panel.chart') ? (
            <div className={vis(uiVis, 'dash.panel.recent_appts') ? 'lg:col-span-8' : 'lg:col-span-12'}>
              <div className="hms-surface-card overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
                <TrendChart labels={chartLabels} values={chartValues} label={t('panels.registrations_7d')} />
              </div>
            </div>
          ) : null}

          {vis(uiVis, 'dash.panel.recent_appts') ? (
            <div className={vis(uiVis, 'dash.panel.chart') ? 'lg:col-span-4' : 'lg:col-span-12'}>
              <div className="hms-surface-card rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink">
                    <i className="fa fa-calendar-check-o mr-1 text-brand" aria-hidden="true" />
                    {t('panels.recent_appointments')}
                  </h3>
                  {vis(uiVis, 'dash.card.appointments') ? (
                    <a href="/appointments" className="text-xs font-semibold text-brand hover:underline">
                      {t('common:actions.view_all')}
                    </a>
                  ) : null}
                </div>
                <div className="divide-y divide-slate-100">
                  {recentAppts.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500">{t('panels.no_appointments')}</p>
                  ) : (
                    recentAppts.map((ap, i) => (
                      <div key={i} className="py-2.5">
                        <div className="text-sm font-semibold text-ink">
                          {ap.patient_name || `${ap.first_name || ''} ${ap.last_name || ''}`.trim()}
                        </div>
                        <div className="text-xs text-slate-500">
                          {[ap.doctor, ap.department].filter(Boolean).join(' · ')}
                        </div>
                        <div className="text-xs text-slate-400">
                          {ap.date}
                          {ap.time ? ` · ${ap.time}` : ''}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          {vis(uiVis, 'dash.panel.new_patients') ? (
            <div className={vis(uiVis, 'dash.panel.doctors_duty') ? 'lg:col-span-8' : 'lg:col-span-12'}>
              <div className="hms-surface-card overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-bold text-ink">
                    <i className="fa fa-user-plus mr-1 text-brand" aria-hidden="true" />
                    {t('panels.new_patients')}
                  </h3>
                  {vis(uiVis, 'dash.card.patients') ? (
                    <a href="/patients" className="text-xs font-semibold text-brand hover:underline">
                      {t('common:actions.view_all')}
                    </a>
                  ) : null}
                </div>
                <div className="overflow-x-auto">
                  <HmsDataTable
                    emptyMessage={t('panels.no_patients')}
                    columns={[
                      {
                        key: 'name',
                        label: t('panels.patient'),
                        render: (row) => (
                          <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                              {initials(row.first_name, row.last_name)}
                            </span>
                            <span className="font-semibold text-ink">
                              {row.first_name} {row.last_name}
                            </span>
                          </div>
                        )},
                      {
                        key: 'email',
                        label: t('panels.email'),
                        cellClassName: 'text-xs text-slate-500',
                        render: (row) => row.email || '—'},
                      {
                        key: 'phone',
                        label: t('panels.phone'),
                        cellClassName: 'text-xs text-slate-500',
                        render: (row) => row.phone || '—'},
                      {
                        key: 'type',
                        label: t('panels.type'),
                        render: (row) => {
                          const isIp = String(row.patient_type || '').toLowerCase().includes('in');
                          return (
                            <span className={isIp ? badgeClass('pending') : badgeClass('success')}>
                              {isIp ? t('panels.inpatient') : t('panels.outpatient')}
                            </span>
                          );
                        }},
                    ]}
                    rows={recentPatients}
                    rowKey="id"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {vis(uiVis, 'dash.panel.doctors_duty') ? (
            <div className={vis(uiVis, 'dash.panel.new_patients') ? 'lg:col-span-4' : 'lg:col-span-12'}>
              <div className="hms-surface-card rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
                <h3 className="mb-3 text-sm font-bold text-ink">
                  <i className="fa fa-user-md mr-1 text-emerald-600" aria-hidden="true" />
                  {t('panels.doctors_on_duty')}
                </h3>
                <ul className="space-y-3">
                  {recentDoctors.length === 0 ? (
                    <li className="text-xs text-slate-500">{t('panels.no_active_doctors')}</li>
                  ) : (
                    recentDoctors.map((doc) => (
                      <li key={doc.id || `${doc.first_name}-${doc.last_name}`} className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
                          {initials(doc.first_name, doc.last_name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-ink">
                            {doc.first_name} {doc.last_name}
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {doc.bio || doc.primary_department || t('panels.doctor_role')}
                          </div>
                        </div>
                        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title={t('panels.active')} />
                      </li>
                    ))
                  )}
                </ul>
                {vis(uiVis, 'dash.card.doctors') ? (
                  <a href="/doctors" className="mt-4 block text-center text-xs font-semibold text-brand hover:underline">
                    {t('panels.view_all_doctors')}
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
