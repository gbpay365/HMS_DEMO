import { useTranslation } from 'react-i18next';
import { DashboardHero } from '../components/DashboardHero';
import { DashboardMetricTile } from '../components/DashboardMetricTile';
import { DashboardPanel } from '../components/DashboardPanel';
import { FlashMessages } from '../components/FlashMessages';
import { HmsDataTable } from '../components/HmsDataTable';
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

const SECTION_META = {
  live: { icon: 'fa-bolt' },
  clinical: { icon: 'fa-stethoscope' },
  operations: { icon: 'fa-cogs' },
  finance: { icon: 'fa-wallet' },
};

const HERO_DUPLICATE_STATS = new Set(['patients', 'appointments', 'inpatients', 'doctors']);

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

function sectionGridClass(sectionId) {
  if (sectionId === 'operations' || sectionId === 'finance') return 'hms-dash-tile-grid hms-dash-tile-grid--modules';
  return 'hms-dash-tile-grid';
}

function DashboardEmpty({ icon, text, ctaHref, ctaLabel }) {
  return (
    <div className="hms-dash-empty">
      <div className="hms-dash-empty__icon">
        <i className={`fa ${icon}`} aria-hidden="true" />
      </div>
      <p className="hms-dash-empty__text">{text}</p>
      {ctaHref && ctaLabel ? (
        <a href={ctaHref} className="hms-dash-empty__cta">
          {ctaLabel}
        </a>
      ) : null}
    </div>
  );
}

export function DashboardPageApp({
  stats = {},
  heroKpis = null,
  dashboardProfile = 'default',
  dashboardHomeUrl = null,
  chartLabels = [],
  chartValues = [],
  recentPatients = [],
  recentAppts = [],
  recentDoctors = [],
  erPatients = [],
  flash = null,
  uiVis = {},
}) {
  const { t } = useTranslation(['dashboard', 'common']);
  const enrichedStats = { ...stats, erCount: erPatients.length };
  const visibleLinks = LINKS.filter((l) => vis(uiVis, l.code));
  const isProfileDashboard = dashboardProfile && dashboardProfile !== 'default';
  const profileSubtitle = isProfileDashboard
    ? t(`profiles.${dashboardProfile}.subtitle`, { defaultValue: '' })
    : t('subtitle');
  const profileTitle = isProfileDashboard
    ? t(`profiles.${dashboardProfile}.title`, { defaultValue: t('title') })
    : t('title');

  const visibleSections = DASHBOARD_TILE_SECTIONS.map((section) => ({
    ...section,
    tiles: section.tiles.filter((tile) => {
      if (!vis(uiVis, tile.code)) return false;
      if (section.id === 'clinical' && tile.stat && HERO_DUPLICATE_STATS.has(tile.stat)) return false;
      return true;
    }),
  })).filter((section) => section.tiles.length > 0);

  const showChart = vis(uiVis, 'dash.panel.chart');
  const showAppts = vis(uiVis, 'dash.panel.recent_appts');
  const showPatients = vis(uiVis, 'dash.panel.new_patients');
  const showDoctors = vis(uiVis, 'dash.panel.doctors_duty');
  const chartHasData = chartValues.some((v) => Number(v) > 0);

  return (
    <div className="page-wrapper hms-surface-module hms-dashboard-page">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} />

        <DashboardHero
          badge={t('hospital')}
          title={profileTitle}
          subtitle={profileSubtitle || undefined}
          stats={stats}
          heroKpis={heroKpis}
          dashboardProfile={dashboardProfile}
          t={t}
          visibleLinks={visibleLinks}
          showNewPatient={!isProfileDashboard && vis(uiVis, 'dash.btn.new')}
        />

        {isProfileDashboard && dashboardHomeUrl ? (
          <section className="mb-6 flex flex-wrap items-center gap-3">
            <a href={dashboardHomeUrl} className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:opacity-90">
              <i className="fa fa-external-link" aria-hidden="true" />
              {t(`profiles.${dashboardProfile}.open_portal`, { defaultValue: 'Open my workspace' })}
            </a>
          </section>
        ) : null}

        {!isProfileDashboard && visibleSections.map((section) => {
          const meta = SECTION_META[section.id] || {};
          return (
            <section key={section.id} className="hms-dash-section">
              <div className="hms-dash-section__head">
                {meta.icon ? (
                  <span className="hms-dash-section__icon">
                    <i className={`fa ${meta.icon}`} aria-hidden="true" />
                  </span>
                ) : null}
                <h2 className="hms-dash-section__title">{t(section.labelKey)}</h2>
              </div>
              <div className={sectionGridClass(section.id)}>
                {section.tiles.map((tile) => (
                  <DashboardMetricTile
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
          );
        })}

        {!isProfileDashboard && vis(uiVis, 'dash.panel.er_list') && erPatients.length > 0 ? (
          <div className="hms-dash-er-alert">
            <div className="hms-dash-er-alert__head">
              <i className="fa fa-heartbeat mr-1" aria-hidden="true" />
              {t('panels.active_emergencies')}
            </div>
            <div className="hms-dash-er-alert__grid">
              {erPatients.map((er) => {
                const name = `${er.first_name || ''} ${er.last_name || ''}`.trim() || t('panels.unknown');
                return (
                  <a key={er.id} href="/emergency" className="hms-dash-er-alert__card">
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

        {!isProfileDashboard && (showChart || showAppts) ? (
          <div className="hms-dash-analytics">
            {showChart ? (
              <div className={showAppts ? 'hms-dash-analytics__wide' : 'hms-dash-analytics__full'}>
                <DashboardPanel
                  title={t('panels.registrations_7d')}
                  icon="fa-line-chart"
                  iconTone="brand"
                  bodyClassName="hms-dash-panel__body--flush"
                >
                  <div className="px-4 pb-4 pt-3">
                    {chartHasData ? (
                      <TrendChart embedded labels={chartLabels} values={chartValues} />
                    ) : (
                      <DashboardEmpty
                        icon="fa-bar-chart"
                        text={t('panels.empty_chart')}
                        ctaHref={vis(uiVis, 'dash.btn.new') ? '/patients?action=new' : '/patients'}
                        ctaLabel={t('panels.empty_cta_patients')}
                      />
                    )}
                  </div>
                </DashboardPanel>
              </div>
            ) : null}

            {showAppts ? (
              <div className={showChart ? 'hms-dash-analytics__side' : 'hms-dash-analytics__full'}>
                <DashboardPanel
                  title={t('panels.recent_appointments')}
                  icon="fa-calendar-check-o"
                  iconTone="sky"
                  actionHref={vis(uiVis, 'dash.card.appointments') ? '/appointments' : undefined}
                  actionLabel={vis(uiVis, 'dash.card.appointments') ? t('common:actions.view_all') : undefined}
                  bodyClassName="hms-dash-panel__body--list"
                >
                  {recentAppts.length === 0 ? (
                    <DashboardEmpty
                      icon="fa-calendar-o"
                      text={t('panels.no_appointments')}
                      ctaHref="/appointments"
                      ctaLabel={t('panels.empty_cta_appointments')}
                    />
                  ) : (
                    <ul className="hms-dash-appt-list">
                      {recentAppts.map((ap, i) => (
                        <li key={i} className="hms-dash-appt-list__item">
                          <div className="hms-dash-appt-list__name">
                            {ap.patient_name || `${ap.first_name || ''} ${ap.last_name || ''}`.trim()}
                          </div>
                          <div className="hms-dash-appt-list__meta">
                            {[ap.doctor, ap.department].filter(Boolean).join(' · ')}
                          </div>
                          <div className="hms-dash-appt-list__time">
                            {ap.date}
                            {ap.time ? ` · ${ap.time}` : ''}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </DashboardPanel>
              </div>
            ) : null}
          </div>
        ) : null}

        {!isProfileDashboard && (showPatients || showDoctors) ? (
          <div className="hms-dash-directory">
            {showPatients ? (
              <div className={showDoctors ? 'hms-dash-directory__wide' : 'hms-dash-directory__full'}>
                <DashboardPanel
                  title={t('panels.new_patients')}
                  icon="fa-user-plus"
                  iconTone="brand"
                  actionHref={vis(uiVis, 'dash.card.patients') ? '/patients' : undefined}
                  actionLabel={vis(uiVis, 'dash.card.patients') ? t('common:actions.view_all') : undefined}
                  bodyClassName="hms-dash-panel__body--flush"
                >
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
                        ),
                      },
                      {
                        key: 'email',
                        label: t('panels.email'),
                        cellClassName: 'text-xs text-slate-500',
                        render: (row) => row.email || '—',
                      },
                      {
                        key: 'phone',
                        label: t('panels.phone'),
                        cellClassName: 'text-xs text-slate-500',
                        render: (row) => row.phone || '—',
                      },
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
                        },
                      },
                    ]}
                    rows={recentPatients}
                    rowKey="id"
                  />
                </DashboardPanel>
              </div>
            ) : null}

            {showDoctors ? (
              <div className={showPatients ? 'hms-dash-directory__side' : 'hms-dash-directory__full'}>
                <DashboardPanel
                  title={t('panels.doctors_on_duty')}
                  icon="fa-user-md"
                  iconTone="emerald"
                  bodyClassName="hms-dash-panel__body--list"
                >
                  {recentDoctors.length === 0 ? (
                    <DashboardEmpty
                      icon="fa-user-md"
                      text={t('panels.no_active_doctors')}
                      ctaHref="/doctors"
                      ctaLabel={t('panels.empty_cta_doctors')}
                    />
                  ) : (
                    <ul className="hms-dash-doctor-list">
                      {recentDoctors.map((doc) => (
                        <li key={doc.id || `${doc.first_name}-${doc.last_name}`} className="hms-dash-doctor-list__item">
                          <span className="hms-dash-doctor-list__avatar">
                            {initials(doc.first_name, doc.last_name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="hms-dash-doctor-list__name">
                              {doc.first_name} {doc.last_name}
                            </div>
                            <div className="hms-dash-doctor-list__role">
                              {doc.bio || doc.primary_department || t('panels.doctor_role')}
                            </div>
                          </div>
                          <span className="hms-dash-doctor-list__status" title={t('panels.active')} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {vis(uiVis, 'dash.card.doctors') ? (
                    <a href="/doctors" className="hms-dash-panel__footer-link">
                      {t('panels.view_all_doctors')}
                    </a>
                  ) : null}
                </DashboardPanel>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
