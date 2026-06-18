import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DirectorDailyDashboard } from './DirectorDailyDashboard';
import { DirectorWeeklyReport } from './DirectorWeeklyReport';
import { DirectorMonthlyPL } from './DirectorMonthlyPL';
import { DirectorAnnualScorecard } from './DirectorAnnualScorecard';
import { DirectorPortalNav, DirectorPortalTab } from './director/DirectorReportChrome';

export function DirectorPortalShell({
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
  initialReport = ''}) {
  const { t } = useTranslation('clinical');
  const views = [];
  if (showDailyDashboard) views.push('daily');
  if (showWeeklyReport) views.push('weekly');
  if (showMonthlyReport) views.push('monthly');
  if (showAnnualScorecard) views.push('annual');

  const readReportFromUrl = () => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('report') || '';
  };

  const pickView = (report) => {
    const candidate = String(report || '').toLowerCase();
    if (candidate && views.includes(candidate)) return candidate;
    return views[0] || 'daily';
  };

  const [view, setView] = useState(() => pickView(initialReport || readReportFromUrl()));

  const selectView = (next) => {
    if (!views.includes(next)) return;
    setView(next);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (next === views[0]) url.searchParams.delete('report');
    else url.searchParams.set('report', next);
    window.history.replaceState({}, '', url);
  };

  if (views.length > 1) {
    return (
      <div>
        <DirectorPortalNav label={t('directorPortal.reports_heading')}>
          {showDailyDashboard && (
            <DirectorPortalTab active={view === 'daily'} onClick={() => selectView('daily')}>
              {t('directorPortal.view_daily')}
            </DirectorPortalTab>
          )}
          {showWeeklyReport && (
            <DirectorPortalTab active={view === 'weekly'} onClick={() => selectView('weekly')}>
              {t('directorPortal.view_weekly')}
            </DirectorPortalTab>
          )}
          {showMonthlyReport && (
            <DirectorPortalTab active={view === 'monthly'} onClick={() => selectView('monthly')}>
              {t('directorPortal.view_monthly')}
            </DirectorPortalTab>
          )}
          {showAnnualScorecard && (
            <DirectorPortalTab active={view === 'annual'} onClick={() => selectView('annual')}>
              {t('directorPortal.view_annual')}
            </DirectorPortalTab>
          )}
        </DirectorPortalNav>
        {view === 'daily' && showDailyDashboard && (
          <DirectorDailyDashboard
            dashboardTabs={dashboardTabs}
            dashboardKpis={dashboardKpis}
            dashboardPanels={dashboardPanels}
          />
        )}
        {view === 'weekly' && showWeeklyReport && (
          <DirectorWeeklyReport weeklyKpis={weeklyKpis} weeklyPanels={weeklyPanels} />
        )}
        {view === 'monthly' && showMonthlyReport && (
          <DirectorMonthlyPL monthlyKpis={monthlyKpis} monthlyPanels={monthlyPanels} />
        )}
        {view === 'annual' && showAnnualScorecard && (
          <DirectorAnnualScorecard annualPanels={annualPanels} annualDomains={annualDomains} />
        )}
      </div>
    );
  }

  if (showAnnualScorecard) {
    return <DirectorAnnualScorecard annualPanels={annualPanels} annualDomains={annualDomains} />;
  }

  if (showMonthlyReport) {
    return <DirectorMonthlyPL monthlyKpis={monthlyKpis} monthlyPanels={monthlyPanels} />;
  }

  if (showWeeklyReport) {
    return <DirectorWeeklyReport weeklyKpis={weeklyKpis} weeklyPanels={weeklyPanels} />;
  }

  return (
    <DirectorDailyDashboard
      dashboardTabs={dashboardTabs}
      dashboardKpis={dashboardKpis}
      dashboardPanels={dashboardPanels}
    />
  );
}
