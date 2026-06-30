import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterChip } from '../components/FilterChip';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { hasPerm, postForm, postJson } from '../lib/listUi';
import { notifyAlert, notifyError } from '../lib/notifyBridge';

function dutyLabel(t, type) {
  if (type === 'on_duty') return t('doctorSchedule.duty_on');
  if (type === 'night') return t('doctorSchedule.duty_on_call');
  return t('doctorSchedule.duty_off');
}

export function DoctorSchedulePageApp({ hub = {}, staffEmpId = 0, userPerms = [], flash, error }) {
  const { t } = useTranslation('clinical');
  const [tab, setTab] = useState('today');
  const [calling, setCalling] = useState(false);
  const [localHub, setLocalHub] = useState(hub);

  const mayCall = hasPerm(userPerms, ['clinical.write', 'prescription.write']);
  const maySwap = hasPerm(userPerms, ['doctor_duty.write', 'clinical.write']);
  const mayApproveSwap = hasPerm(userPerms, ['doctor_duty.write', 'scheduling.write']);
  const mayCheckIn = hasPerm(userPerms, ['opd.write', 'clinical.write', 'scheduling.write']);
  const warnings = localHub.warnings || [];
  const opdQueue = localHub.opdQueue || [];
  const [swapForm, setSwapForm] = useState({ partner_id: '', from_date: '', to_date: '', note: '' });
  const [swapBusy, setSwapBusy] = useState(false);
  const [checkInBusy, setCheckInBusy] = useState(null);
  const [adminSwaps, setAdminSwaps] = useState([]);

  const refreshHub = useCallback(() => {
    fetch('/api/doctor/schedule', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.hub) setLocalHub(data.hub);
      })
      .catch(() => {});
  }, []);

  const refreshAdminSwaps = useCallback(() => {
    if (!mayApproveSwap) return;
    fetch('/api/admin/duty-swap/pending', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setAdminSwaps(data.swaps || []);
      })
      .catch(() => {});
  }, [mayApproveSwap]);

  const submitSwap = async (e) => {
    e.preventDefault();
    if (!maySwap || swapBusy) return;
    setSwapBusy(true);
    try {
      const r = await fetch('/api/doctor/duty-swap', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(swapForm)});
      const data = await r.json();
      if (!data.ok) {
        await notifyAlert({
          title: t('doctorSchedule.swap_request'),
          message: data.error || t('doctorSchedule.swap_failed'),
          type: 'warning'});
        return;
      }
      setSwapForm({ partner_id: '', from_date: '', to_date: '', note: '' });
      refreshHub();
      await notifyAlert({
        title: t('doctorSchedule.swap_request'),
        message: t('doctorSchedule.swap_submitted'),
        type: 'success'});
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSwapBusy(false);
    }
  };

  const reviewSwap = async (id, action) => {
    try {
      const r = await fetch(`/api/admin/duty-swap/${id}/review`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action })});
      const data = await r.json();
      if (!data.ok) {
        notifyError(data.error || 'Review failed');
        return;
      }
      refreshAdminSwaps();
      refreshHub();
    } catch (e) {
      notifyError(e.message);
    }
  };

  const cancelSwap = async (id) => {
    try {
      const r = await fetch(`/api/doctor/duty-swap/${id}/cancel`, {
        method: 'POST',
        credentials: 'same-origin'});
      const data = await r.json();
      if (!data.ok) notifyError(data.error || 'Cancel failed');
      else refreshHub();
    } catch (e) {
      notifyError(e.message);
    }
  };

  const checkInAppointment = async (apptId) => {
    if (!mayCheckIn || checkInBusy) return;
    setCheckInBusy(apptId);
    try {
      const { data } = await postJson(`/api/appointments/${apptId}/check-in-opd`);
      if (!data.ok) {
        await notifyAlert({
          title: t('doctorSchedule.check_in_opd'),
          message:
            data.error === 'appointment_not_today'
              ? t('doctorSchedule.check_in_not_today')
              : data.error || t('doctorSchedule.check_in_failed'),
          type: 'warning'});
        return;
      }
      refreshHub();
      await notifyAlert({
        title: t('doctorSchedule.check_in_opd'),
        message: data.alreadyCheckedIn
          ? t('doctorSchedule.check_in_linked', { ticket: data.ticketNumber })
          : t('doctorSchedule.check_in_ok', { ticket: data.ticketNumber }),
        type: 'success'});
    } catch (e) {
      notifyError(e.message);
    } finally {
      setCheckInBusy(null);
    }
  };

  const callNext = async () => {
    if (!mayCall || calling) return;
    setCalling(true);
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
      refreshHub();
      if (data.consultUrl) {
        window.location.href = data.consultUrl;
      }
    } catch (e) {
      notifyError(e.message || t('doctorSchedule.call_failed'));
    } finally {
      setCalling(false);
    }
  };

  const dutyToday = localHub.dutyToday || { duty_type: 'off' };
  const doctorName = useMemo(() => {
    const d = localHub.doctor || {};
    return ['Dr.', d.first_name, d.last_name].filter(Boolean).join(' ');
  }, [localHub.doctor]);

  useEffect(() => {
    if (tab === 'swap') refreshAdminSwaps();
  }, [tab, refreshAdminSwaps]);

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero
          icon="calendar"
          title={t('doctorSchedule.title')}
          subtitle={`${doctorName} · ${localHub.date || ''} · ${dutyLabel(t, dutyToday.duty_type)}${dutyToday.room_label ? ` · ${dutyToday.room_label}` : ''}`}
        >
          <div className="hms-surface-hero-actions mt-4">
            {mayCall ? (
              <button
                type="button"
                className="hms-btn hms-btn-action-complete text-xs"
                disabled={calling}
                onClick={callNext}
              >
                <i className="fa fa-bullhorn mr-1" />
                {calling
                  ? t('doctorSchedule.calling')
                  : t('doctorSchedule.call_next')}
              </button>
            ) : null}
            <a href="/doctor-roster" className="hms-btn-secondary text-xs">
              <i className="fa fa-calendar-check-o mr-1" />
              {t('doctorSchedule.duty_roster')}
            </a>
            <a href="/opd-queue" className="hms-btn-secondary text-xs">
              <i className="fa fa-list-alt mr-1" />
              {t('doctorSchedule.opd_queue')}
            </a>
            <a href="/portal/call-queue/launcher" target="_blank" rel="noreferrer" className="hms-btn-secondary text-xs">
              <i className="fa fa-television mr-1" />
              {t('doctorSchedule.lobby_displays')}
            </a>
          </div>
        </SurfaceHero>

        <div className="hms-compact-kpi-grid hms-compact-kpi-grid--3 mb-3">
          <StatCard
            label={t('doctorSchedule.tab_today')}
            value={(localHub.appointments || []).length}
            tone="brand"
            icon="calendar-check"
          />
          <StatCard
            label={t('doctorSchedule.opd_queue')}
            value={opdQueue.length}
            tone="warning"
            icon="users"
          />
          <StatCard
            label={t('doctorSchedule.warnings')}
            value={warnings.length}
            tone={warnings.length ? 'warning' : 'default'}
            icon="exclamation-triangle"
          />
        </div>

        {warnings.length ? (
          <div className="mb-4 space-y-2">
            {warnings.map((w) => (
              <div
                key={w.code}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                {t(`doctorSchedule.warn_${w.code}`)}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-2">
          <FilterChip active={tab === 'today'} onClick={() => setTab('today')}>
            {t('doctorSchedule.tab_today')}
          </FilterChip>
          <FilterChip active={tab === 'duty'} onClick={() => setTab('duty')}>
            {t('doctorSchedule.tab_duty')}
          </FilterChip>
          <FilterChip active={tab === 'hours'} onClick={() => setTab('hours')}>
            {t('doctorSchedule.tab_hours')}
          </FilterChip>
          <FilterChip active={tab === 'opd'} onClick={() => setTab('opd')}>
            {t('doctorSchedule.tab_opd')}
          </FilterChip>
          {maySwap ? (
            <FilterChip active={tab === 'swap'} onClick={() => setTab('swap')}>
              {t('doctorSchedule.tab_swap')}
            </FilterChip>
          ) : null}
        </div>

        {tab === 'today' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">
                {t('doctorSchedule.appointments')}
              </h2>
              {(localHub.appointments || []).length ? (
                <ul className="space-y-2">
                  {(localHub.appointments || []).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <div>
                        <div className="font-bold text-ink">{a.patient_name || '—'}</div>
                        <div className="text-xs text-slate-500">{a.reason || a.status}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-xs font-bold text-brand">{a.time || '—'}</span>
                        {mayCheckIn && a.can_check_in ? (
                          <button
                            type="button"
                            className="rounded-lg bg-brand px-2 py-1 text-[11px] font-bold text-white"
                            disabled={checkInBusy === a.id}
                            onClick={() => checkInAppointment(a.id)}
                          >
                            {checkInBusy === a.id
                              ? t('doctorSchedule.checking_in')
                              : t('doctorSchedule.check_in_opd')}
                          </button>
                        ) : a.opd_visit_id ? (
                          <span className="text-[10px] font-bold uppercase text-emerald-600">
                            {t('doctorSchedule.in_opd')}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">{t('doctorSchedule.no_appointments')}</p>
              )}
              <a href="/appointments" className="mt-3 inline-block text-xs font-bold text-brand hover:underline">
                {t('doctorSchedule.open_appointments')}
              </a>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">
                {t('doctorSchedule.opd_today')}
              </h2>
              {opdQueue.length ? (
                <ul className="space-y-2">
                  {opdQueue.map((v) => (
                    <li key={v.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <div>
                        <div className="font-bold text-ink">{v.patient_name}</div>
                        <div className="text-xs text-slate-500">
                          #{v.ticket_number} · {String(v.queue_status || '').replace(/_/g, ' ')}
                          {v.room ? ` · ${v.room}` : ''}
                        </div>
                      </div>
                      {mayCall && v.queue_status === 'waiting_doctor' ? (
                        <button
                          type="button"
                          className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white"
                          onClick={() => postForm('/opd-queue/call-patient', { visit_id: v.id })}
                        >
                          {t('doctorSchedule.call')}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">{t('doctorSchedule.no_opd')}</p>
              )}
            </section>
          </div>
        ) : null}

        {tab === 'duty' ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('doctorSchedule.col_date')}</th>
                  <th className="px-4 py-3">{t('doctorSchedule.col_duty')}</th>
                  <th className="px-4 py-3">{t('doctorSchedule.col_hours')}</th>
                  <th className="px-4 py-3">{t('doctorSchedule.col_room')}</th>
                </tr>
              </thead>
              <tbody>
                {(localHub.dutyWeek || []).map((row) => (
                  <tr key={row.duty_date} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium">{row.duty_date}</td>
                    <td className="px-4 py-2">{dutyLabel(t, row.duty_type)}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {row.start_time && row.end_time ? `${row.start_time}–${row.end_time}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{row.room_label || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {tab === 'hours' ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <p className="mb-3 text-sm text-slate-500">
              {t('doctorSchedule.hours_hint')}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(localHub.availability || []).map((a) => (
                <div
                  key={a.weekday}
                  className={`rounded-xl border px-3 py-2 text-sm ${a.active ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50 opacity-70'}`}
                >
                  <div className="font-bold">{a.label}</div>
                  <div className="text-xs text-slate-600">
                    {a.active && a.start_time && a.end_time
                      ? `${a.start_time}–${a.end_time} · ${a.slot_minutes} min`
                      : t('doctorSchedule.closed')}
                  </div>
                </div>
              ))}
            </div>
            <a href="/hms/appointments/slots-config" className="mt-3 inline-block text-xs font-bold text-brand hover:underline">
              {t('doctorSchedule.edit_hours')}
            </a>
          </section>
        ) : null}

        {tab === 'opd' ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            {opdQueue.length ? (
              <ul className="space-y-2">
                {opdQueue.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3"
                  >
                    <div>
                      <div className="font-bold text-ink">
                        {v.arrival_no ? `#${v.arrival_no} ` : ''}
                        {v.patient_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        Ticket {v.ticket_number} · {String(v.queue_status || '').replace(/_/g, ' ')}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {mayCall && ['waiting_doctor', 'in_consultation'].includes(v.queue_status) ? (
                        <button
                          type="button"
                          className="hms-btn-secondary text-xs"
                          onClick={() => postForm('/opd-queue/call-patient', { visit_id: v.id })}
                        >
                          {t('doctorSchedule.call')}
                        </button>
                      ) : null}
                      <a
                        href={`/consultation-new?patient_id=${v.patient_id || ''}&visit_id=${v.id}`}
                        className="hms-btn hms-btn-action-complete text-xs"
                      >
                        {t('doctorSchedule.consult')}
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{t('doctorSchedule.no_opd')}</p>
            )}
          </section>
        ) : null}

        {tab === 'swap' && maySwap ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">
                {t('doctorSchedule.swap_request')}
              </h2>
              <form className="space-y-3" onSubmit={submitSwap}>
                <label className="block text-xs font-bold text-slate-600">
                  {t('doctorSchedule.swap_partner')}
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={swapForm.partner_id}
                    required
                    onChange={(e) => setSwapForm((f) => ({ ...f, partner_id: e.target.value }))}
                  >
                    <option value="">{t('doctorSchedule.swap_pick')}</option>
                    {(localHub.swapPartners || []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-bold text-slate-600">
                    {t('doctorSchedule.swap_my_date')}
                    <input
                      type="date"
                      required
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={swapForm.from_date}
                      onChange={(e) => setSwapForm((f) => ({ ...f, from_date: e.target.value }))}
                    />
                  </label>
                  <label className="block text-xs font-bold text-slate-600">
                    {t('doctorSchedule.swap_their_date')}
                    <input
                      type="date"
                      required
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={swapForm.to_date}
                      onChange={(e) => setSwapForm((f) => ({ ...f, to_date: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="block text-xs font-bold text-slate-600">
                  {t('doctorSchedule.swap_note')}
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    rows={2}
                    value={swapForm.note}
                    onChange={(e) => setSwapForm((f) => ({ ...f, note: e.target.value }))}
                  />
                </label>
                <button type="submit" className="hms-btn hms-btn-action-complete" disabled={swapBusy}>
                  {swapBusy
                    ? t('doctorSchedule.swap_submitting')
                    : t('doctorSchedule.swap_submit')}
                </button>
              </form>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">
                {t('doctorSchedule.swap_pending')}
              </h2>
              {(localHub.swapRequests || []).length ? (
                <ul className="space-y-2">
                  {(localHub.swapRequests || []).map((s) => (
                    <li key={s.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <div className="font-bold">
                        {s.requester_id === staffEmpId ? s.partner_name : s.requester_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {s.from_date} ↔ {s.to_date}
                      </div>
                      <button
                        type="button"
                        className="mt-1 text-xs font-bold text-rose-600 hover:underline"
                        onClick={() => cancelSwap(s.id)}
                      >
                        {t('doctorSchedule.swap_cancel')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">
                  {t('doctorSchedule.swap_none')}
                </p>
              )}
              {mayApproveSwap ? (
                <div className="mt-6 border-t border-slate-200 pt-4">
                  <h3 className="mb-2 text-xs font-extrabold uppercase text-slate-500">
                    {t('doctorSchedule.swap_approve_queue')}
                  </h3>
                  {adminSwaps.length ? (
                    <ul className="space-y-2">
                      {adminSwaps.map((s) => (
                        <li key={s.id} className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm">
                          <div className="font-bold text-ink">
                            {s.requester_name} ↔ {s.partner_name}
                          </div>
                          <div className="text-xs text-slate-600">
                            {s.from_date} / {s.to_date}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white"
                              onClick={() => reviewSwap(s.id, 'approve')}
                            >
                              {t('doctorSchedule.swap_approve')}
                            </button>
                            <button
                              type="button"
                              className="rounded bg-slate-500 px-2 py-1 text-[11px] font-bold text-white"
                              onClick={() => reviewSwap(s.id, 'reject')}
                            >
                              {t('doctorSchedule.swap_reject')}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500">
                      {t('doctorSchedule.swap_approve_none')}
                    </p>
                  )}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
