import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PortalQuickActionCard } from './PortalQuickActionCard';
import { StaffOperationalDashboard } from './StaffOperationalDashboard';

export function StaffPortalShell({
  profile = 'front_desk',
  showStaffDashboard = false,
  staffDashboardTabs = [],
  staffDashboardKpis = [],
  staffDashboardPanels = [],
  tiles = [],
  portalColor = '#0ea5e9'}) {
  const { t } = useTranslation('clinical');
  const [view, setView] = useState(showStaffDashboard ? 'dashboard' : 'tiles');

  const tabClass = (active) =>
    `rounded-full px-4 py-2 text-xs font-bold transition ${
      active ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
    }`;

  return (
    <div>
      {showStaffDashboard && tiles.length > 0 ? (
        <div className="mb-4 rounded-xl bg-slate-100 p-2 ring-1 ring-slate-200">
          <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {t('staffDashboard.portal_heading')}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setView('dashboard')} className={tabClass(view === 'dashboard')}>
              {t('staffDashboard.view_dashboard')}
            </button>
            <button type="button" onClick={() => setView('tiles')} className={tabClass(view === 'tiles')}>
              {t('staffDashboard.view_modules')}
            </button>
          </div>
        </div>
      ) : null}

      {view === 'dashboard' && showStaffDashboard ? (
        <StaffOperationalDashboard
          profile={profile}
          dashboardTabs={staffDashboardTabs}
          dashboardKpis={staffDashboardKpis}
          dashboardPanels={staffDashboardPanels}
        />
      ) : null}

      {view === 'tiles' && tiles.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => (
            <PortalQuickActionCard key={tile.code} tile={tile} accentColor={portalColor} compact />
          ))}
        </div>
      ) : null}

      {view === 'tiles' && !tiles.length && showStaffDashboard ? (
        <StaffOperationalDashboard
          profile={profile}
          dashboardTabs={staffDashboardTabs}
          dashboardKpis={staffDashboardKpis}
          dashboardPanels={staffDashboardPanels}
        />
      ) : null}
    </div>
  );
}
