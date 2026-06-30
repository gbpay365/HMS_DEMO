import { PortalQuickActions } from './PortalQuickActionCard';
import { StaffOperationalDashboard } from './StaffOperationalDashboard';

export function StaffPortalShell({
  profile = 'front_desk',
  showStaffDashboard = false,
  staffDashboardTabs = [],
  staffDashboardKpis = [],
  staffDashboardPanels = [],
  tiles = [],
  portalColor = '#0ea5e9',
}) {
  return (
    <div className="hms-staff-portal-shell">
      {showStaffDashboard ? (
        <StaffOperationalDashboard
          profile={profile}
          dashboardTabs={staffDashboardTabs}
          dashboardKpis={staffDashboardKpis}
          dashboardPanels={staffDashboardPanels}
        />
      ) : null}

      {tiles.length > 0 ? (
        <section className={showStaffDashboard ? 'hms-staff-shortcuts-wrap mt-8 border-t border-slate-200/80 pt-6' : ''}>
          <PortalQuickActions tiles={tiles} accentColor={portalColor} dense={showStaffDashboard} />
        </section>
      ) : null}
    </div>
  );
}
