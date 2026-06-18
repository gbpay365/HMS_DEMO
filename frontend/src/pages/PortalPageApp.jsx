import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { HubOpdTodayPanel } from '../components/HubOpdTodayPanel';
import { PortalQuickActionCard, PortalQuickActions } from '../components/PortalQuickActionCard';
import { DirectorPortalShell } from '../components/DirectorPortalShell';
import { StaffPortalShell } from '../components/StaffPortalShell';
import { HubStatCard } from '../components/HubStatCard';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { hubItemLabel } from '../lib/hubI18n';
import { enrichHubStats, hubStatValue } from '../lib/hubStatCatalog';
import { VisitingDoctorVisitBanner } from './VisitingDoctorMyVisitPageApp';

export function PortalPageApp({
  portalMeta = {},
  me = {},
  tiles = [],
  statCards = [],
  heroActions = [],
  showHmsHub = false,
  hubStats = null,
  hubStatItems = [],
  hubModuleCards = [],
  showDailyDashboard = false,
  showWeeklyReport = false,
  showMonthlyReport = false,
  showAnnualScorecard = false,
  dashboardTabs = [],
  dashboardKpis = [],
  dashboardPanels = [],
  weeklyKpis = [],
  weeklyPanels = [],
  monthlyKpis = [],
  monthlyPanels = [],
  annualPanels = [],
  annualDomains = [],
  initialReport = '',
  showStaffDashboard = false,
  staffDashboardProfile = '',
  staffDashboardTabs = [],
  staffDashboardKpis = [],
  staffDashboardPanels = [],
  showOpdToday = false,
  todayVisits = [],
  visitingVisit = null,
  flash = null,
  error = null,
  childrenPanels = null}) {
  const { t } = useTranslation(['clinical', 'legacy', 'nav']);
  const color = portalMeta.color || '#714b67';
  const name = `${me.first_name || ''} ${me.last_name || ''}`.trim() || t('portal.staff');
  const portalCode = portalMeta.code || portalMeta.portal_code || '';
  const portalSubtitle = portalCode
    ? t(`portalDescriptions.${portalCode}`)
    : portalMeta.description || undefined;
  const [liveHubStats, setLiveHubStats] = useState(hubStats);

  const visibleHubStats = useMemo(() => enrichHubStats(hubStatItems), [hubStatItems]);

  const hubCardsAsTiles = useMemo(
    () =>
      (hubModuleCards || []).map((card) => ({
        code: card.code,
        label: card.label,
        url: card.url,
        icon: card.icon,
        color: card.color})),
    [hubModuleCards]
  );

  const showOpdQueueLink = hubModuleCards.some((c) => c.code === 'hub.card.opd_queue');

  useEffect(() => {
    setLiveHubStats(hubStats);
  }, [hubStats]);

  useEffect(() => {
    if (!showHmsHub) return undefined;
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch('/portal/api/hub-stats', { credentials: 'same-origin' });
        const data = await res.json();
        if (!cancelled && data.ok && data.stats) setLiveHubStats(data.stats);
      } catch (_) {
        /* polling optional */
      }
    }
    const timer = setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [showHmsHub]);

  if (showStaffDashboard && staffDashboardProfile) {
    return (
      <div className="page-wrapper hms-surface-module">
        <div className="content px-4 pb-10 pt-2 sm:px-6">
          <FlashMessages flash={flash} error={error} />
          <StaffPortalShell
            profile={staffDashboardProfile}
            showStaffDashboard={showStaffDashboard}
            staffDashboardTabs={staffDashboardTabs}
            staffDashboardKpis={staffDashboardKpis}
            staffDashboardPanels={staffDashboardPanels}
            tiles={tiles}
            portalColor={color}
          />
        </div>
      </div>
    );
  }

  if (showDailyDashboard || showWeeklyReport || showMonthlyReport || showAnnualScorecard) {
    return (
      <div className="page-wrapper hms-surface-module">
        <div className="content px-4 pb-10 pt-2 sm:px-6">
          <FlashMessages flash={flash} error={error} />
          <DirectorPortalShell
            showDailyDashboard={showDailyDashboard}
            showWeeklyReport={showWeeklyReport}
            showMonthlyReport={showMonthlyReport}
            showAnnualScorecard={showAnnualScorecard}
            dashboardTabs={dashboardTabs}
            dashboardKpis={dashboardKpis}
            dashboardPanels={dashboardPanels}
            weeklyKpis={weeklyKpis}
            weeklyPanels={weeklyPanels}
            monthlyKpis={monthlyKpis}
            monthlyPanels={monthlyPanels}
            annualPanels={annualPanels}
            annualDomains={annualDomains}
            initialReport={initialReport}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />
        <VisitingDoctorVisitBanner visit={visitingVisit} />

        <SurfaceHero
          title={`${name} — ${me.primary_department || t('portal.staff')}`}
          subtitle={portalSubtitle}
        >
          {heroActions.length ? (
            <div className="hms-surface-hero-actions mt-4">
              {heroActions.map((a) => (
                <a
                  key={a.href}
                  href={a.href}
                  className={a.variant === 'light' ? 'hms-btn-primary text-xs' : 'hms-btn-secondary text-xs'}
                  {...(a.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {a.labelKey ? t(a.labelKey, { ns: 'legacy' }) : a.label}
                </a>
              ))}
            </div>
          ) : null}
        </SurfaceHero>

        {statCards.length > 0 ? (
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {statCards.map((s) => (
              <StatCard key={s.label} label={s.label} value={s.value} tone={s.tone} />
            ))}
          </div>
        ) : null}

        {showHmsHub && visibleHubStats.length > 0 ? (
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {visibleHubStats.map((s) => (
              <HubStatCard
                key={s.code}
                label={hubItemLabel(s.code, s.label, t)}
                value={hubStatValue(liveHubStats, s.code)}
                icon={s.icon}
                color={s.color}
              />
            ))}
          </div>
        ) : null}

        {showHmsHub && (hubCardsAsTiles.length > 0 || showOpdToday) ? (
          <div className={`mb-6 grid gap-4 ${showOpdToday ? 'lg:grid-cols-3' : ''}`}>
            {hubCardsAsTiles.length > 0 ? (
              <div className={showOpdToday ? 'lg:col-span-2' : ''}>
                <h2 className="mb-3 text-sm font-bold text-ink">
                  {t('hub.clinical_modules', { ns: 'legacy' })}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {hubCardsAsTiles.map((card) => (
                    <PortalQuickActionCard key={card.code} tile={card} accentColor={color} compact />
                  ))}
                </div>
              </div>
            ) : null}
            {showOpdToday ? (
              <div className={hubCardsAsTiles.length > 0 ? '' : 'lg:col-span-3'}>
                <HubOpdTodayPanel visits={todayVisits} showOpdQueueLink={showOpdQueueLink} />
              </div>
            ) : null}
          </div>
        ) : null}

        {tiles.length > 0 ? <PortalQuickActions tiles={tiles} accentColor={color} /> : null}

        {childrenPanels}
      </div>
    </div>
  );
}
