'use strict';

const { KPI_DEFS, PANEL_DEFS, buildVisibleDashboardModel } = require('./directorDashboardCatalog');
const { formatRangeLabel } = require('./hmsDirectorReportsPeriod');
const {
  parseDailyDate,
  fetchDailyAll,
  fetchPatientFlowHourly,
  fetchBedsByWard,
  fetchStaffByDepartment,
  fetchLabOverdue,
  fetchLabCritical,
  fetchPharmacyStockAlerts,
  fetchRevenueByCategory,
} = require('./hmsDailyDashboard');

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtXaf(v) {
  return `${Math.round(n(v)).toLocaleString('en-GB', { maximumFractionDigits: 0 })} XAF`;
}

function hoursAgoLabel(fromDate) {
  if (!fromDate) return '—';
  const ms = Date.now() - new Date(fromDate).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function mapLabAlerts(overdue, critical) {
  const items = [];
  for (const r of critical || []) {
    items.push({
      id: `LAB-${r.order_id}`,
      patient: r.patient_name,
      test: r.test_name,
      ordered: r.ordered_at ? new Date(r.ordered_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—',
      elapsed: `${r.elapsed_hours}h`,
      status: 'critical',
    });
  }
  for (const r of overdue || []) {
    if (items.some((x) => x.id === `LAB-${r.order_id}`)) continue;
    items.push({
      id: `LAB-${r.order_id}`,
      patient: r.patient_name,
      test: r.test_name,
      ordered: r.ordered_at ? new Date(r.ordered_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—',
      elapsed: `${r.elapsed_hours}h`,
      status: 'overdue',
    });
  }
  return items;
}

function mapPharmacyAlerts(stockAlerts) {
  return (stockAlerts || []).map((r) => ({
    drug: r.generic_name,
    stock: n(r.total_stock),
    minStock: n(r.reorder_level),
    type: r.alert_type,
  }));
}

function mapWards(byWard) {
  return (byWard || []).map((w) => ({
    name: w.ward_name,
    total: n(w.total),
    occupied: n(w.occupied),
    reserved: n(w.reserved),
    maintenance: n(w.out_of_service),
  }));
}

function mapStaff(staffRows) {
  return (staffRows || []).map((r) => ({
    dept: r.dept_name,
    role: r.role,
    scheduled: n(r.scheduled),
    present: n(r.present),
    status: r.status,
  }));
}

function mapPatientFlow(hourly) {
  return (hourly || []).map((h) => ({
    hour: h.label,
    admitted: n(h.admitted),
    discharged: n(h.discharged),
    emergency: n(h.emergency),
  }));
}

function mapRevenueItems(byCategory) {
  return (byCategory || []).map((r) => ({
    category: r.category,
    key: r.key,
    collected: n(r.collected),
    billed: n(r.billed),
  }));
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ start: string, end: string, period?: string, label?: string }} range
 * @param {{ aclPack?: object, revenueStatCodes?: string[] }} opts
 */
async function fetchDirectorDailyDashboard(pool, range, opts = {}) {
  const model = buildVisibleDashboardModel(opts.aclPack || {});
  const start = String(range?.start || '').trim();
  const end = String(range?.end || start).trim();
  const dateStr = end || start;

  const all = await fetchDailyAll(pool, dateStr, {
    aclPack: opts.aclPack || {},
    revenueStatCodes: opts.revenueStatCodes || model.revenueStats.map((s) => s.code),
  });

  const pf = all.patientFlow || {};
  const pfSummary = pf.summary || {};
  const beds = all.beds || {};
  const bedSummary = beds.summary || {};
  const staff = all.staff || {};
  const rev = all.revenue || {};
  const revSummary = rev.summary || {};
  const lab = all.lab || {};
  const pharm = all.pharmacy || {};

  const patientFlow = mapPatientFlow(pf.hourly);
  const wards = mapWards(beds.byWard);
  const staffRows = mapStaff(staff.byDepartment);
  const revenueItems = mapRevenueItems(rev.byCategory);
  const labAlerts = mapLabAlerts(lab.overdue, lab.critical);
  const pharmacyAlerts = mapPharmacyAlerts(pharm.stockAlerts);

  const patientsToday = n(pfSummary.opd_visits) + n(pfSummary.er_visits);
  const patientsDelta = n(pfSummary.opd_delta) + n(pfSummary.er_delta);
  const bedOccupancyPct = n(bedSummary.occupancy_pct);
  const bedsOccupied = n(bedSummary.occupied);
  const bedTotal = n(bedSummary.total_beds);
  const erWaitMin = Math.round(n(pf.erWait?.avg_wait_today));
  const erWaitDelta = Math.round(n(pf.erWait?.wait_delta_minutes));
  const collectedTotal = n(revSummary.total_collected);
  const billedTotal = n(revSummary.total_billed) || collectedTotal;
  const revenueRate = n(revSummary.collection_rate_pct);
  const flowAdmitted = n(pfSummary.admitted);
  const flowDischarged = n(pfSummary.discharged);
  const staffAbsent = staffRows.reduce((sum, row) => sum + Math.max(0, n(row.scheduled) - n(row.present)), 0);
  const pendingLab = n(lab.summary?.pending) + n(lab.summary?.processing);
  const labOverdue = n(lab.summary?.overdue);

  const revenueTarget = billedTotal || Math.round(collectedTotal * 1.12) || 1;
  const revenueTargetRate = Math.round((collectedTotal / revenueTarget) * 100);

  const criticalAlerts = [
    ...labAlerts.filter((a) => a.status === 'critical').map((a) => ({
      type: 'lab',
      id: a.id,
      patient: a.patient,
      test: a.test,
      elapsed: a.elapsed,
      action: 'ACT NOW',
    })),
    ...pharmacyAlerts.filter((p) => p.type === 'out').map((p) => ({
      type: 'pharmacy',
      id: p.drug,
      drug: p.drug,
      action: 'REORDER',
    })),
  ];

  const kpi = {
    patientsToday: {
      value: patientsToday,
      sub: `${patientsDelta >= 0 ? '+' : ''}${patientsDelta} vs yesterday`,
      delta: patientsDelta,
      spark: patientFlow.map((r) => r.admitted).slice(-9),
    },
    bedOccupancy: {
      value: `${bedOccupancyPct}%`,
      sub: `${bedsOccupied} occupied / ${bedTotal} total`,
      pct: bedOccupancyPct,
    },
    erWait: {
      value: `${erWaitMin} min`,
      sub: erWaitDelta > 0 ? `↑ ${erWaitDelta} min from yesterday` : erWaitDelta < 0 ? `↓ ${Math.abs(erWaitDelta)} min from yesterday` : 'No change from yesterday',
      delta: erWaitDelta,
      spark: patientFlow.map((r) => r.emergency || r.admitted).slice(-8),
    },
    revenueToday: {
      value: collectedTotal,
      sub: `${revenueTargetRate}% of ${fmtXaf(revenueTarget)} target`,
      target: revenueTarget,
      rate: revenueTargetRate,
    },
    staffOnDuty: {
      value: n(staff.summary?.present),
      sub: `${staffAbsent} unplanned absent`,
      absent: staffAbsent,
    },
    pendingLab: {
      value: pendingLab,
      sub: `${labOverdue} overdue (>4 hrs)`,
      overdue: labOverdue,
    },
    flowAdmitted: { value: flowAdmitted },
    flowDischarged: { value: flowDischarged },
    flowNet: { value: flowAdmitted - flowDischarged },
    revenueCollected: { value: collectedTotal },
    revenueBilled: { value: billedTotal },
    revenueRate: { value: `${revenueRate}%` },
  };

  return {
    range: {
      period: range.period || 'day',
      start,
      end,
      label: range.label || formatRangeLabel(range.period || 'day', start, end),
    },
    dateLabel: new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    kpi,
    patientFlow,
    wards,
    staff: staffRows,
    revenue: revenueItems,
    revenueTotals: {},
    labAlerts,
    pharmacyAlerts,
    criticalAlerts,
    alertCount:
      labAlerts.filter((a) => a.status === 'critical').length +
      pharmacyAlerts.filter((p) => p.type === 'out' || p.type === 'critical').length,
    dailyAll: all,
    updatedAt: new Date().toISOString(),
    visible: {
      tabs: model.tabs.map((t) => t.id),
      kpis: model.kpis.map((k) => k.dataKey),
      panels: model.panels.map((p) => p.dataKey),
    },
  };
}

module.exports = {
  fetchDirectorDailyDashboard,
};
