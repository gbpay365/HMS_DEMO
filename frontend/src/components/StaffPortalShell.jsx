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
  const useMergedQuickActions = showStaffDashboard && tiles.length > 0;

  return (
    <div className="hms-staff-portal-shell">
      {showStaffDashboard ? (
        <StaffOperationalDashboard
          profile={profile}
          dashboardTabs={staffDashboardTabs}
          dashboardKpis={staffDashboardKpis}
          dashboardPanels={staffDashboardPanels}
          portalTiles={useMergedQuickActions ? tiles : []}
          portalColor={portalColor}
          hideQuickActionsPanel={useMergedQuickActions}
        />
      ) : null}

      {!showStaffDashboard && tiles.length > 0 ? (
        <PortalQuickActions tiles={tiles} accentColor={portalColor} />
      ) : null}
    </div>
  );
}
