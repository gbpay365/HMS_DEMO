import { useMemo, useState } from 'react';
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

const STATUS_FILTERS = [
  { key: 'all', labelKey: 'shared.all' },
  { key: 'active', labelKey: 'shared.active' },
  { key: 'completed', labelKey: 'shared.completed' },
  { key: 'cancelled', labelKey: 'shared.cancelled' },
];

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

  const [q, setQ] = useState(filters.q || '');
  const [dateFrom, setDateFrom] = useState(filters.dateFrom || '');
  const [dateTo, setDateTo] = useState(filters.dateTo || '');
  const [status, setStatus] = useState(filters.status || 'all');
  const [sort, setSort] = useState(filters.sort || 'newest');

  const canWrite = hasPerm(userPerms, ['opd.write']);
  const mayCallPatient = hasPerm(userPerms, ['clinical.write', 'prescription.write']);
  const hasVitals = (id) => visitIdInVitalsList(visitIdsWithVitals, id);

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

  const registryQuery = useMemo(() => {
    const o = {};
    if (q.trim()) o.q = q.trim();
    if (dateFrom) o.date_from = dateFrom;
    if (dateTo) o.date_to = dateTo;
    if (status && status !== 'all') o.status = status;
    if (sort) o.sort = sort;
    if (filters.dept) o.dept = filters.dept;
    return o;
  }, [q, dateFrom, dateTo, status, sort, filters.dept]);

  const applyFilters = (e) => {
    e.preventDefault();
    const params = new URLSearchParams(registryQuery);
    window.location.href = params.toString() ? `/opd-queue?${params}` : '/opd-queue';
  };

  const navigateWithStatus = (nextStatus) => {
    setStatus(nextStatus);
    const o = { ...registryQuery };
    if (nextStatus && nextStatus !== 'all') o.status = nextStatus;
    else delete o.status;
    const params = new URLSearchParams(o);
    window.location.href = params.toString() ? `/opd-queue?${params}` : '/opd-queue';
  };

  const queueStats = useMemo(() => {
    const waiting = todayVisits.filter((v) => (v.queue_status || '') === 'waiting_doctor').length;
    return {
      active: todayVisits.length,
      waiting,
      registry: filters.total || 0,
      rooms: consultationRooms.length};
  }, [todayVisits, filters.total, consultationRooms.length]);

  const canAssignRoom =
    hasPerm(userPerms, ['opd.write', 'nursing.write', 'clinical.write', 'scheduling.read']) &&
    consultationRooms.length > 0;

  // When split by doctor: "mine" section shows todayVisitsMine; main grid must only show others (never all visits).
  const queueList = queueShowDoctorSplit ? todayVisitsOthers : todayVisits;

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
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="stethoscope" title={t('opd.title')} subtitle={t('opd.subtitle')}>
          <div className="hms-surface-hero-actions mt-4">
            <a href="/doctor/schedule" className="hms-btn-secondary text-xs">
              <i className="fa fa-calendar" aria-hidden="true" />
              {t('doctorSchedule.title')}
            </a>
            {mayCallPatient ? (
              <button type="button" className="hms-btn hms-btn-action-complete text-xs" onClick={callNextPatient}>
                <i className="fa fa-bullhorn" aria-hidden="true" />
                {t('doctorSchedule.call_next')}
              </button>
            ) : null}
            <a href="/portal/call-queue/enter" target="_blank" rel="noopener noreferrer" className="hms-btn-secondary text-xs">
              <i className="fa fa-desktop" aria-hidden="true" />
              {t('shared.lobby_screen')}
            </a>
            <a href="/ipd/census" className="hms-btn-secondary text-xs">
              <i className="fa fa-hospital-o" aria-hidden="true" />
              {t('opd.ipd_census')}
            </a>
            <a
              href="/death-registry?source=opd"
              className="hms-btn hms-btn-outline-danger text-xs"
              title={t('opd.death_registry_hint')}
            >
              <i className="fa fa-heart-o" aria-hidden="true" />
              {t('opd.death_registry')}
            </a>
            <a href="/hms" className="hms-btn-secondary text-xs">
              {t('shared.hms_hub')}
            </a>
            <a href="/opd-queue" className="hms-btn-secondary px-3 text-xs" title={t('shared.refresh')}>
              <i className="fa fa-refresh" aria-hidden="true" />
            </a>
            {canWrite ? (
              <button type="button" className="hms-btn-primary text-xs" onClick={() => setAddOpen(true)}>
                <i className="fa fa-user-plus" aria-hidden="true" />
                {t('opd.new_visit')}
              </button>
            ) : null}
          </div>
        </SurfaceHero>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('opd.stat_active_today')} value={queueStats.active} tone="brand" icon="users" />
          <StatCard label={t('opd.stat_waiting_doctor')} value={queueStats.waiting} tone="warning" icon="clock" />
          <StatCard label={t('opd.stat_registry')} value={queueStats.registry} tone="default" icon="list" />
          <StatCard label={t('opd.stat_rooms')} value={queueStats.rooms} tone="brand" icon="door-open" />
        </div>

        {!queueShowDoctorSplit ? <OpdWorkflowBanner /> : null}

        {!consultationRooms.length && canManageConsultationRooms ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <strong>{t('opd.no_rooms_title')}</strong>{' '}
            {t('opd.no_rooms_body')}{' '}
            <a href="/admin/consultation-rooms" className="font-bold text-brand underline">
              {t('opd.configure_rooms')}
            </a>
          </div>
        ) : null}

        <form onSubmit={applyFilters} className="mb-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
            <div className="flex items-end">
              <button type="submit" className="hms-btn-primary w-full shrink-0">
                <i className="fa fa-filter" aria-hidden="true" />
                {t('shared.filter')}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map(({ key, labelKey }) => (
              <FilterChip key={key} active={status === key} onClick={() => navigateWithStatus(key)}>
                {t(labelKey)}
              </FilterChip>
            ))}
          </div>
        </form>

        <div className="mb-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-ink">{t('opd.active_queue_today')}</h2>
            <span className="rounded-full bg-brand px-3 py-0.5 text-xs font-bold text-white">
              {t('opd.active_count', { count: todayVisits.length })}
            </span>
          </div>
          <div className="p-4">
            {todayVisits.length === 0 ? (
              <p className="py-8 text-center text-slate-500">{t('opd.queue_clear')}</p>
            ) : (
              <>
                {queueShowDoctorSplit && todayVisitsMine.length > 0 ? (
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
                    <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(230px,260px))] gap-3">
                      {todayVisitsMine.map((v) => (
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
                <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,260px))] gap-3">
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

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-ink">
              {t('opd.visit_registry')}{' '}
              <span className="ml-2 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                {filters.total || 0} {t('shared.records')}
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
                {allVisits.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-4 py-12 text-center text-slate-500">
                      {t('opd.no_visits_filters')}
                    </td>
                  </tr>
                ) : (
                  allVisits.map((v) => {
                    const qs = v.queue_status || 'registered';
                    const st = opdQueueStatus(qs);
                    const items = menuForVisit(v);
                    const regRm = v.display_room_name || v.display_room_code || v.consultation_room_name || v.consultation_room_code;
                    return (
                      <tr key={v.id} className="hover:bg-slate-50/80">
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
          <Pager pager={pager} basePath="/opd-queue" query={registryQuery} />
        </div>
      </div>

      {canWrite ? <OpdAddVisitModal open={addOpen} onClose={() => setAddOpen(false)} doctors={doctors} /> : null}
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
