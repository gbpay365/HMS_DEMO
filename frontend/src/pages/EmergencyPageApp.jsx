import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { formatMoney } from '../lib/hmsLocale';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { EmergencyQuickRegModal } from '../components/emergency/EmergencyQuickRegModal';

const DEFAULT_ACUITY_KEYS = {
  0: 'acuity_awaiting',
  1: 'acuity_resuscitation',
  2: 'acuity_emergent',
  3: 'acuity_urgent',
  4: 'acuity_less_urgent',
  5: 'acuity_non_urgent'};

const DEFAULT_ACUITY_META = {
  0: { color: '#f59e0b', sla: null, short: null },
  1: { color: '#7f1d1d', sla: 0, short: 'L1' },
  2: { color: '#b45309', sla: 10, short: 'L2' },
  3: { color: '#92400e', sla: 30, short: 'L3' },
  4: { color: '#166534', sla: 60, short: 'L4' },
  5: { color: '#1e40af', sla: 120, short: 'L5' }};

function LaneCard({ visit, color, sla, t }) {
  const mins = parseInt(visit.minutes_waiting, 10) || 0;
  const slaCls = sla != null && mins > sla ? 'bg-red-100 text-red-800' : mins > 30 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800';
  const age = visit.dob ? new Date().getFullYear() - new Date(visit.dob).getFullYear() : null;

  return (
    <a
      href={`/emergency/visit/${visit.id}`}
      className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md"
      style={{ borderLeftWidth: 4, borderLeftColor: color }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-extrabold text-slate-600">
          {(visit.first_name || '?')[0]}
          {(visit.last_name || '?')[0]}
        </div>
        <div className="min-w-0">
          <div className="truncate font-bold text-slate-800">
            {visit.first_name} {visit.last_name}
            {visit.mlc_flag ? (
              <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white">MLC</span>
            ) : null}
          </div>
          <div className="text-xs text-slate-500">
            {visit.gender || '—'}
            {age ? ` · ${age}y` : ''} · {visit.ticket_number}
            {visit.bed_code ? ` · ${visit.bed_code}` : ''}
          </div>
          {visit.chief_complaint ? <div className="truncate text-xs text-slate-600">{visit.chief_complaint}</div> : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${slaCls}`}>{mins} min</span>
        {visit.critical_count > 0 ? (
          <div className="mt-1 text-[10px] font-bold text-red-600">{t('emergency.critical', { count: visit.critical_count })}</div>
        ) : null}
      </div>
    </a>
  );
}

function LaneSection({ level, lanes, acuity, t }) {
  const meta = acuity[level] || acuity[String(level)] || acuity[0];
  const rows = lanes[String(level)] || lanes[level] || [];
  const color = meta?.color || '#1a6bd8';

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 text-sm font-bold text-white" style={{ background: color }}>
        <span>
          {level > 0 ? `L${level} · ` : ''}
          {meta?.label || '—'}
          {level > 0 && meta?.sla != null ? (
            <span className="ml-2 rounded bg-white/20 px-2 py-0.5 text-[10px]">{t('emergency.sla', { min: meta.sla })}</span>
          ) : null}
        </span>
        <span>{rows.length}</span>
      </div>
      <div className="p-3">
        {!rows.length ? <p className="text-sm italic text-slate-400">{t('emergency.lane_empty')}</p> : null}
        {rows.map((v) => (
          <LaneCard key={v.id} visit={v} color={color} sla={meta?.sla} t={t} />
        ))}
      </div>
    </div>
  );
}

export function EmergencyPageApp({
  lanes = {},
  beds = [],
  stats = {},
  acuity: acuityProp = {},
  patients = [],
  doctors = [],
  staffDoctorId = 0,
  myDoctorQueue = [],
  flash = null,
  error = null}) {
  const { t } = useTranslation('clinical');
  const [regOpen, setRegOpen] = useState(false);

  const acuity = useMemo(() => {
    const out = {};
    for (const [level, key] of Object.entries(DEFAULT_ACUITY_KEYS)) {
      const n = Number(level);
      const base = DEFAULT_ACUITY_META[n] || DEFAULT_ACUITY_META[0];
      const fromServer = acuityProp[n] || acuityProp[String(n)] || {};
      out[n] = {
        ...base,
        ...fromServer,
        label: fromServer.label || t(`emergency.${key}`)};
    }
    return out;
  }, [acuityProp, t]);

  const bedGroups = { resuscitation: [], holding: [], observation: [], ssu: [] };
  beds.forEach((b) => {
    const bay = b.bay_type || 'holding';
    if (!bedGroups[bay]) bedGroups[bay] = [];
    bedGroups[bay].push(b);
  });

  const bayLabels = {
    resuscitation: t('emergency.bay_resuscitation'),
    holding: t('emergency.bay_holding'),
    observation: t('emergency.bay_observation'),
    ssu: t('emergency.bay_ssu')};

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero
          icon="ambulance"
          badge={
            <>
              <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
              {t('emergency.live')}
            </>
          }
          title={t('emergency.title')}
          subtitle={t('emergency.subtitle')}
        >
          <div className="hms-surface-hero-actions mt-4">
            <button type="button" className="hms-btn-secondary text-xs" onClick={() => window.location.reload()}>
              <i className="fa fa-refresh" aria-hidden="true" />
              {t('shared.refresh')}
            </button>
            <a href="/emergency/kpi" className="hms-btn-secondary text-xs">
              <i className="fa fa-bar-chart" aria-hidden="true" />
              {t('emergency.kpi')}
            </a>
            <a href="/death-registry?source=er" className="hms-btn-outline-danger text-xs">
              <i className="fa fa-heart-o" aria-hidden="true" />
              {t('emergency.death_registry')}
            </a>
            <button type="button" className="hms-btn-danger text-xs" onClick={() => setRegOpen(true)}>
              <i className="fa fa-user-plus" aria-hidden="true" />
              {t('emergency.new_patient')}
            </button>
          </div>
        </SurfaceHero>

        <div className="hms-compact-kpi-grid hms-compact-kpi-grid--6 mb-4">
          <StatCard label={t('emergency.stat_active')} value={stats.total} tone="danger" icon="users" />
          <StatCard label={t('emergency.stat_awaiting_triage')} value={stats.untriaged} tone="warning" icon="clock" />
          <StatCard label="L1 + L2" value={(stats.l1 || 0) + (stats.l2 || 0)} tone="danger" icon="exclamation-triangle" />
          <StatCard label={t('emergency.stat_critical')} value={stats.critical} tone="danger" icon="heartbeat" />
          <StatCard
            label={t('emergency.stat_door_doctor')}
            value={stats.today?.avgDoorToDoctorMin != null ? `${stats.today.avgDoorToDoctorMin}m` : '—'}
            tone="brand"
            icon="stopwatch"
          />
          <StatCard label={t('emergency.stat_mlc')} value={stats.mlc} tone="default" icon="gavel" />
        </div>

        {stats.creditTotal > 0 ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <strong>{t('emergency.credit_tabs')}</strong> {formatMoney(stats.creditTotal)} {t('emergency.credit_across', { count: stats.total, defaultValue: 'across {{count}} patients' })}
          </div>
        ) : null}

        {myDoctorQueue.length > 0 ? (
          <div className="mb-6 rounded-2xl border-2 border-violet-300 bg-violet-50 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold text-violet-950">{t('emergency.my_er_queue')}</h2>
                <p className="text-xs text-violet-800">{t('emergency.my_er_queue_hint')}</p>
              </div>
              <span className="rounded-full bg-violet-700 px-3 py-1 text-xs font-bold text-white">
                {myDoctorQueue.length}
              </span>
            </div>
            <div className="space-y-2">
              {myDoctorQueue.map((v) => (
                <a
                  key={v.id}
                  href={`/emergency/visit/${v.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-white px-4 py-3 shadow-sm transition hover:shadow-md"
                >
                  <div>
                    <div className="font-bold text-slate-900">
                      {v.first_name} {v.last_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {v.ticket_number} · {String(v.queue_status || '').replace(/_/g, ' ')}
                      {v.bed_code ? ` · ${v.bed_code}` : ''}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-900">
                    {t('emergency.open_er_chart')}
                  </span>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          {t('emergency.er_opd_separate')}
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-9">
            {[0, 1, 2, 3, 4, 5].map((level) => (
              <LaneSection key={level} level={level} lanes={lanes} acuity={acuity} t={t} />
            ))}
          </div>

          <div className="lg:col-span-3">
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between font-bold text-slate-800">
                <span>{t('emergency.bed_board')}</span>
                <span className="text-xs text-slate-500">
                  {stats.beds?.occupied ?? 0} / {stats.beds?.total ?? beds.length}
                </span>
              </div>
              {Object.entries(bedGroups).map(([bay, list]) =>
                list.length ? (
                  <div key={bay} className="mb-3">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{bayLabels[bay] || bay}</div>
                    <div className="grid grid-cols-3 gap-1">
                      {list.map((b) => (
                        <div
                          key={b.id}
                          className={`rounded-lg border px-1 py-2 text-center text-[10px] font-bold ${
                            b.occupant_name ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          }`}
                          title={b.occupant_name || t('shared.free')}
                        >
                          {b.bed_code}
                          <div className="truncate font-normal opacity-75">
                            {b.occupant_name ? b.occupant_name.split(' ')[0] : t('shared.free')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 font-bold text-slate-800">{t('emergency.quick_links')}</div>
              <div className="space-y-1 text-sm">
                <a href="/emergency/kpi" className="block text-brand hover:underline">
                  {t('emergency.kpi_dashboard')}
                </a>
                <a href="/wards" className="block text-brand hover:underline">
                  {t('emergency.ward_board')}
                </a>
                <a href="/portal/doctor/er-alerts" className="block text-brand hover:underline">
                  {t('emergency.doctor_er_alerts')}
                </a>
                <a href="/cashier" className="block text-brand hover:underline">
                  {t('emergency.cashier')}
                </a>
              </div>
            </div>
          </div>
        </div>

        <EmergencyQuickRegModal open={regOpen} onClose={() => setRegOpen(false)} doctors={doctors} />
      </div>
    </div>
  );
}
