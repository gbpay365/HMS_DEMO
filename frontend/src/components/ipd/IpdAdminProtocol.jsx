import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { confirmFormSubmit } from '../../lib/modalBridge';
import { IpdPrescriptionEditPanel } from './IpdPrescriptionEditPanel';

const MISS_REASONS = [
  { value: 'Patient refused', key: 'refused' },
  { value: 'Patient vomited', key: 'vomited' },
  { value: 'Drug unavailable', key: 'unavailable' },
  { value: 'Other', key: 'other' },
];

function parseSlotDate(val) {
  if (!val) return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  const s = String(val).trim();
  if (!s) return null;
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayGroupKey(val) {
  const d = parseSlotDate(val);
  if (!d) return String(val).slice(0, 10) || 'unknown';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtSlotTime(val) {
  const d = parseSlotDate(val);
  if (!d) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtSlotDate(val) {
  const d = parseSlotDate(val);
  if (!d) return '—';
  // NOTE: weekday cannot be mixed with dateStyle (throws RangeError in some browsers).
  // Use individual component options instead.
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtSlotTimeOnly(val) {
  const d = parseSlotDate(val);
  if (!d) return '—';
  return d.toLocaleTimeString(undefined, { timeStyle: 'short' });
}

function toDatetimeLocal(val) {
  const d = parseSlotDate(val);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function slotStatus(slot, t) {
  if (Number(slot.administered) === 1) {
    return {
      label: t('treatment.given'),
      className: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
      rowClass: 'border-l-4 border-l-emerald-500 bg-emerald-50/60'};
  }
  if (slot.missed_reason) {
    return {
      label: slot.missed_reason,
      className: 'bg-red-100 text-red-800 ring-red-200',
      rowClass: 'border-l-4 border-l-red-500 bg-red-50/60'};
  }
  return {
    label: t('treatment.pending'),
    className: 'bg-amber-100 text-amber-900 ring-amber-200',
    rowClass: 'border-l-4 border-l-amber-400 bg-white'};
}

function groupSlotsByDay(slots) {
  const groups = new Map();
  for (const slot of slots) {
    const key = dayGroupKey(slot.scheduled_at);
    if (!groups.has(key)) groups.set(key, { label: fmtSlotDate(slot.scheduled_at), slots: [] });
    groups.get(key).slots.push(slot);
  }
  return [...groups.values()];
}

export function IpdAdminProtocol({
  doseSlots = [],
  prescriptions = [],
  inventory = [],
  canEdit = false,
  canAdminister = false,
  treatmentActive = true,
  returnTo = 'treatment'}) {
  const { t } = useTranslation('ipd');
  const [selectedId, setSelectedId] = useState(null);
  const [panelTab, setPanelTab] = useState('dose');
  const [ackState, setAckState] = useState(() =>
    Object.fromEntries(doseSlots.map((s) => [s.id, Number(s.doctor_ack) === 1]))
  );

  const grouped = useMemo(() => groupSlotsByDay(doseSlots), [doseSlots]);
  const selected = doseSlots.find((s) => s.id === selectedId) || null;
  const selectedRx = useMemo(
    () => (selected ? prescriptions.find((r) => Number(r.id) === Number(selected.prescription_id)) : null),
    [selected, prescriptions]
  );

  const isPending = selected && Number(selected.administered) !== 1 && !selected.missed_reason;
  const isGiven = selected && Number(selected.administered) === 1;
  const isMissed = selected && Boolean(selected.missed_reason);

  const showDoctorDoseForm = canEdit && treatmentActive && isPending;
  const showNursePendingForm = canAdminister && treatmentActive && isPending;
  const showNurseCorrectForm = canAdminister && isGiven;
  const rxEditable = canEdit && treatmentActive && selectedRx && Number(selectedRx.locked) !== 1;

  const introKey = canEdit
    ? 'protocol_intro_rx'
    : canAdminister
      ? 'protocol_intro_nurse'
      : 'protocol_intro';

  useEffect(() => {
    setPanelTab('dose');
  }, [selectedId]);

  const toggleAck = async (slot, checked, ev) => {
    ev.stopPropagation();
    setAckState((prev) => ({ ...prev, [slot.id]: checked }));
    try {
      const body = new URLSearchParams({ doctor_ack: checked ? '1' : '0' });
      await fetch(`/ipd/dose/${slot.id}/ack`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json'},
        body});
    } catch {
      setAckState((prev) => ({ ...prev, [slot.id]: !checked }));
    }
  };

  if (!doseSlots.length) return null;

  const givenCount = doseSlots.filter((s) => Number(s.administered) === 1).length;
  const pendingCount = doseSlots.filter((s) => !s.administered && !s.missed_reason).length;
  const missedCount = doseSlots.filter((s) => s.missed_reason).length;

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50/50 via-white to-blue-50/30 shadow-card">
      <div className="border-b border-sky-100 bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-4 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-lg shadow-sm">
              <i className="fa fa-calendar-check-o" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold">{t('treatment.admin_protocol')}</h2>
              <p className="mt-1 max-w-2xl text-xs text-sky-100">{t(`treatment.${introKey}`)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/25 px-2.5 py-1 font-bold text-emerald-50 ring-1 ring-emerald-300/40">
              <i className="fa fa-check-circle" aria-hidden="true" />
              {givenCount} {t('treatment.given')}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/25 px-2.5 py-1 font-bold text-amber-50 ring-1 ring-amber-300/40">
              <i className="fa fa-hourglass-half" aria-hidden="true" />
              {pendingCount} {t('treatment.pending')}
            </span>
            {missedCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/25 px-2.5 py-1 font-bold text-red-50 ring-1 ring-red-300/40">
                <i className="fa fa-times-circle" aria-hidden="true" />
                {missedCount} {t('treatment.missed')}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-12">
        <div className={`${selected ? 'lg:col-span-6' : 'lg:col-span-12'} max-h-[28rem] overflow-y-auto`}>
          {grouped.map(({ label: dayLabel, slots: daySlots }) => (
            <div key={dayLabel}>
              <div className="sticky top-0 z-10 border-b border-sky-100 bg-gradient-to-r from-sky-100 to-blue-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-sky-800 backdrop-blur">
                <i className="fa fa-calendar mr-1.5" aria-hidden="true" />
                {dayLabel}
              </div>
              <div className="divide-y divide-slate-100">
                {daySlots.map((slot) => {
                  const status = slotStatus(slot, t);
                  const isSelected = selectedId === slot.id;
                  const acked = ackState[slot.id] ?? Number(slot.doctor_ack) === 1;

                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setSelectedId(isSelected ? null : slot.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-sky-50/50 ${status.rowClass} ${
                        isSelected ? 'bg-indigo-50/50 ring-2 ring-inset ring-indigo-400' : ''
                      }`}
                    >
                      {canEdit ? (
                        <span
                          className="shrink-0"
                          onClick={(ev) => ev.stopPropagation()}
                          title={t('treatment.ack_optional_hint')}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={acked}
                            onChange={(ev) => toggleAck(slot, ev.target.checked, ev)}
                          />
                        </span>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-xs text-sky-700">
                            <i className="fa fa-flask" aria-hidden="true" />
                          </span>
                          <span className="font-semibold text-slate-900">{slot.drug_name}</span>
                          <span className="text-sm text-slate-500">{slot.dosage}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 pl-9 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                            <i className="fa fa-clock-o text-sky-500" aria-hidden="true" />
                            {fmtSlotTimeOnly(slot.scheduled_at)}
                          </span>
                          {slot.frequency_label ? <span>· {slot.frequency_label}</span> : null}
                        </div>
                        {slot.doctor_comment ? (
                          <p className="mt-1 truncate text-xs italic text-indigo-700">{slot.doctor_comment}</p>
                        ) : null}
                        {slot.nurse_comment ? (
                          <p className="mt-1 truncate text-xs text-emerald-700">{slot.nurse_comment}</p>
                        ) : null}
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ring-1 ${status.className}`}>
                        {status.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {selected ? (
          <div className="border-t border-sky-100 bg-gradient-to-br from-slate-50 to-indigo-50/30 lg:col-span-6 lg:max-h-[28rem] lg:overflow-y-auto lg:border-l lg:border-t-0">
            <div className="sticky top-0 z-10 border-b border-sky-100 bg-white/90 px-4 pt-3 backdrop-blur">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <i className="fa fa-list-alt text-indigo-600" aria-hidden="true" />
                  {t('treatment.protocol_detail')}
                </h3>
                <button type="button" className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setSelectedId(null)}>
                  {t('treatment.close_panel')}
                </button>
              </div>
              {canEdit && prescriptions.length > 0 ? (
                <div className="mb-3 flex gap-1 rounded-lg bg-slate-200/60 p-1">
                  <button
                    type="button"
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition ${
                      panelTab === 'dose' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`}
                    onClick={() => setPanelTab('dose')}
                  >
                    {t('treatment.tab_dose_line')}
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition ${
                      panelTab === 'rx' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`}
                    onClick={() => setPanelTab('rx')}
                  >
                    {t('treatment.tab_prescription')}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="p-4">
              {panelTab === 'dose' || !canEdit ? (
                <>
                  <div className="mb-4 rounded-xl border border-white bg-white p-3 text-sm shadow-sm">
                    <div className="font-semibold text-slate-900">{selected.drug_name}</div>
                    <div className="text-slate-600">
                      {selected.dosage} · {fmtSlotTime(selected.scheduled_at)}
                    </div>
                    <div className="mt-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${slotStatus(selected, t).className}`}>
                        {slotStatus(selected, t).label}
                      </span>
                      {isGiven && Number(selected.admin_locked) === 1 ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase text-emerald-700">
                          · {t('treatment.admin_locked')}
                        </span>
                      ) : null}
                    </div>
                    {selected.doctor_comment ? (
                      <p className="mt-2 text-xs text-indigo-700">
                        {t('treatment.doctor_comment')}: {selected.doctor_comment}
                      </p>
                    ) : null}
                    {selected.nurse_comment ? (
                      <p className="mt-2 text-xs text-emerald-700">
                        {t('treatment.nurse_comment')}: {selected.nurse_comment}
                      </p>
                    ) : null}
                    {isGiven && selected.nurse_name ? (
                      <p className="mt-2 text-xs text-slate-500">
                        {t('treatment.given_by', { name: selected.nurse_name })}
                      </p>
                    ) : null}
                    {isMissed ? (
                      <p className="mt-2 text-xs text-red-700">{t('treatment.nurse_note')}: {selected.missed_reason}</p>
                    ) : null}
                  </div>

                  {showDoctorDoseForm ? (
                    <form method="POST" action={`/ipd/dose/${selected.id}/update`} className="mb-4 space-y-3 rounded-xl border border-indigo-100 bg-white p-3">
                      <p className="text-xs font-bold text-indigo-900">{t('treatment.doctor_edit_dose')}</p>
                      <input type="hidden" name="doctor_ack" value={ackState[selected.id] ? '1' : '0'} />
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">{t('treatment.slot_dosage')}</label>
                        <input
                          type="text"
                          name="slot_dosage"
                          defaultValue={selected.slot_dosage || selected.dosage || ''}
                          className="hms-input w-full text-sm"
                          placeholder={t('treatment.slot_dosage_ph')}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">{t('treatment.reschedule')}</label>
                        <input
                          type="datetime-local"
                          name="scheduled_at"
                          defaultValue={toDatetimeLocal(selected.scheduled_at)}
                          className="hms-input w-full text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">{t('treatment.doctor_comment')}</label>
                        <textarea
                          name="doctor_comment"
                          rows={3}
                          className="hms-input w-full text-sm"
                          placeholder={t('treatment.doctor_comment_ph')}
                          defaultValue={selected.doctor_comment || ''}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" className="hms-btn hms-btn-primary text-xs">
                          <i className="fa fa-save" aria-hidden="true" />
                          {t('treatment.save_line')}
                        </button>
                        <button
                          type="submit"
                          formAction={`/ipd/dose/${selected.id}/delete`}
                          formMethod="POST"
                          className="hms-btn hms-btn-outline-danger text-xs"
                          onClick={(ev) =>
                            confirmFormSubmit(ev, {
                              title: t('treatment.delete_line'),
                              message: t('treatment.delete_line_confirm'),
                              confirmLabel: t('treatment.delete_line'),
                              tone: 'danger'})
                          }
                        >
                          {t('treatment.delete_line')}
                        </button>
                      </div>
                    </form>
                  ) : null}

                  {showNursePendingForm ? (
                    <div className="mb-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                      <p className="text-xs font-bold text-emerald-900">{t('treatment.nurse_administer')}</p>
                      <form method="POST" action={`/ipd/dose/${selected.id}/administer`} className="space-y-3">
                        <input type="hidden" name="return_to" value={returnTo} />
                        <div>
                          <label className="mb-1 block text-xs font-bold text-slate-700">{t('treatment.nurse_comment')}</label>
                          <textarea
                            name="nurse_comment"
                            rows={2}
                            className="hms-input w-full text-sm"
                            placeholder={t('treatment.nurse_comment_ph')}
                          />
                        </div>
                        <button
                          type="submit"
                          className="hms-btn hms-btn-action-dispense w-full text-sm"
                          onClick={(ev) =>
                            confirmFormSubmit(ev, {
                              title: t('treatment.nurse_administer'),
                              message: t('treatment.confirm_administer_confirm'),
                              confirmLabel: t('treatment.nurse_administer')})
                          }
                        >
                          <i className="fa fa-check" aria-hidden="true" />
                          {t('treatment.confirm_administered')}
                        </button>
                      </form>
                      <form method="POST" action={`/ipd/dose/${selected.id}/miss`} className="space-y-2 border-t border-emerald-200 pt-3">
                        <input type="hidden" name="return_to" value={returnTo} />
                        <label className="block text-xs font-bold text-slate-700">{t('treatment.mark_missed')}</label>
                        <div className="flex flex-wrap gap-2">
                          <select name="reason" className="hms-input min-w-[140px] flex-1 text-sm" required defaultValue="">
                            <option value="">{t('treatment.miss_reason')}</option>
                            {MISS_REASONS.map((r) => (
                              <option key={r.key} value={r.value}>
                                {t(`treatment.miss_${r.key}`)}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="hms-btn hms-btn-outline-danger text-xs">
                            <i className="fa fa-times-circle" aria-hidden="true" />
                            {t('treatment.mark_missed')}
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : null}

                  {showNurseCorrectForm ? (
                    <form
                      method="POST"
                      action={`/ipd/dose/${selected.id}/correct`}
                      className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-3"
                    >
                      <input type="hidden" name="return_to" value={returnTo} />
                      <p className="text-xs font-bold text-amber-900">{t('treatment.correct_entry')}</p>
                      <p className="text-xs text-amber-800">{t('treatment.correct_entry_hint')}</p>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">{t('treatment.correction_reason')}</label>
                        <textarea
                          name="correction_reason"
                          rows={2}
                          required
                          className="hms-input w-full text-sm"
                          placeholder={t('treatment.correction_reason_ph')}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">{t('treatment.nurse_comment')}</label>
                        <textarea
                          name="nurse_comment"
                          rows={2}
                          className="hms-input w-full text-sm"
                          defaultValue={selected.nurse_comment || ''}
                        />
                      </div>
                      <button type="submit" className="hms-btn hms-btn-secondary text-xs">
                        {t('treatment.save_correction')}
                      </button>
                    </form>
                  ) : null}

                  {!showDoctorDoseForm && !showNursePendingForm && !showNurseCorrectForm ? (
                    <p className="text-xs text-slate-500">
                      {isGiven && !canAdminister
                        ? t('treatment.line_locked_given')
                        : isMissed
                          ? t('treatment.line_locked_missed')
                          : !treatmentActive
                            ? t('treatment.line_locked_terminated')
                            : canAdminister
                              ? t('treatment.select_pending_nurse')
                              : t('treatment.select_to_edit')}
                    </p>
                  ) : null}
                </>
              ) : selectedRx ? (
                <IpdPrescriptionEditPanel rx={selectedRx} canEdit={rxEditable} inventory={inventory} compact />
              ) : (
                <p className="text-xs text-slate-500">{t('treatment.rx_not_found')}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="hidden border-t border-slate-100 bg-slate-50/50 px-4 py-6 text-center text-xs text-slate-400 lg:col-span-6 lg:block lg:border-l lg:border-t-0">
            {canAdminister ? t('treatment.select_line_hint_nurse') : t('treatment.select_line_hint')}
          </div>
        )}
      </div>
    </div>
  );
}
