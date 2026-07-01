import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionMenu } from '../components/ActionMenu';
import { FilterChip } from '../components/FilterChip';
import { FlashMessages } from '../components/FlashMessages';
import { OpdVisitCard } from '../components/opd/OpdVisitCard';
import { OpdWorkflowBanner } from '../components/opd/OpdWorkflowBanner';
import { Pager } from '../components/Pager';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { DateDmyInput } from '../components/DateDmyInput';
import { OpdAddVisitModal } from '../modals/OpdAddVisitModal';
import { OpdAssignRoomModal } from '../modals/OpdAssignRoomModal';
import { OpdTriageModal } from '../modals/OpdTriageModal';
import { confirmModal } from '../lib/modalBridge';
import { openHmsInvoiceModal } from '../lib/invoiceModalBridge';
import { notifyError } from '../lib/notifyBridge';
import { formatDate, hasPerm, opdQueueStatus, opdQueueStatusLabel, postForm, postJson } from '../lib/listUi';
import { visitIdInVitalsList } from '../lib/opdVitals';
import { notifyAlert } from '../lib/notifyBridge';
import { opdVisitPaymentValidForVitals } from '../lib/opdVitalsAccess';
import { FaIcon } from '../components/FaIcon';

function menuIcon(name, className = '') {
  return <FaIcon name={name} className={className} />;
}

function aclOk(aclMenu, key) {
  return !!aclMenu?.[key];
}

function isoToday() {
  return new Date().toISOString().split('T')[0];
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

const ACTIVE_TERMINAL = new Set(['completed', 'cancelled', 'clinical_discharged', 'ipd_pending_admit']);

const DATE_PRESETS = [
  { key: 'today', days: 0 },
  { key: '7d', days: 7 },
  { key: '30d', days: 30 },
  { key: '90d', days: 90 },
];

const STATUS_FILTERS = [
  { key: 'all', labelKey: 'shared.all' },
  { key: 'active', labelKey: 'shared.active' },
  { key: 'waiting_doctor', labelKey: 'opd.status.waiting_doctor' },
  { key: 'triage', labelKey: 'opd.status.triage' },
  { key: 'registered', labelKey: 'opd.status.registered' },
  { key: 'in_consultation', labelKey: 'opd.status.in_consultation' },
  { key: 'completed', labelKey: 'shared.completed' },
  { key: 'cancelled', labelKey: 'shared.cancelled' },
];

function visitMatchesRegistryFilters(v, { q, dept, doctor, status }) {
  if (dept && String(v.department || '') !== dept) return false;
  if (doctor > 0) {
    const ad =
      parseInt(v.assigned_doctor_id, 10) ||
      parseInt(v.ticket_doctor_id, 10) ||
      parseInt(v.doc_id, 10) ||
      0;
    if (ad !== doctor) return false;
  }
  const qs = String(v.queue_status || '').toLowerCase();
  if (status && status !== 'all') {
    if (status === 'active') {
      if (ACTIVE_TERMINAL.has(qs)) return false;
    } else if (qs !== status) return false;
  }
  if (q) {
    const needle = q.toLowerCase();
    const hay = [
      v.first_name,
      v.last_name,
      v.ticket_number,
      v.department,
      v.chief_complaint,
      v.payment_code,
      v.patient_code,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

function buildRegistryQuery({ q, dateFrom, dateTo, status, sort, dept, doctor, page }) {
  const o = {};
  if (q.trim()) o.q = q.trim();
  if (dateFrom) o.date_from = dateFrom;
  if (dateTo) o.date_to = dateTo;
  if (status && status !== 'all') o.status = status;
  if (sort) o.sort = sort;
  if (dept) o.dept = dept;
  if (doctor > 0) o.doctor = String(doctor);
  if (page > 1) o.p = String(page);
  return o;
}

function registryQueryString(params) {
  const parts = Object.entries(params).filter(([, v]) => v != null && v !== '');
  if (!parts.length) return '';
  return new URLSearchParams(Object.fromEntries(parts)).toString();
}

export function OpdQueuePageApp({
  todayVisits = [],
  todayVisitsMine = [],
  todayVisitsOthers = [],
  queueShowDoctorSplit = false,
  allVisits = [],
  visitIdsWithVitals = [],
  consultationRooms = [],
  canManageConsultationRooms = false,
  staffDoctorId = 0,
  doctors = [],
  departments = [],
  filters = {},
  pager = null,
  registryToday = '',
  flash = null,
  error = null,
  userPerms = [],
  aclMenu = {},
  staffRole = '',
  canRecordVitals = false}) {
  const { t } = useTranslation('clinical');
  const [addOpen, setAddOpen] = useState(false);
  const [triageVisit, setTriageVisit] = useState(null);
  const [roomState, setRoomState] = useState({ open: false, visitId: 0, roomId: 0 });

  const defaultDateFrom = isoDaysAgo(90);
  const defaultDateTo = isoToday();

  const [q, setQ] = useState(filters.q || '');
  const [debouncedQ, setDebouncedQ] = useState(filters.q || '');
  const [dateFrom, setDateFrom] = useState(filters.dateFrom || defaultDateFrom);
  const [dateTo, setDateTo] = useState(filters.dateTo || defaultDateTo);
  const [status, setStatus] = useState(filters.status || 'all');
  const [sort, setSort] = useState(filters.sort || 'newest');
  const [dept, setDept] = useState(filters.dept || '');
  const [doctor, setDoctor] = useState(parseInt(filters.doctor, 10) || 0);

  const [registryVisits, setRegistryVisits] = useState(allVisits);
  const [registryPager, setRegistryPager] = useState(pager);
  const [registryTotal, setRegistryTotal] = useState(filters.total || 0);
  const [registryLoading, setRegistryLoading] = useState(false);

  const skipFetchRef = useRef(true);

  const canCreateVisit =
    hasPerm(userPerms, ['front_desk.visit.create', 'opd.write', 'scheduling.write']) ||
    aclOk(aclMenu, 'am.opd_queue.new_visit');
  const mayCallPatient = hasPerm(userPerms, ['clinical.write', 'prescription.write']);
  const hasVitals = (id) => visitIdInVitalsList(visitIdsWithVitals, id);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (!canCreateVisit) return;
    const params = new URLSearchParams(window.location.search || '');
    if (String(params.get('action') || '').toLowerCase() === 'new') {
      setAddOpen(true);
    }
  }, [canCreateVisit]);

  const activeFilterState = useMemo(
    () => ({ q: debouncedQ, dept, doctor, status }),
    [debouncedQ, dept, doctor, status]
  );

  const hasActiveFilters =
    debouncedQ !== '' ||
    dept !== '' ||
    doctor > 0 ||
    status !== 'all' ||
    dateFrom !== defaultDateFrom ||
    dateTo !== defaultDateTo ||
    sort !== 'newest';

  const syncUrl = useCallback(
    (page = registryPager?.page || 1) => {
      const qs = registryQueryString(
        buildRegistryQuery({
          q: debouncedQ,
          dateFrom,
          dateTo,
          status,
          sort,
          dept,
          doctor,
          page,
        })
      );
      window.history.replaceState({}, '', qs ? `/opd-queue?${qs}` : '/opd-queue');
    },
    [debouncedQ, dateFrom, dateTo, status, sort, dept, doctor, registryPager?.page]
  );

  const loadRegistry = useCallback(
    async (page = 1) => {
      setRegistryLoading(true);
      try {
        const params = buildRegistryQuery({
          q: debouncedQ,
          dateFrom,
          dateTo,
          status,
          sort,
          dept,
          doctor,
          page,
        });
        const qs = registryQueryString(params);
        const res = await fetch(`/api/opd-queue/registry${qs ? `?${qs}` : ''}`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) throw new Error(data.error || 'Registry load failed');
        setRegistryVisits(Array.isArray(data.visits) ? data.visits : []);
        setRegistryPager(data.pager || null);
        setRegistryTotal(data.filters?.total ?? data.total ?? 0);
        syncUrl(page);
      } catch (e) {
        notifyError(e.message);
      } finally {
        setRegistryLoading(false);
      }
    },
    [debouncedQ, dateFrom, dateTo, status, sort, dept, doctor, syncUrl]
  );

  useEffect(() => {
    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      syncUrl(filters.page || 1);
      return;
    }
    loadRegistry(1);
  }, [debouncedQ, dateFrom, dateTo, status, sort, dept, doctor]);

  const resetFilters = () => {
    setQ('');
    setDebouncedQ('');
    setDateFrom(defaultDateFrom);
    setDateTo(defaultDateTo);
    setStatus('all');
    setSort('newest');
    setDept('');
    setDoctor(0);
  };

  const applyDatePreset = (days) => {
    const to = isoToday();
    const from = days === 0 ? to : isoDaysAgo(days);
    setDateFrom(from);
    setDateTo(to);
  };

  const activePresetKey = useMemo(() => {
    const to = isoToday();
    for (const p of DATE_PRESETS) {
      const from = p.days === 0 ? to : isoDaysAgo(p.days);
      if (dateFrom === from && dateTo === to) return p.key;
    }
    return '';
  }, [dateFrom, dateTo]);

  const filterTodayVisits = useCallback(
    (list) => {
      if (!hasActiveFilters) return list;
      return (list || []).filter((v) => visitMatchesRegistryFilters(v, activeFilterState));
    },
    [hasActiveFilters, activeFilterState]
  );

  const filteredTodayVisits = useMemo(() => filterTodayVisits(todayVisits), [todayVisits, filterTodayVisits]);
  const filteredTodayVisitsMine = useMemo(
    () => filterTodayVisits(todayVisitsMine),
    [todayVisitsMine, filterTodayVisits]
  );
  const filteredTodayVisitsOthers = useMemo(
    () => filterTodayVisits(todayVisitsOthers),
    [todayVisitsOthers, filterTodayVisits]
  );

  const callNextPatient = async () => {
    try {
      const { data } = await postJson('/opd-queue/call-patient', {});
      if (!data.ok) {
        await notifyAlert({
          title: t('doctorSchedule.call_next'),
          message:
            data.error === 'no_patients_waiting'
              ? t('doctorSchedule.no_patients')
              : data.error || t('doctorSchedule.call_failed'),
          type: 'warning'});
        return;
      }
      if (data.consultUrl) window.location.href = data.consultUrl;
      else window.location.reload();
    } catch (e) {
      notifyError(e.message);
    }
  };

  const promptPaymentForVitals = async () => {
    await notifyAlert({
      title: t('opd.card.payment_required'),
      message: t('opd.vitals_payment_cashier_msg'),
      type: 'warning'});
  };

  const openTriageIfAllowed = async (v) => {
    if (!opdVisitPaymentValidForVitals(v)) {
      await promptPaymentForVitals();
      return;
    }
    setTriageVisit(v);
  };

  const queueStats = useMemo(() => {
    const waiting = filteredTodayVisits.filter((v) => (v.queue_status || '') === 'waiting_doctor').length;
    return {
      active: filteredTodayVisits.length,
      waiting,
      registry: registryTotal,
      rooms: consultationRooms.length};
  }, [filteredTodayVisits, registryTotal, consultationRooms.length]);

  const canAssignRoom =
    hasPerm(userPerms, ['opd.write', 'nursing.write', 'clinical.write', 'scheduling.read']) &&
    consultationRooms.length > 0;

  const queueList = queueShowDoctorSplit ? filteredTodayVisitsOthers : filteredTodayVisits;

  const menuForVisit = (v) => {
    const qs = v.queue_status || 'registered';
    const items = [];
    const consultN = parseInt(v.consult_count, 10) || 0;
    const vDay = v.visit_date ? String(v.visit_date).slice(0, 10) : '';
    const isEmerg = v.is_emergency == 1 || v.is_emergency === true || String(v.is_emergency) === '1';
    const canCarry =
      registryToday && vDay && vDay < registryToday && qs !== 'completed' && qs !== 'cancelled' && consultN < 1 && !isEmerg;

    if (aclOk(aclMenu, 'am.opd_queue.chart')) {
      items.push({ href: `/patient-chart/${v.patient_id}`, label: t('opd.menu_open_chart'), icon: menuIcon('folder-open') });
    }
    if (qs === 'registered' && aclOk(aclMenu, 'am.opd_queue.triage') && canRecordVitals) {
      items.push({
        label: t('opd.menu_start_triage'),
        icon: menuIcon('heartbeat'),
        onClick: () => openTriageIfAllowed(v)});
    }
    if (aclOk(aclMenu, 'am.opd_queue.consultation')) {
      const vitalsOk = !(qs === 'triage' || qs === 'waiting_doctor') || hasVitals(v.id);
      const payOk = isEmerg || (v.payment_code && !v.payment_code_blood_red);
      if ((qs !== 'registered' || hasVitals(v.id)) && vitalsOk) {
        items.push({
          href: `/consultation-new?patient_id=${v.patient_id}&visit_id=${v.id}`,
          label: payOk ? t('opd.menu_new_consult') : t('opd.menu_new_consult_payment'),
          icon: menuIcon('stethoscope')});
      }
    }
    if (aclOk(aclMenu, 'am.opd_queue.consultation') || aclOk(aclMenu, 'am.opd_queue.chart')) {
      items.push({ href: `/clinical/follow-up-opd?patient_id=${v.patient_id}`, label: t('opd.menu_follow_up'), icon: menuIcon('calendar') });
    }
    if (canCarry && aclOk(aclMenu, 'am.opd_queue.carry_forward')) {
      items.push({
        label: t('opd.menu_return_queue'),
        icon: menuIcon('refresh'),
        onClick: async () => {
          const ok = await confirmModal({
            title: t('opd.menu_return_queue'),
            message: t('opd.menu_return_confirm', { ticket: v.ticket_number }),
            confirmLabel: t('opd.menu_return_yes')});
          if (ok) postForm('/opd-queue/carry-forward', { visit_id: v.id });
        }});
    }
    if (aclOk(aclMenu, 'am.opd_queue.assign_room') && consultationRooms.length) {
      items.push({
        label: t('opd.menu_assign_room'),
        icon: menuIcon('building'),
        onClick: () => setRoomState({ open: true, visitId: v.id, roomId: v.consultation_room_id || v.suggested_room_id || 0 })});
    }
    if (qs !== 'completed' && qs !== 'cancelled' && aclOk(aclMenu, 'am.opd_queue.complete')) {
      items.push({
        href: `/death-registry?source=opd&visit_id=${v.id}`,
        label: t('opd.menu_record_death'),
        icon: menuIcon('heart-o')});
      items.push({
        label: t('opd.menu_advance'),
        icon: menuIcon('arrow-right'),
        onClick: () => postForm('/opd-queue/advance', { visit_id: v.id })});
      items.push({
        label: t('opd.menu_complete'),
        icon: menuIcon('check'),
        onClick: () => postForm('/opd-queue/status', { visit_id: v.id, new_status: 'completed' })});
    }
    if (qs === 'completed' && hasPerm(userPerms, ['cashier.write', 'billing.write', 'clinical.write'])) {
      items.push({
        label: t('opd.menu_final_invoice'),
        icon: menuIcon('file-text-o'),
        onClick: () => openHmsInvoiceModal(v.id)});
    }
    if (qs !== 'completed' && qs !== 'cancelled' && aclOk(aclMenu, 'am.opd_queue.cancel')) {
      items.push({
        label: t('opd.menu_cancel'),
        icon: menuIcon('times', 'text-red-600'),
        danger: true,
        onClick: async () => {
          const ok = await confirmModal({
            title: t('opd.menu_cancel_title'),
            message: t('opd.menu_cancel_msg', { ticket: v.ticket_number }),
            confirmLabel: t('opd.menu_cancel_yes'),
            tone: 'danger'});
          if (ok) postForm('/opd-queue/cancel', { visit_id: v.id });
        }});
    }
    return items;
  };

  return (
    <div className="page-wrapper hms-surface-module hms-opd-queue-page">
      <div className="content px-4 pb-6 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="stethoscope" title={t('opd.title')} subtitle={t('opd.subtitle')} className="mb-4">
          <div className="hms-staff-hero-toolbar mt-3 flex flex-wrap items-center gap-2">
            <a href="/doctor/schedule" className="hms-staff-hero-tab">
              <i className="fa fa-calendar" aria-hidden="true" />
              {t('doctorSchedule.title')}
            </a>
            {mayCallPatient ? (
              <button type="button" className="hms-staff-hero-tab hms-staff-hero-tab--active" onClick={callNextPatient}>
                <i className="fa fa-bullhorn" aria-hidden="true" />
                {t('doctorSchedule.call_next')}
              </button>
            ) : null}
            <a href="/portal/call-queue/enter" target="_blank" rel="noopener noreferrer" className="hms-staff-hero-tab">
              <i className="fa fa-desktop" aria-hidden="true" />
              {t('shared.lobby_screen')}
            </a>
            <a href="/ipd/census" className="hms-staff-hero-tab">
              <i className="fa fa-hospital-o" aria-hidden="true" />
              {t('opd.ipd_census')}
            </a>
            <a
              href="/death-registry?source=opd"
              className="hms-staff-hero-tab hms-opd-hero-tab--danger"
              title={t('opd.death_registry_hint')}
            >
              <i className="fa fa-heart-o" aria-hidden="true" />
              {t('opd.death_registry')}
            </a>
            <a href="/hms" className="hms-staff-hero-tab">
              {t('shared.hms_hub')}
            </a>
            <a href="/opd-queue" className="hms-staff-hero-tab hms-staff-hero-tab--refresh" title={t('shared.refresh')}>
              <i className="fa fa-refresh" aria-hidden="true" />
            </a>
            {canCreateVisit ? (
              <button
                type="button"
                className="hms-btn-primary ml-auto shrink-0 px-4 py-2 text-xs shadow-sm"
                onClick={() => setAddOpen(true)}
              >
                <i className="fa fa-plus-circle mr-1.5" aria-hidden="true" />
                {t('opd.create_new_visit')}
              </button>
            ) : null}
          </div>
        </SurfaceHero>

        <div className="hms-compact-kpi-grid mb-3">
          <StatCard label={t('opd.stat_active_today')} value={queueStats.active} tone="brand" icon="users" size="dense" />
          <StatCard label={t('opd.stat_waiting_doctor')} value={queueStats.waiting} tone="warning" icon="clock" size="dense" />
          <StatCard label={t('opd.stat_registry')} value={queueStats.registry} tone="default" icon="list" size="dense" />
          <StatCard label={t('opd.stat_rooms')} value={queueStats.rooms} tone="brand" icon="door-open" size="dense" />
        </div>

        {!queueShowDoctorSplit ? <OpdWorkflowBanner /> : null}

        {!consultationRooms.length && canManageConsultationRooms ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <strong>{t('opd.no_rooms_title')}</strong>{' '}
            {t('opd.no_rooms_body')}{' '}
            <a href="/admin/consultation-rooms" className="font-bold text-brand underline">
              {t('opd.configure_rooms')}
            </a>
          </div>
        ) : null}

        <div className="hms-opd-filter-panel mb-4 rounded-xl border border-slate-100 bg-white p-3 shadow-card">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t('opd.registry_filters_title')}</h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {hasActiveFilters ? (
                <button type="button" className="hms-btn-secondary px-2.5 py-1 text-[11px]" onClick={resetFilters}>
                  <i className="fa fa-times mr-1" aria-hidden="true" />
                  {t('opd.registry_reset')}
                </button>
              ) : null}
              <button
                type="button"
                className="hms-btn-secondary px-2.5 py-1 text-[11px]"
                onClick={() => loadRegistry(registryPager?.page || 1)}
                title={t('shared.refresh')}
              >
                <i className={`fa fa-refresh ${registryLoading ? 'fa-spin' : ''}`} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="hms-label">{t('shared.search')}</label>
              <SearchField
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('opd.search_placeholder')}
              />
            </div>
            <div>
              <label className="hms-label">{t('shared.from')}</label>
              <DateDmyInput name="date_from_display" value={dateFrom} onChange={setDateFrom} />
            </div>
            <div>
              <label className="hms-label">{t('shared.to')}</label>
              <DateDmyInput name="date_to_display" value={dateTo} onChange={setDateTo} />
            </div>
            <div>
              <label className="hms-label">{t('shared.sort')}</label>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="hms-input">
                <option value="newest">{t('shared.newest')}</option>
                <option value="oldest">{t('shared.oldest')}</option>
              </select>
            </div>
            <div>
              <label className="hms-label">{t('opd.filter_department')}</label>
              <select value={dept} onChange={(e) => setDept(e.target.value)} className="hms-input">
                <option value="">{t('opd.filter_all_departments')}</option>
                {departments.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="hms-label text-[10px]">{t('opd.filter_physician')}</label>
              <select
                value={doctor || ''}
                onChange={(e) => setDoctor(parseInt(e.target.value, 10) || 0)}
                className="hms-input"
              >
                <option value="">{t('opd.filter_all_physicians')}</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    Dr. {d.first_name} {d.last_name}
                    {d.primary_department ? ` — ${d.primary_department}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-4 flex flex-wrap items-end gap-1.5">
              <span className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                {t('opd.filter_period')}
              </span>
              {DATE_PRESETS.map((p) => (
                <FilterChip key={p.key} active={activePresetKey === p.key} onClick={() => applyDatePreset(p.days)}>
                  {t(`opd.preset_${p.key}`)}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map(({ key, labelKey }) => (
              <FilterChip key={key} active={status === key} onClick={() => setStatus(key)}>
                {t(labelKey)}
              </FilterChip>
            ))}
          </div>

          {hasActiveFilters ? (
            <p className="mt-3 text-xs text-slate-500">
              {registryLoading
                ? t('opd.registry_loading')
                : t('opd.registry_active_hint', {
                    shown: registryVisits.length,
                    total: registryTotal,
                    queue: filteredTodayVisits.length,
                  })}
            </p>
          ) : null}
        </div>

        <div className="mb-4 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-xs font-bold text-ink">
              {hasActiveFilters ? t('opd.active_queue_filtered') : t('opd.active_queue_today')}
            </h2>
            <span className="rounded-full bg-brand px-2.5 py-px text-[10px] font-bold text-white">
              {t('opd.active_count', { count: filteredTodayVisits.length })}
            </span>
          </div>
          <div className="p-3">
            {filteredTodayVisits.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                {hasActiveFilters ? t('opd.queue_no_match') : t('opd.queue_clear')}
              </p>
            ) : (
              <>
                {queueShowDoctorSplit && filteredTodayVisitsMine.length > 0 ? (
                  <>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-emerald-700">{t('opd.assigned_to_you')}</p>
                      {mayCallPatient ? (
                        <button
                          type="button"
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                          onClick={callNextPatient}
                        >
                          <i className="fa fa-bullhorn mr-1" />
                          {t('doctorSchedule.call_next')}
                        </button>
                      ) : null}
                    </div>
                    <div className="mb-3 grid grid-cols-[repeat(auto-fill,minmax(210px,240px))] gap-2">
                      {filteredTodayVisitsMine.map((v) => (
                        <OpdVisitCard
                          key={v.id}
                          visit={v}
                          visitIdsWithVitals={visitIdsWithVitals}
                          consultationRooms={consultationRooms}
                          staffDoctorId={staffDoctorId}
                          userPerms={userPerms}
                          canAssignRoom={canAssignRoom}
                          canRecordVitals={canRecordVitals}
                          staffRole={staffRole}
                          onTriage={openTriageIfAllowed}
                          onAssignRoom={(vid, rid) => setRoomState({ open: true, visitId: vid, roomId: rid })}
                        />
                      ))}
                    </div>
                    <p className="mb-2 text-xs font-bold text-slate-500">{t('opd.other_physicians')}</p>
                  </>
                ) : null}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,240px))] gap-2">
                  {queueList.map((v) => (
                    <OpdVisitCard
                      key={v.id}
                      visit={v}
                      visitIdsWithVitals={visitIdsWithVitals}
                      consultationRooms={consultationRooms}
                      staffDoctorId={staffDoctorId}
                      userPerms={userPerms}
                      canAssignRoom={canAssignRoom}
                      canRecordVitals={canRecordVitals}
                      staffRole={staffRole}
                      onTriage={openTriageIfAllowed}
                      onAssignRoom={(vid, rid) => setRoomState({ open: true, visitId: vid, roomId: rid })}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-card">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-xs font-bold text-ink">
              {t('opd.visit_registry')}{' '}
              <span className="ml-2 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                {registryTotal} {t('shared.records')}
                {registryLoading ? (
                  <i className="fa fa-spinner fa-spin ml-1 text-brand" aria-hidden="true" />
                ) : null}
              </span>
            </h2>
            <p className="mt-1 text-xs text-slate-500">{t('opd.registry_hint')}</p>
          </div>
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">{t('opd.col_ticket')}</th>
                  <th className="px-3 py-3">{t('shared.patient')}</th>
                  <th className="px-3 py-3">{t('opd.col_referred')}</th>
                  <th className="px-3 py-3">{t('opd.col_seen_by')}</th>
                  <th className="px-3 py-3">{t('opd.col_date')}</th>
                  <th className="px-3 py-3">{t('shared.status')}</th>
                  <th className="px-3 py-3">{t('opd.col_code')}</th>
                  <th className="px-3 py-3 text-center">{t('opd.col_validity')}</th>
                  <th className="px-3 py-3 text-center">{t('opd.col_max_uses')}</th>
                  <th className="px-3 py-3">{t('opd.col_reason')}</th>
                  <th className="px-3 py-3">{t('opd.col_room')}</th>
                  <th className="px-3 py-3 text-center">#</th>
                  <th className="px-3 py-3 text-right">{t('opd.col_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registryLoading && registryVisits.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-4 py-12 text-center text-slate-500">
                      <i className="fa fa-spinner fa-spin mr-2 text-brand" aria-hidden="true" />
                      {t('opd.registry_loading')}
                    </td>
                  </tr>
                ) : registryVisits.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-4 py-12 text-center text-slate-500">
                      {t('opd.no_visits_filters')}
                    </td>
                  </tr>
                ) : (
                  registryVisits.map((v) => {
                    const qs = v.queue_status || 'registered';
                    const st = opdQueueStatus(qs);
                    const items = menuForVisit(v);
                    const regRm = v.display_room_name || v.display_room_code || v.consultation_room_name || v.consultation_room_code;
                    return (
                      <tr key={v.id} className={`hover:bg-slate-50/80 ${registryLoading ? 'opacity-60' : ''}`}>
                        <td className="px-3 py-2.5 font-bold text-brand">{v.ticket_number}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold">
                            {v.first_name} {v.last_name}
                          </div>
                          {v.carried_forward_from ? (
                            <div className="text-xs font-bold text-sky-700">
                              {t('opd.carried_from', { date: formatDate(String(v.carried_forward_from).slice(0, 10)) })}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-xs">{v.ref_fn ? `Dr. ${v.ref_fn} ${v.ref_ln}` : '—'}</td>
                        <td className="px-3 py-2.5 text-xs">
                          {v.seen_fn ? `Dr. ${v.seen_fn} ${v.seen_ln}` : t('shared.pending')}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">{formatDate(v.visit_date)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset ${st.className}`}>
                            {opdQueueStatusLabel(t, qs)}
                          </span>
                        </td>
                        <td
                          className={`px-3 py-2.5 text-xs font-bold ${v.payment_code_blood_red ? 'text-red-900' : 'text-slate-600'}`}
                          title={v.payment_code_alert_title || ''}
                        >
                          {v.payment_code || '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-center text-xs font-bold ${v.payment_code_stale_reason === 'expired' ? 'text-red-900' : ''}`}>
                          {v.payment_code_valid_until_display || '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-center text-xs font-bold ${v.payment_code_stale_reason === 'depleted' ? 'text-red-900' : ''}`}>
                          {v.payment_code_max_uses == null
                            ? '—'
                            : `${v.payment_code_remaining_uses != null ? v.payment_code_remaining_uses : 0} / ${v.payment_code_max_uses}`}
                        </td>
                        <td className="max-w-[120px] truncate px-3 py-2.5 text-xs">{v.chief_complaint || '—'}</td>
                        <td className="px-3 py-2.5 text-xs">{regRm || '—'}</td>
                        <td className="px-3 py-2.5 text-center text-xs font-bold">{v.room_queue_no || '—'}</td>
                        <td className="px-3 py-2.5 text-right">{items.length ? <ActionMenu items={items} /> : null}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pager
            pager={registryPager}
            onPageChange={(page) => loadRegistry(page)}
            query={buildRegistryQuery({
              q: debouncedQ,
              dateFrom,
              dateTo,
              status,
              sort,
              dept,
              doctor,
              page: registryPager?.page || 1,
            })}
          />
        </div>
      </div>

      {canCreateVisit ? <OpdAddVisitModal open={addOpen} onClose={() => setAddOpen(false)} doctors={doctors} /> : null}
      <OpdTriageModal open={!!triageVisit} onClose={() => setTriageVisit(null)} visit={triageVisit} />
      <OpdAssignRoomModal
        open={roomState.open}
        onClose={() => setRoomState({ open: false, visitId: 0, roomId: 0 })}
        visitId={roomState.visitId}
        currentRoomId={roomState.roomId}
        consultationRooms={consultationRooms}
      />
    </div>
  );
}
