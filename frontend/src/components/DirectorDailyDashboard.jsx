import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatDashboardAmount,
  formatDashboardMoney,
  kpisForTab,
  kpiLabel,
  panelLabel,
  panelsForTab,
  tabLabel} from '../lib/directorDashboardCatalog';
import { RPT } from '../lib/directorReportTheme';
import {
  DirectorKpiCard,
  DirectorPanel,
  DirectorReportBody,
  DirectorReportError,
  DirectorReportHero,
  DirectorReportLoading,
  DirectorReportShell,
  DirectorReportTabs,
  DirectorSection} from './director/DirectorReportChrome';

const C = RPT;

const KPI_ICONS = {
  patients_today: 'fa-hospital-o',
  bed_occupancy: 'fa-bed',
  er_wait: 'fa-ambulance',
  revenue_today: 'fa-money',
  staff_onduty: 'fa-users',
  pending_lab: 'fa-flask',
  flow_admitted: 'fa-sign-in',
  flow_discharged: 'fa-sign-out',
  flow_net: 'fa-building-o',
  revenue_collected: 'fa-money',
  revenue_billed: 'fa-file-text-o',
  revenue_rate: 'fa-pie-chart'};

function formatOrderedTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function bucketFlow(hourly) {
  const rows = hourly?.length ? hourly : [];
  if (!rows.length) return [{ hour: '—', admitted: 0, discharged: 0 }];
  const out = [];
  for (let i = 0; i < rows.length; i += 2) {
    const pair = rows.slice(i, i + 2);
    out.push({
      hour: pair[0]?.hour || '—',
      admitted: pair.reduce((s, r) => s + Number(r.admitted || 0), 0),
      discharged: pair.reduce((s, r) => s + Number(r.discharged || 0), 0)});
  }
  return out;
}

function mapApiToDashboard(json, locale = 'en') {
  const pf = json.patientFlow || {};
  const pfSum = pf.summary || {};
  const beds = json.beds?.summary || {};
  const staff = json.staff || {};
  const rev = json.revenue || {};
  const revSum = rev.summary || {};
  const lab = json.lab || {};
  const pharm = json.pharmacy || {};

  const hourly = (pf.hourly || []).map((h) => ({
    hour: h.label,
    admitted: h.admitted || 0,
    discharged: h.discharged || 0,
    emergency: h.emergency || 0}));

  const staffRows = (staff.byDepartment || []).map((r) => ({
    dept: r.dept_name,
    role: r.role,
    scheduled: r.scheduled,
    present: r.present,
    status: r.status}));

  const wards = (json.beds?.byWard || []).map((w) => ({
    name: w.ward_name,
    total: w.total,
    occupied: w.occupied,
    reserved: w.reserved,
    maintenance: w.out_of_service}));

  const revenueItems = (rev.byCategory || []).map((r) => ({
    category: r.category,
    key: r.key,
    collected: r.collected,
    billed: r.billed}));

  const labAlerts = [
    ...(lab.critical || []).map((r) => ({
      id: `LAB-${r.order_id}`,
      patient: r.patient_name,
      test: r.test_name,
      ordered: formatOrderedTime(r.ordered_at),
      elapsed: `${r.elapsed_hours}h`,
      status: 'critical'})),
    ...(lab.overdue || []).map((r) => ({
      id: `LAB-${r.order_id}`,
      patient: r.patient_name,
      test: r.test_name,
      ordered: formatOrderedTime(r.ordered_at),
      elapsed: `${r.elapsed_hours}h`,
      status: 'overdue'})),
  ];

  const pharmacyAlerts = (pharm.stockAlerts || []).map((r) => ({
    drug: r.generic_name,
    stock: r.total_stock,
    minStock: r.reorder_level,
    type: r.alert_type}));

  const patientsToday = (pfSum.opd_visits || 0) + (pfSum.er_visits || 0);
  const patientsDelta = (pfSum.opd_delta || 0) + (pfSum.er_delta || 0);
  const collectedTotal = revSum.total_collected || 0;
  const billedTotal = revSum.total_billed || collectedTotal;
  const revenueRate = revSum.collection_rate_pct || 0;
  const erWaitMin = Math.round(pf.erWait?.avg_wait_today || 0);
  const erWaitDelta = Math.round(pf.erWait?.wait_delta_minutes || 0);
  const flowAdmitted = pfSum.admitted || 0;
  const flowDischarged = pfSum.discharged || 0;
  const staffPresent = staff.summary?.present || 0;
  const staffScheduled = staff.summary?.scheduled || staffPresent;
  const staffAbsent = Math.max(0, staffScheduled - staffPresent);
  const pendingLab = (lab.summary?.pending || 0) + (lab.summary?.processing || 0);
  const labOverdue = lab.summary?.overdue || 0;
  const revenueTarget = billedTotal || Math.round(collectedTotal * 1.12) || 1;
  const revenueTargetRate = Math.round((collectedTotal / revenueTarget) * 100);
  const flowChart = bucketFlow(hourly);

  return {
    dateLabel: new Date().toLocaleDateString(locale.startsWith('fr') ? 'fr-FR' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'}),
    kpi: {
      patientsToday: {
        value: patientsToday,
        sub: `${patientsDelta >= 0 ? '+' : ''}${patientsDelta} vs yesterday`,
        delta: patientsDelta,
        spark: hourly.map((r) => r.admitted).slice(-9)},
      bedOccupancy: {
        value: `${beds.occupancy_pct || 0}%`,
        sub: `${beds.occupied || 0} occupied / ${beds.total_beds || 0} total`,
        pct: beds.occupancy_pct || 0},
      erWait: {
        value: `${erWaitMin} min`,
        sub:
          erWaitDelta > 0
            ? `↑ ${erWaitDelta} min from yesterday`
            : erWaitDelta < 0
              ? `↓ ${Math.abs(erWaitDelta)} min from yesterday`
              : 'No change from yesterday',
        delta: erWaitDelta,
        spark: hourly.map((r) => r.emergency || r.admitted).slice(-8)},
      revenueToday: {
        value: collectedTotal,
        sub: `${revenueTargetRate}% of ${formatDashboardMoney(revenueTarget)} target`,
        target: revenueTarget,
        rate: revenueTargetRate},
      staffOnDuty: {
        value: staffPresent,
        sub: `${staffAbsent} unplanned absent`,
        absent: staffAbsent,
        scheduled: staffScheduled},
      pendingLab: {
        value: pendingLab,
        sub: `${labOverdue} overdue (>4 hrs)`,
        overdue: labOverdue},
      flowAdmitted: { value: flowAdmitted },
      flowDischarged: { value: flowDischarged },
      flowNet: { value: flowAdmitted - flowDischarged },
      revenueCollected: { value: collectedTotal },
      revenueBilled: { value: billedTotal },
      revenueRate: { value: `${revenueRate}%` }},
    patientFlow: hourly,
    flowChart,
    bedsOccupied: beds.occupied || 0,
    bedsTotal: beds.total_beds || 0,
    wards,
    staff: staffRows,
    revenue: revenueItems,
    labAlerts,
    pharmacyAlerts,
    criticalAlerts: [
      ...labAlerts
        .filter((a) => a.status === 'critical')
        .map((a) => ({
          type: 'lab',
          id: a.id,
          patient: a.patient,
          test: a.test,
          elapsed: a.elapsed,
          action: 'ACT NOW'})),
      ...pharmacyAlerts
        .filter((p) => p.type === 'out')
        .map((p) => ({
          type: 'pharmacy',
          id: p.drug,
          drug: p.drug,
          action: 'REORDER'})),
    ],
    alertCount:
      labAlerts.filter((a) => a.status === 'critical').length +
      pharmacyAlerts.filter((p) => p.type === 'out' || p.type === 'critical').length,
    dailyAll: json};
}

function Sparkbar({ data, color = C.blue, height = 32 }) {
  const values = data?.length ? data : [0];
  const max = Math.max(...values, 1);
  const w = 6;
  const gap = 3;
  const totalW = values.length * (w + gap) - gap;
  return (
    <svg width={totalW} height={height} className="hms-dr-chart-svg">
      {values.map((v, i) => {
        const barH = max === 0 ? 0 : Math.max(2, (v / max) * height);
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={height - barH}
            width={w}
            height={barH}
            rx={2}
            fill={color}
            opacity={0.7 + 0.3 * (i / Math.max(values.length - 1, 1))}
          />
        );
      })}
    </svg>
  );
}

function KpiCard({ icon, label, value, sub, subColor, accent = C.brand, spark }) {
  return (
    <DirectorKpiCard
      label={label}
      value={value}
      sub={sub}
      subColor={subColor}
      accent={accent}
      icon={icon}
      spark={spark?.length ? <div className="mt-1"><Sparkbar data={spark} color={accent} /></div> : null}
    />
  );
}

function SectionHeader({ title, subtitle }) {
  return <DirectorSection title={title} subtitle={subtitle} accent={C.brand} />;
}

function BedGrid({ wards }) {
  const legend = [
    { label: 'Occupied', color: C.blue },
    { label: 'Reserved', color: C.amber },
    { label: 'Available', color: C.green },
    { label: 'Maintenance', color: C.textDim },
  ];
  return (
    <div>
      <div className="hms-dr-legend">
        {legend.map((l) => (
          <div key={l.label} className="hms-dr-legend__item">
            <div className="hms-dr-legend__dot" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
      <div className="hms-dr-ward-cards">
        {(wards || []).map((w) => {
          const avail = w.total - w.occupied - w.reserved - w.maintenance;
          const pct = w.total ? Math.round((w.occupied / w.total) * 100) : 0;
          const barColor = pct >= 90 ? C.red : pct >= 75 ? C.amber : C.blue;
          return (
            <div key={w.name} className="hms-dr-ward-card">
              <div className="hms-dr-ward-card__label">{w.name}</div>
              <div className="hms-dr-ward-card__track">
                <div
                  className="hms-dr-ward-card__fill"
                  style={{ width: `${pct}%`, background: barColor, transition: 'width 0.4s' }}
                />
              </div>
              <div className="hms-dr-ward-card__meta">
                <span>
                  {w.occupied}/{w.total}
                </span>
                <span style={{ color: barColor, fontWeight: 600 }}>{pct}%</span>
              </div>
              <div className="hms-dr-ward-pills">
                {w.reserved > 0 ? <span className="hms-dr-tag hms-dr-tag--amber">{w.reserved} res</span> : null}
                {w.maintenance > 0 ? <span className="hms-dr-tag hms-dr-tag--muted">{w.maintenance} maint</span> : null}
                {avail > 0 ? <span className="hms-dr-tag hms-dr-tag--green">{avail} free</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FlowChart({ data }) {
  const rows = data?.length ? data : [{ hour: '—', admitted: 0, discharged: 0 }];
  const maxVal = Math.max(...rows.map((d) => Math.max(d.admitted, d.discharged)), 1);
  const chartH = 100;
  const barW = 16;
  const gap = 6;
  const groupW = barW * 2 + gap + 10;
  const totalW = rows.length * groupW;

  return (
    <div className="hms-dr-table-wrap">
      <svg width={totalW} height={chartH + 30} className="hms-dr-chart-svg">
        {rows.map((d, i) => {
          const x = i * groupW;
          const admH = maxVal === 0 ? 0 : (d.admitted / maxVal) * chartH;
          const disH = maxVal === 0 ? 0 : (d.discharged / maxVal) * chartH;
          return (
            <g key={`${d.hour}-${i}`}>
              <rect x={x} y={chartH - admH} width={barW} height={admH} rx={2} fill={C.blue} opacity={0.85} />
              <rect
                x={x + barW + gap}
                y={chartH - disH}
                width={barW}
                height={disH}
                rx={2}
                fill={C.green}
                opacity={0.75}
              />
              <text x={x + barW} y={chartH + 14} textAnchor="middle" fontSize={9} fill={C.textDim}>
                {d.hour}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="hms-dr-legend" style={{ marginTop: 4 }}>
        <div className="hms-dr-legend__item">
          <div className="hms-dr-legend__dot" style={{ background: C.blue, width: 10, height: 10 }} /> Admitted
        </div>
        <div className="hms-dr-legend__item">
          <div className="hms-dr-legend__dot" style={{ background: C.green, width: 10, height: 10 }} /> Discharged
        </div>
      </div>
    </div>
  );
}

function RevenuePanel({ items }) {
  const { t } = useTranslation('clinical');
  const totalCollected = (items || []).reduce((s, i) => s + Number(i.collected || 0), 0);
  const totalBilled = (items || []).reduce((s, i) => s + Number(i.billed || 0), 0);

  return (
    <div className="hms-dr-stack">
      {(items || []).map((item) => {
        const pct = item.billed ? Math.round((item.collected / item.billed) * 100) : 100;
        const barColor = pct >= 90 ? C.green : pct >= 70 ? C.amber : C.red;
        return (
          <div key={item.key || item.category}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: C.text }}>{item.category}</span>
              <span style={{ fontSize: 12, color: C.textMuted }}>
                {formatDashboardAmount(item.collected)}{' '}
                <span style={{ color: C.textDim }}>/ {formatDashboardAmount(item.billed)}</span>
              </span>
            </div>
            <div style={{ height: 4, background: C.border, borderRadius: 2 }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(pct, 100)}%`,
                  background: barColor,
                  borderRadius: 2}}
              />
            </div>
          </div>
        );
      })}
      <div
        style={{
          marginTop: 6,
          paddingTop: 8,
          borderTop: `0.5px solid ${C.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12}}
      >
        <span style={{ color: C.textMuted }}>{t('directorDashboard.total_collected')}</span>
        <span style={{ color: C.green, fontWeight: 600 }}>
          {formatDashboardAmount(totalCollected)}
          <span style={{ color: C.textDim, fontWeight: 400 }}> / {formatDashboardAmount(totalBilled)}</span>
        </span>
      </div>
    </div>
  );
}

function StaffTable({ staff, t }) {
  const cols = [
    t('directorDashboard.staff_col_department'),
    t('directorDashboard.staff_col_role'),
    t('directorDashboard.staff_col_scheduled'),
    t('directorDashboard.staff_col_present'),
    t('directorDashboard.staff_col_status'),
  ];
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {cols.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '6px 10px',
                  color: C.textMuted,
                  fontWeight: 500,
                  borderBottom: `0.5px solid ${C.border}`}}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(staff || []).map((s, i) => (
            <tr key={`${s.dept}-${s.role}-${i}`} style={{ background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
              <td style={{ padding: '7px 10px', color: C.text }}>{s.dept}</td>
              <td style={{ padding: '7px 10px', color: C.textMuted }}>{s.role}</td>
              <td style={{ padding: '7px 10px', color: C.textMuted }}>{s.scheduled}</td>
              <td
                style={{
                  padding: '7px 10px',
                  color: s.present < s.scheduled ? C.amber : C.green,
                  fontWeight: 600}}
              >
                {s.present}
              </td>
              <td style={{ padding: '7px 10px' }}>
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 20,
                    fontWeight: 500,
                    background: s.status === 'ok' ? C.greenLight : C.amberLight,
                    color: s.status === 'ok' ? C.green : C.amber}}
                >
                  {s.status === 'ok'
                    ? t('directorDashboard.status_full_staffed')
                    : t('directorDashboard.status_absent', {
                        count: s.scheduled - s.present})}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LabAlerts({ alerts }) {
  const statusConfig = {
    critical: { bg: C.redLight, color: C.red, label: 'Critical' },
    overdue: { bg: C.amberLight, color: C.amber, label: 'Overdue' },
    pending: { bg: 'rgba(255,255,255,0.04)', color: C.textMuted, label: 'Pending' }};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(alerts || []).map((a) => {
        const s = statusConfig[a.status] || statusConfig.pending;
        return (
          <div
            key={a.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              background: C.surfaceAlt,
              border: `0.5px solid ${C.border}`,
              borderRadius: 8}}
          >
            <div style={{ flex: '0 0 72px', fontSize: 10, color: C.textDim }}>{a.id}</div>
            <div style={{ flex: 1, fontSize: 12, color: C.text }}>{a.patient}</div>
            <div style={{ flex: 2, fontSize: 12, color: C.textMuted }}>{a.test}</div>
            <div style={{ flex: '0 0 60px', fontSize: 11, color: C.textDim }}>{a.elapsed}</div>
            <span
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 20,
                background: s.bg,
                color: s.color,
                fontWeight: 600}}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PharmacyAlerts({ items }) {
  const typeConfig = {
    out: { bg: C.redLight, color: C.red, label: 'Out of stock' },
    critical: { bg: '#4A1A00', color: '#FF6B2B', label: 'Critical' },
    low: { bg: C.amberLight, color: C.amber, label: 'Low stock' }};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(items || []).map((item) => {
        const cfg = typeConfig[item.type] || typeConfig.low;
        const pct = item.minStock ? Math.round((item.stock / item.minStock) * 100) : 0;
        return (
          <div
            key={item.drug}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              background: C.surfaceAlt,
              border: `0.5px solid ${C.border}`,
              borderRadius: 8}}
          >
            <div style={{ flex: 1, fontSize: 12, color: C.text }}>{item.drug}</div>
            <div style={{ flex: '0 0 100px' }}>
              <div style={{ height: 4, background: C.border, borderRadius: 2 }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(pct, 100)}%`,
                    background: cfg.color,
                    borderRadius: 2}}
                />
              </div>
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                {item.stock} / {item.minStock} min
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 20,
                background: cfg.bg,
                color: cfg.color,
                fontWeight: 600}}
            >
              {cfg.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CriticalAlerts({ alerts }) {
  return (
    <div className="hms-dr-stack">
      {(alerts || []).map((a) => (
        <div
          key={a.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            background: C.redLight,
            borderRadius: 8,
            border: `0.5px solid ${C.red}22`}}
        >
          <span style={{ fontSize: 14 }}>{a.type === 'lab' ? '🔬' : '💊'}</span>
          <span style={{ fontSize: 12, color: C.text, flex: 1 }}>
            {a.type === 'lab' ? (
              <>
                Lab result critical — <strong>{a.patient}</strong> · {a.test} · {a.elapsed} elapsed
              </>
            ) : (
              <>
                Out of stock — <strong>{a.drug}</strong> · Zero units remaining
              </>
            )}
          </span>
          <span style={{ fontSize: 10, color: C.red, fontWeight: 600 }}>{a.action}</span>
        </div>
      ))}
    </div>
  );
}

function LiveClock({ light }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span
      style={{
        fontSize: 13,
        color: light ? 'rgba(255,255,255,0.88)' : C.textMuted,
        fontVariantNumeric: 'tabular-nums'}}
    >
      {time.toLocaleTimeString('en-GB')}
    </span>
  );
}

function kpiAccent(kpi, row) {
  if (kpi.id === 'bed_occupancy') {
    const pct = Number(row?.pct || 0);
    if (pct >= 90) return C.red;
    if (pct >= 75) return C.amber;
    return C.blue;
  }
  const map = {
    patients_today: C.blue,
    er_wait: C.red,
    revenue_today: C.green,
    staff_onduty: C.purple,
    pending_lab: C.amber,
    flow_admitted: C.blue,
    flow_discharged: C.green,
    flow_net: C.purple,
    revenue_collected: C.green,
    revenue_billed: C.blue,
    revenue_rate: C.amber};
  return map[kpi.id] || kpi.color || C.blue;
}

function kpiSubColor(kpi, row) {
  if (kpi.id === 'patients_today') return (row?.delta ?? 0) >= 0 ? C.blue : C.green;
  if (kpi.id === 'bed_occupancy') {
    const pct = Number(row?.pct || 0);
    if (pct >= 90) return C.red;
    if (pct >= 75) return C.amber;
    return C.green;
  }
  if (kpi.id === 'er_wait') return C.red;
  if (kpi.id === 'revenue_today') return (row?.rate ?? 0) >= 90 ? C.green : C.amber;
  if (kpi.id === 'staff_onduty' || kpi.id === 'pending_lab') return C.amber;
  return C.textMuted;
}

function renderKpiValue(kpi, data) {
  const row = data?.kpi?.[kpi.dataKey];
  if (!row) return '—';
  if (
    kpi.dataKey === 'revenueToday' ||
    kpi.dataKey === 'revenueCollected' ||
    kpi.dataKey === 'revenueBilled'
  ) {
    return formatDashboardMoney(row.value);
  }
  return row.value ?? '—';
}

function panelWrap(children) {
  return <DirectorPanel>{children}</DirectorPanel>;
}

export function DirectorDailyDashboard({
  dashboardTabs = [],
  dashboardKpis = [],
  dashboardPanels = []}) {
  const { t, i18n } = useTranslation('clinical');
  const [activeTab, setActiveTab] = useState(() => dashboardTabs[0]?.id || 'overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const visibleTabs = useMemo(() => dashboardTabs, [dashboardTabs]);

  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/portal/api/daily/today/all', { credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || t('directorDashboard.load_error'));
      setData(mapApiToDashboard(json, i18n.language || 'en'));
    } catch (err) {
      setError(err.message || t('directorDashboard.load_error'));
    } finally {
      setLoading(false);
    }
  }, [t, i18n.language]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  const tabKpis = kpisForTab(dashboardKpis, activeTab);
  const tabPanels = panelsForTab(dashboardPanels, activeTab);
  const bedPct = Number(data?.kpi?.bedOccupancy?.pct || 0);

  return (
    <DirectorReportShell variant="daily">
      <DirectorReportHero
        icon="fa-dashboard"
        title={t('directorDashboard.title')}
        subtitle={data?.dateLabel || '—'}
        live
        liveLabel={t('directorDashboard.live')}
        actions={<LiveClock light />}
      />

      {visibleTabs.length > 0 ? (
        <DirectorReportTabs
          tabs={visibleTabs.map((tab) => ({ id: tab.id, label: tabLabel(t, tab) || tab.label || tab.id }))}
          active={activeTab}
          onChange={setActiveTab}
          badgeFor={(tab) => (tab.id === 'alerts' && data?.alertCount > 0 ? data.alertCount : null)}
        />
      ) : null}

      <DirectorReportBody>
        {error ? <DirectorReportError>{error}</DirectorReportError> : null}

        {loading && !data ? <DirectorReportLoading>{t('directorDashboard.loading')}</DirectorReportLoading> : null}

        {data && activeTab === 'overview' && visibleTabs.some((tab) => tab.id === 'overview') ? (
          <>
            {tabKpis.length > 0 ? (
              <div className="hms-dr-kpi-grid" style={{ marginBottom: 20 }}>
                {tabKpis.map((kpi) => {
                  const row = data.kpi?.[kpi.dataKey];
                  return (
                    <KpiCard
                      key={kpi.code}
                      icon={KPI_ICONS[kpi.id] || 'fa-bar-chart'}
                      label={kpiLabel(t, kpi)}
                      value={renderKpiValue(kpi, data)}
                      sub={row?.sub}
                      subColor={kpiSubColor(kpi, row)}
                      accent={kpiAccent(kpi, row)}
                      spark={
                        kpi.id === 'patients_today' || kpi.id === 'er_wait' ? row?.spark : undefined
                      }
                    />
                  );
                })}
              </div>
            ) : null}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16,
                marginBottom: 20}}
            >
              {tabPanels.some((p) => p.id === 'patient_flow')
                ? panelWrap(
                    <>
                      <SectionHeader
                        title={panelLabel(t, tabPanels.find((p) => p.id === 'patient_flow'))}
                        subtitle={t('directorDashboard.patient_flow_sub')}
                      />
                      <FlowChart data={data.flowChart} />
                    </>
                  )
                : null}
              {tabPanels.some((p) => p.id === 'revenue_breakdown')
                ? panelWrap(
                    <>
                      <SectionHeader
                        title={panelLabel(t, tabPanels.find((p) => p.id === 'revenue_breakdown'))}
                        subtitle={t('directorDashboard.revenue_sub')}
                      />
                      <RevenuePanel items={data.revenue} />
                    </>
                  )
                : null}
            </div>

            {tabPanels.some((p) => p.id === 'critical_alerts') ? (
              <div style={{ marginBottom: 16 }}>
                {panelWrap(
                  <>
                    <SectionHeader
                      title={panelLabel(t, tabPanels.find((p) => p.id === 'critical_alerts'))}
                      subtitle={t('directorDashboard.critical_alerts_sub')}
                    />
                    {data.criticalAlerts?.length > 0 ? (
                      <CriticalAlerts alerts={data.criticalAlerts} />
                    ) : (
                      <div style={{ fontSize: 12, color: C.textMuted }}>
                        {t('directorDashboard.no_critical_alerts')}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </>
        ) : null}

        {data && activeTab === 'beds' && tabPanels.some((p) => p.id === 'bed_grid')
          ? panelWrap(
              <>
                <SectionHeader
                  title={panelLabel(t, tabPanels.find((p) => p.id === 'bed_grid'))}
                  subtitle={`${data.bedsOccupied} / ${data.bedsTotal} beds occupied — ${bedPct}% overall`}
                />
                <BedGrid wards={data.wards} />
              </>
            )
          : null}

        {data && activeTab === 'flow' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {tabKpis.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 12}}
              >
                {tabKpis.map((kpi) => {
                  const row = data.kpi?.[kpi.dataKey];
                  return (
                    <KpiCard
                      key={kpi.code}
                      icon={KPI_ICONS[kpi.id] || 'fa-bar-chart'}
                      label={kpiLabel(t, kpi)}
                      value={renderKpiValue(kpi, data)}
                      accent={kpiAccent(kpi, row)}
                    />
                  );
                })}
              </div>
            ) : null}
            {tabPanels.some((p) => p.id === 'patient_flow')
              ? panelWrap(
                  <>
                    <SectionHeader
                      title={t('directorDashboard.flow_hourly_title')}
                      subtitle={t('directorDashboard.patient_flow_sub')}
                    />
                    <FlowChart data={data.patientFlow} />
                  </>
                )
              : null}
          </div>
        ) : null}

        {data && activeTab === 'staff' && tabPanels.some((p) => p.id === 'staff_roster')
          ? panelWrap(
              <>
                <SectionHeader
                  title={panelLabel(t, tabPanels.find((p) => p.id === 'staff_roster'))}
                  subtitle={t('directorDashboard.staff_sub')}
                />
                <StaffTable staff={data.staff} t={t} />
              </>
            )
          : null}

        {data && activeTab === 'revenue' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {tabKpis.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 12}}
              >
                {tabKpis.map((kpi) => {
                  const row = data.kpi?.[kpi.dataKey];
                  return (
                    <KpiCard
                      key={kpi.code}
                      icon={KPI_ICONS[kpi.id] || 'fa-bar-chart'}
                      label={kpiLabel(t, kpi)}
                      value={renderKpiValue(kpi, data)}
                      accent={kpiAccent(kpi, row)}
                    />
                  );
                })}
              </div>
            ) : null}
            {tabPanels.some((p) => p.id === 'revenue_breakdown')
              ? panelWrap(
                  <>
                    <SectionHeader
                      title={t('directorDashboard.revenue_category_title')}
                      subtitle={t('directorDashboard.revenue_sub')}
                    />
                    <RevenuePanel items={data.revenue} />
                  </>
                )
              : null}
          </div>
        ) : null}

        {data && activeTab === 'alerts' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {tabPanels.some((p) => p.id === 'lab_alerts')
              ? panelWrap(
                  <>
                    <SectionHeader
                      title={panelLabel(t, tabPanels.find((p) => p.id === 'lab_alerts'))}
                      subtitle={t('directorDashboard.lab_alerts_sub')}
                    />
                    <LabAlerts alerts={data.labAlerts} />
                  </>
                )
              : null}
            {tabPanels.some((p) => p.id === 'pharmacy_alerts')
              ? panelWrap(
                  <>
                    <SectionHeader
                      title={panelLabel(t, tabPanels.find((p) => p.id === 'pharmacy_alerts'))}
                      subtitle={t('directorDashboard.pharmacy_alerts_sub')}
                    />
                    <PharmacyAlerts items={data.pharmacyAlerts} />
                  </>
                )
              : null}
          </div>
        ) : null}
      </DirectorReportBody>
    </DirectorReportShell>
  );
}
