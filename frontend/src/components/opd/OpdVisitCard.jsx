import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatDateTime, hasPerm, opdQueueStatus, opdQueueStatusLabel, postForm } from '../../lib/listUi';
import { opdStatusAllowsConsult, visitIdInVitalsList } from '../../lib/opdVitals';
import { notifyAlert } from '../../lib/notifyBridge';
import { nurseOpdCardLocked, opdVisitPaymentValidForVitals, staffMayRecordOpdVitals } from '../../lib/opdVitalsAccess';

function humanWait(iso) {
  if (!iso) return '…';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '…';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function OpdVisitCard({
  visit: v,
  visitIdsWithVitals = [],
  consultationRooms = [],
  staffDoctorId = 0,
  userPerms = [],
  canAssignRoom = false,
  canRecordVitals = false,
  staffRole = '',
  onTriage,
  onAssignRoom}) {
  const { t } = useTranslation('clinical');
  const qs = v.queue_status || 'registered';
  const st = opdQueueStatus(qs);
  const statusLabel = opdQueueStatusLabel(t, qs);
  const hasV = visitIdInVitalsList(visitIdsWithVitals, v.id);
  const doctorFirst = v.doc_fn || v.ref_fn;
  const doctorLast = v.doc_ln || v.ref_ln;
  const docName = doctorFirst ? `Dr. ${doctorFirst} ${doctorLast}`.trim() : null;
  const prevDate = v.prev_visit_date ? formatDate(v.prev_visit_date) : t('opd.card.first_visit');
  const prevL = v.prev_visit_date ? t('opd.card.last_visit', { date: prevDate }) : prevDate;
  const adoc = parseInt(v.assigned_doctor_id || 0, 10) || 0;
  const me = parseInt(staffDoctorId || 0, 10) || 0;
  const isMine = me > 0 && adoc === me;
  const isFD = !hasPerm(userPerms, ['clinical.write', 'prescription.write']);
  const isEmerg = v.is_emergency == 1 || v.is_emergency === true || String(v.is_emergency) === '1';
  const payValid = opdVisitPaymentValidForVitals(v);
  const payBlocked = !payValid;
  const mayRecordVitals = canRecordVitals && staffMayRecordOpdVitals(userPerms, staffRole);
  const nurseLocked = nurseOpdCardLocked(v, hasV, userPerms, staffRole);
  const mayConsult = hasPerm(userPerms, ['clinical.write', 'prescription.write']);
  const showNurseLockBanner = nurseLocked && !mayConsult;

  const openTriage = async () => {
    if (!payValid) {
      await notifyAlert({
        title: t('opd.card.payment_required'),
        message: t('opd.vitals_payment_cashier_msg'),
        type: 'warning'});
      return;
    }
    onTriage(v);
  };

  const vf = v.vitals_first_at || v.vitals_last_at;
  let vitalsStr = '—';
  if (vf) vitalsStr = formatDateTime(vf);

  const [waitLabel, setWaitLabel] = useState(() => humanWait(v.wait_start_iso));
  useEffect(() => {
    if (qs !== 'waiting_doctor' || !v.wait_start_iso) return undefined;
    const tick = () => setWaitLabel(humanWait(v.wait_start_iso));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [qs, v.wait_start_iso]);

  const dispRm = v.display_room_name || v.display_room_code || v.consultation_room_name || v.consultation_room_code;
  const showConsult = opdStatusAllowsConsult(qs, hasV) && !isFD;
  const showCall =
    mayConsult && qs === 'waiting_doctor' && hasV && !payBlocked && !isFD;
  const showComplete = (qs === 'in_consultation' || qs === 'orders_pending' || qs === 'billing') && !isFD;
  const isActiveQueue = qs !== 'completed' && qs !== 'cancelled';
  const showVitalsBtn = Boolean(onTriage) && mayRecordVitals && isActiveQueue && !nurseLocked && payValid && !hasV;
  const showVitalsPrimary = showVitalsBtn;
  const showVitalsBlockedHint =
    Boolean(onTriage) && mayRecordVitals && isActiveQueue && !nurseLocked && !hasV && !payValid;
  const consultHref = `/consultation-new?patient_id=${v.patient_id}&visit_id=${v.id}`;
  const dept =
    !v.department || String(v.department).toLowerCase() === 'general'
      ? t('opd.card.dept_general')
      : v.department;

  return (
    <article
      className={`flex w-full max-w-[260px] flex-col rounded-2xl border bg-white p-3.5 shadow-card transition hover:-translate-y-0.5 ${
        isMine ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200'
      }`}
    >
      <div className="mb-2 flex items-center gap-2.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
          {(v.first_name || '?')[0]}
          {(v.last_name || '?')[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink" title={`${v.first_name || ''} ${v.last_name || ''}`.trim()}>
            {v.first_name} {v.last_name}
            {isMine ? (
              <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                {t('opd.card.yours')}
              </span>
            ) : null}
          </div>
          <div className="text-[11px] text-slate-400">{prevL}</div>
          {v.carried_forward_from ? (
            <div className="text-[11px] font-bold text-sky-700">
              <i className="fa fa-repeat mr-1" />
              {t('opd.card.from_date', {
                date: formatDate(String(v.carried_forward_from).slice(0, 10))})}
            </div>
          ) : null}
        </div>
        {v.priority === 'urgent' ? (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">!</span>
        ) : null}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        {v.arrival_no ? (
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-bold">
            {t('opd.card.queue_no', { n: v.arrival_no })}
          </span>
        ) : null}
        <span className="text-slate-500" title={t('opd.card.vitals_title')}>
          <i className="fa fa-heartbeat mr-1 text-orange-600" />
          {vitalsStr}
        </span>
        {qs === 'waiting_doctor' && v.wait_start_iso ? (
          <span className="font-bold text-amber-700">
            <i className="fa fa-hourglass-half mr-1" />
            {waitLabel}
          </span>
        ) : null}
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`inline-flex max-w-[65%] truncate rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset ${st.className}`}>
          {statusLabel}
        </span>
        <span className="truncate text-xs font-bold text-brand">{v.ticket_number}</span>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2">
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {t('opd.card.physician')}
          </div>
          <div className="text-sm font-semibold leading-snug text-slate-800 break-words">
            <i className="fa fa-stethoscope mr-1 shrink-0 text-slate-400" />
            {docName || <span className="italic text-slate-400">{t('opd.card.not_assigned_doctor')}</span>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2">
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {t('opd.card.dept_label')}
          </div>
          <div className="text-sm font-semibold leading-snug text-slate-800 break-words">
            <i className="fa fa-map-marker mr-1 shrink-0 text-red-500" />
            {dept}
          </div>
        </div>
      </div>

      <div className="mb-3 flex items-start justify-between gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-2.5 py-2 text-xs">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 font-bold uppercase tracking-wide text-[10px] text-sky-700">{t('opd.card.room')}</div>
          {dispRm ? (
            <div className="font-semibold text-slate-900">
              <i className="fa fa-door-open mr-1 text-sky-600" />
              {dispRm}
              {v.room_queue_no ? <span className="font-bold text-brand"> · #{v.room_queue_no}</span> : null}
              {v.display_room_auto ? <span className="ml-1 font-normal text-slate-500">{t('opd.card.auto')}</span> : null}
            </div>
          ) : (
            <div className="italic text-slate-500">{t('opd.card.not_assigned')}</div>
          )}
        </div>
        {canAssignRoom && !nurseLocked ? (
          <button
            type="button"
            className="shrink-0 rounded-lg border border-sky-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-sky-800 shadow-sm hover:bg-sky-100"
            onClick={() => onAssignRoom(v.id, v.consultation_room_id || v.suggested_room_id || 0)}
            title={t('opd.card.assign_room_title')}
          >
            <i className="fa fa-door-open mr-1" />
            {dispRm ? t('opd.card.change') : t('opd.card.assign')}
          </button>
        ) : null}
      </div>

      <div className="mt-auto space-y-2 border-t border-slate-100 pt-2">
        {showNurseLockBanner ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[11px] font-semibold text-slate-700">
            <i className="fa fa-lock mr-1" />
            {t('opd.card.vitals_submitted_locked')}
          </div>
        ) : null}

        {showConsult ? (
          hasV ? (
            payBlocked ? (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-[11px] font-semibold text-red-800"
                title={v.payment_code_alert_title || t('opd.card.payment_blocked_default')}
              >
                <i className="fa fa-exclamation-circle mr-1" />
                {t('opd.card.payment_required')}
              </div>
            ) : (
              <>
                {showCall ? (
                  <button
                    type="button"
                    className="mb-1.5 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400 bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
                    title={t('opd.card.call_hint')}
                    onClick={() => postForm('/opd-queue/call-patient', { visit_id: v.id })}
                  >
                    <i className="fa fa-bullhorn" />
                    {t('doctorSchedule.call')}
                  </button>
                ) : null}
                <a
                  href={consultHref}
                  className={`hms-btn hms-btn-action-complete hms-btn-block ${showCall ? 'text-sm' : ''}`}
                >
                  <i className="fa fa-stethoscope" />
                  {t('opd.card.consult')}
                </a>
                {mayConsult ? (
                  <a
                    href={`/opd/treatment/${v.id}`}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-900 hover:bg-violet-100"
                  >
                    <i className="fa fa-medkit" />
                    {t('opd.treatment.link_label')}
                  </a>
                ) : null}
              </>
            )
          ) : !showVitalsBtn ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-bold text-amber-900">
              <i className="fa fa-heartbeat mr-1" />
              {t('opd.card.vitals_required')}
            </div>
          ) : null
        ) : null}

        {showVitalsBlockedHint ? (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-bold text-amber-900"
            onClick={openTriage}
          >
            <i className="fa fa-heartbeat" />
            {t('opd.card.vitals')}
          </button>
        ) : null}

        {showVitalsPrimary ? (
          <button
            type="button"
            className="hms-btn hms-btn-action-vitals hms-btn-block"
            title={t('opd.card.vitals_record_title')}
            onClick={openTriage}
          >
            <i className="fa fa-heartbeat" />
            {t('opd.card.vitals')}
          </button>
        ) : null}

        {showComplete && mayConsult ? (
          <button
            type="button"
            className="hms-btn hms-btn-action-complete hms-btn-block"
            onClick={() => postForm('/opd-queue/status', { visit_id: v.id, new_status: 'completed' })}
          >
            <i className="fa fa-check" />
            {t('opd.card.complete')}
          </button>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href={`/patient-chart/${v.patient_id}`}
            className="hms-btn-secondary flex-1 px-2 py-1.5 text-center text-[11px]"
          >
            <i className="fa fa-folder-open-o mr-1" />
            {t('opd.card.chart')}
          </a>
          {!isFD && mayConsult && qs !== 'completed' && qs !== 'cancelled' ? (
            <button
              type="button"
              className="hms-btn-secondary px-2.5 py-1.5 text-[11px]"
              title={t('opd.card.advance_status')}
              onClick={() => postForm('/opd-queue/advance', { visit_id: v.id })}
            >
              <i className="fa fa-arrow-right" />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
