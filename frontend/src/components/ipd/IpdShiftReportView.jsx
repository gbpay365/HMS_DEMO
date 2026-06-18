import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipdStatusPillLocalized } from '../../lib/wardUi';

function fmtDt(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'});
  } catch {
    return String(value);
  }
}

function RevisionStrikes({ strikes = [], field }) {
  const items = strikes[field] || [];
  if (!items.length) return null;
  return (
    <div className="mb-2 space-y-1">
      {items.map((text, i) => (
        <p key={i} className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] text-rose-700 line-through decoration-rose-500">
          {text}
        </p>
      ))}
    </div>
  );
}

function DoseList({ title, icon, items = [], tone = 'emerald' }) {
  const tones = {
    emerald: 'border-emerald-100 bg-emerald-50/60 text-emerald-900',
    amber: 'border-amber-100 bg-amber-50/60 text-amber-900',
    slate: 'border-slate-100 bg-slate-50 text-slate-700'};
  if (!items.length) return null;
  return (
    <div className={`rounded-xl border p-3 ${tones[tone] || tones.slate}`}>
      <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide">
        <i className={`fa ${icon}`} aria-hidden="true" />
        {title}
      </div>
      <ul className="space-y-1.5 text-xs">
        {items.map((d, i) => (
          <li key={d.id || `${d.drug_name}-${i}`} className="flex items-start gap-2 rounded-lg bg-white/70 px-2 py-1.5">
            <i className="fa fa-medkit mt-0.5 text-[10px] opacity-60" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="font-bold">
                {d.drug_name} · {d.dosage || d.slot_dosage} · {d.route}
              </div>
              <div className="text-[10px] opacity-75">
                {fmtDt(d.administered_at || d.scheduled_at)}
                {d.nurse_name ? ` · ${d.nurse_name}` : ''}
                {d.missed_reason ? ` · ${d.missed_reason}` : ''}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IsbarField({ icon, label, hint, name, value, readOnly, strikes, rows = 3 }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
          <i className={`fa ${icon} text-sm`} aria-hidden="true" />
        </span>
        <div>
          <div className="text-sm font-extrabold text-ink">{label}</div>
          {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
        </div>
      </div>
      <RevisionStrikes strikes={strikes} field={name} />
      <textarea
        name={name}
        className="hms-input w-full text-sm"
        rows={rows}
        defaultValue={value || ''}
        readOnly={readOnly}
        placeholder={readOnly ? '' : hint}
      />
    </div>
  );
}

export function IpdShiftReportView({
  admission = {},
  shift = null,
  previous = [],
  doseActivity = {},
  treatmentSummary = null,
  activeTreatment = null,
  patientStatus = 'admitted',
  nurseName = '',
  nextNurseName = '',
  nurses = [],
  revisionStrikes = {},
  revisions = [],
  canEdit = false,
  canRecall = false,
  shiftSubmitted = false,
  showHandoverAndMessage = false,
  viewingHistorical = false,
  viewerId = 0}) {
  const { t } = useTranslation('ipd');
  const [recallOpen, setRecallOpen] = useState(false);
  const pill = ipdStatusPillLocalized(patientStatus, t);

  const doses = useMemo(() => {
    if (treatmentSummary) {
      return {
        administered: treatmentSummary.administered || [],
        missed: treatmentSummary.missed || [],
        pending: treatmentSummary.pending || []};
    }
    return doseActivity;
  }, [doseActivity, treatmentSummary]);

  const statusBadge = shiftSubmitted
    ? 'bg-emerald-100 text-emerald-800 ring-emerald-200'
    : 'bg-amber-100 text-amber-900 ring-amber-200';

  if (!shift) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500">
        {t('handover.no_open_report')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header — I-SBARR Introduction */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-sky-300">
              <i className="fa fa-exchange" aria-hidden="true" />
              {t('handover.title')}
            </div>
            <h1 className="text-xl font-extrabold">
              {admission.first_name} {admission.last_name}
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              {admission.ward_name || '—'} · {admission.bed_label || '—'} · {admission.doctor_name || '—'}
            </p>
            {activeTreatment ? (
              <p className="mt-2 text-xs text-sky-200">
                <i className="fa fa-stethoscope mr-1" aria-hidden="true" />
                {activeTreatment.diagnosis}
              </p>
            ) : null}
          </div>
          <div className="text-right text-sm">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ring-1 ring-inset ${statusBadge}`}>
              {shiftSubmitted ? t('handover.status_submitted') : t('handover.status_draft')}
            </span>
            <div className="mt-3 space-y-1 text-xs text-slate-300">
              <div>
                <i className="fa fa-user-md mr-1" aria-hidden="true" />
                {t('handover.outgoing_nurse')}: <strong className="text-white">{nurseName || '—'}</strong>
              </div>
              <div>
                <i className="fa fa-clock-o mr-1" aria-hidden="true" />
                {t('handover.shift_started')}: {fmtDt(shift.shift_started_at)}
              </div>
              {shift.shift_ended_at ? (
                <div>
                  <i className="fa fa-flag-checkered mr-1" aria-hidden="true" />
                  {t('handover.shift_ended')}: {fmtDt(shift.shift_ended_at)}
                </div>
              ) : null}
              <div>
                <i className="fa fa-sun-o mr-1" aria-hidden="true" />
                {shift.shift_label || t('handover.shift_current')}
              </div>
              {nextNurseName ? (
                <div>
                  <i className="fa fa-arrow-right mr-1" aria-hidden="true" />
                  {t('handover.incoming_nurse')}: <strong className="text-white">{nextNurseName}</strong>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={pill.className}>{pill.label}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold">
            {t('handover.report_id', { id: shift.id })}
          </span>
          {shift.recalled_at ? (
            <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold text-orange-200">
              {t('handover.recalled_at', { time: fmtDt(shift.recalled_at) })}
            </span>
          ) : null}
          {shift.submitted_to_doctor_at ? (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
              <i className="fa fa-paper-plane mr-1" aria-hidden="true" />
              {t('handover.sent_to_doctor', { time: fmtDt(shift.submitted_to_doctor_at) })}
            </span>
          ) : null}
        </div>
      </div>

      {/* Treatments administered — auto from drug chart */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <i className="fa fa-heartbeat" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-extrabold text-ink">{t('handover.treatments_title')}</h2>
            <p className="text-xs text-slate-500">{t('handover.treatments_hint')}</p>
          </div>
          <div className="ml-auto flex gap-2">
            <a
              href={`/nursing/supply-requests?admission_id=${admission.id}&patient=${encodeURIComponent(`${admission.first_name || ''} ${admission.last_name || ''}`.trim())}&ward=${encodeURIComponent(admission.ward_name || '')}`}
              className="hms-btn-secondary text-xs"
            >
              <i className="fa fa-medkit mr-1" aria-hidden="true" />
              {t('supply.short_label')}
            </a>
            <a href={`/ipd/chart/${admission.id}`} className="hms-btn-secondary text-xs">
              <i className="fa fa-table mr-1" aria-hidden="true" />
              {t('handover.open_chart')}
            </a>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <DoseList title={t('handover.doses_given')} icon="fa-check-circle" items={doses.administered} tone="emerald" />
          <DoseList title={t('handover.doses_missed')} icon="fa-exclamation-triangle" items={doses.missed} tone="amber" />
          <DoseList title={t('handover.doses_pending')} icon="fa-clock-o" items={doses.pending} tone="slate" />
        </div>
        {!doses.administered?.length && !doses.missed?.length && !doses.pending?.length ? (
          <p className="text-sm text-slate-400">{t('handover.no_doses_shift')}</p>
        ) : null}
      </div>

      {/* ISBAR form */}
      <form method="POST" action="/ipd/shift-report/save" className="space-y-3">
        <input type="hidden" name="shift_report_id" value={shift.id} />
        <div className="grid gap-3 lg:grid-cols-2">
          <IsbarField
            icon="fa-info-circle"
            label={t('handover.field_situation')}
            hint={t('handover.field_situation_hint')}
            name="ward_rounds"
            value={shift.ward_rounds}
            readOnly={!canEdit}
            strikes={revisionStrikes}
          />
          <IsbarField
            icon="fa-history"
            label={t('handover.field_background')}
            hint={t('handover.field_background_hint')}
            name="done_notes"
            value={shift.done_notes}
            readOnly={!canEdit}
            strikes={revisionStrikes}
          />
          <IsbarField
            icon="fa-stethoscope"
            label={t('handover.field_assessment')}
            hint={t('handover.field_assessment_hint')}
            name="free_notes"
            value={shift.free_notes}
            readOnly={!canEdit}
            strikes={revisionStrikes}
          />
          <IsbarField
            icon="fa-arrow-circle-right"
            label={t('handover.field_recommendation')}
            hint={t('handover.field_recommendation_hint')}
            name="pending_notes"
            value={shift.pending_notes}
            readOnly={!canEdit}
            strikes={revisionStrikes}
          />
        </div>
        <IsbarField
          icon="fa-times-circle"
          label={t('handover.field_not_done')}
          hint={t('handover.field_not_done_hint')}
          name="not_done_notes"
          value={shift.not_done_notes}
          readOnly={!canEdit}
          strikes={revisionStrikes}
          rows={2}
        />
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="hms-btn-primary">
              <i className="fa fa-save mr-1" aria-hidden="true" />
              {shiftSubmitted ? t('handover.save_corrections') : t('pages.save_report')}
            </button>
            {shiftSubmitted ? (
              <span className="self-center text-xs text-orange-700">
                <i className="fa fa-shield mr-1" aria-hidden="true" />
                {t('handover.corrections_audited')}
              </span>
            ) : null}
          </div>
        ) : viewingHistorical || shiftSubmitted ? (
          <p className="text-xs text-slate-500">
            <i className="fa fa-lock mr-1" aria-hidden="true" />
            {t('handover.read_only')}
          </p>
        ) : null}
      </form>

      {/* Handover submit */}
      {showHandoverAndMessage ? (
        <form method="POST" action="/ipd/shift-report/handover" className="rounded-2xl border-2 border-sky-200 bg-sky-50/50 p-4">
          <input type="hidden" name="shift_report_id" value={shift.id} />
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white">
              <i className="fa fa-paper-plane" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-extrabold text-ink">{t('handover.submit_title')}</h2>
              <p className="text-xs text-slate-600">{t('handover.submit_hint')}</p>
            </div>
          </div>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="hms-label" htmlFor="patient-status">
                {t('handover.patient_status')}
              </label>
              <select id="patient-status" name="patient_status" className="hms-input" defaultValue={patientStatus}>
                <option value="admitted">{t('status.admitted')}</option>
                <option value="clinical_discharged">{t('status.clinical_discharged')}</option>
                <option value="stable">{t('handover.status_stable')}</option>
                <option value="watch">{t('handover.status_watch')}</option>
                <option value="critical">{t('handover.status_critical')}</option>
              </select>
            </div>
            <div>
              <label className="hms-label" htmlFor="next-nurse">
                {t('handover.incoming_nurse_select')}
              </label>
              <select id="next-nurse" name="next_nurse_id" className="hms-input" required defaultValue="">
                <option value="">{t('handover.select_nurse')}</option>
                {nurses.map((n) => (
                  <option key={n.id} value={n.id} disabled={Number(n.id) === Number(viewerId)}>
                    {n.first_name} {n.last_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="hms-label" htmlFor="handover-notes">
              {t('handover.readback_notes')}
            </label>
            <textarea
              id="handover-notes"
              name="handover_notes"
              className="hms-input w-full"
              rows={3}
              placeholder={t('handover.readback_ph')}
              required
            />
          </div>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" name="notify_doctor" value="1" defaultChecked className="rounded" />
            <span>
              <i className="fa fa-user-md mr-1 text-sky-700" aria-hidden="true" />
              {t('handover.notify_doctor')}
            </span>
          </label>
          <button type="submit" className="hms-btn-primary">
            <i className="fa fa-check-circle mr-1" aria-hidden="true" />
            {t('handover.submit_btn')}
          </button>
        </form>
      ) : null}

      {/* Recall for corrections */}
      {canRecall ? (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
          {!recallOpen ? (
            <button type="button" className="hms-btn-secondary text-sm" onClick={() => setRecallOpen(true)}>
              <i className="fa fa-undo mr-1" aria-hidden="true" />
              {t('handover.recall_btn')}
            </button>
          ) : (
            <form method="POST" action="/ipd/shift-report/recall" className="space-y-2">
              <input type="hidden" name="shift_report_id" value={shift.id} />
              <p className="text-sm text-orange-900">{t('handover.recall_hint')}</p>
              <textarea name="reason" className="hms-input w-full text-sm" rows={2} placeholder={t('handover.recall_reason_ph')} />
              <div className="flex gap-2">
                <button type="submit" className="hms-btn-primary text-sm">
                  {t('handover.confirm_recall')}
                </button>
                <button type="button" className="hms-btn-secondary text-sm" onClick={() => setRecallOpen(false)}>
                  {t('shared.cancel')}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {/* Audit trail */}
      {revisions.length > 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <h3 className="mb-2 font-bold text-ink">
            <i className="fa fa-history mr-1 text-slate-400" aria-hidden="true" />
            {t('handover.correction_audit')}
          </h3>
          <div className="max-h-48 space-y-2 overflow-y-auto text-xs">
            {revisions.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="font-bold text-slate-700">
                  {r.editor_name || r.edited_name} · {fmtDt(r.created_at)} · {r.field_key}
                </div>
                {r.old_text ? <p className="text-rose-600 line-through">{String(r.old_text).slice(0, 120)}</p> : null}
                {r.new_text ? <p className="text-emerald-700">{String(r.new_text).slice(0, 120)}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Previous handovers */}
      {previous.length > 1 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <h3 className="mb-3 font-bold text-ink">
            <i className="fa fa-list-alt mr-1 text-slate-400" aria-hidden="true" />
            {t('handover.previous_reports')}
          </h3>
          <div className="space-y-2">
            {previous
              .filter((p) => p.id !== shift.id)
              .map((p) => (
                <a
                  key={p.id}
                  href={`/ipd/shift/${admission.id}?report=${p.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm hover:border-sky-200 hover:bg-sky-50"
                >
                  <div>
                    <div className="font-bold">{p.nurse_name || '—'}</div>
                    <div className="text-[10px] text-slate-500">
                      {p.shift_label} · {fmtDt(p.shift_ended_at || p.shift_started_at)}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      p.report_status === 'submitted' || p.locked
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {p.report_status || 'open'}
                  </span>
                </a>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
