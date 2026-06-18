import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { confirmModal } from '../lib/modalBridge';
import { notifyError } from '../lib/notifyBridge';
import { formatDate } from '../lib/listUi';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';

function initials(fn, ln) {
  return `${(fn || '?')[0] || '?'}${(ln || '?')[0] || '?'}`.toUpperCase();
}

function RadCard({ row, column, onStart, onComplete, onReset, t }) {
  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
            column === 'in_progress' ? 'bg-blue-600' : column === 'completed' ? 'bg-emerald-600' : 'bg-amber-500'
          }`}
        >
          {initials(row.p_fn, row.p_ln)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-900">
            {row.p_fn} {row.p_ln}
          </div>
          <div className="text-xs text-slate-500">
            #P-{row.patient_id} · #{String(row.id).padStart(4, '0')}
          </div>
        </div>
      </div>
      <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
        {row.exam_name || row.legacy_exam || '—'}
      </div>
      <div className="mb-3 flex flex-wrap gap-1 text-[10px]">
        {row.ref_fn ? (
          <span className="rounded bg-slate-100 px-2 py-0.5 font-bold">
            Dr. {row.ref_fn} {row.ref_ln}
          </span>
        ) : null}
        {row.body_part ? <span className="rounded bg-slate-100 px-2 py-0.5">{row.body_part}</span> : null}
        {row.appointment_date ? (
          <span className="rounded bg-slate-100 px-2 py-0.5">{formatDate(row.appointment_date)}</span>
        ) : null}
      </div>
      {column === 'pending' ? (
        <button type="button" className="hms-btn hms-btn-primary w-full text-sm" onClick={() => onStart(row)}>
          <i className="fa fa-play" aria-hidden="true" />
          {t('radiologyWorkflow.start_exam')}
        </button>
      ) : null}
      {column === 'in_progress' ? (
        <div className="flex gap-2">
          <button type="button" className="hms-btn hms-btn-success flex-1 text-sm" onClick={() => onComplete(row)}>
            <i className="fa fa-check-circle" aria-hidden="true" />
            {t('radiologyWorkflow.mark_complete')}
          </button>
          <button type="button" className="hms-btn hms-btn-secondary text-sm" onClick={() => onReset(row.id)}>
            <i className="fa fa-undo" aria-hidden="true" />
            {t('radiologyWorkflow.undo')}
          </button>
        </div>
      ) : null}
      {column === 'completed' && row.id ? (
        <a href={`/radiology/report/${row.id}`} className="hms-btn hms-btn-outline-primary block text-center text-sm">
          <i className="fa fa-file-text-o" aria-hidden="true" />
          {t('radiologyWorkflow.view_report')}
        </a>
      ) : null}
    </div>
  );
}

export function RadiologyWorkflowPageApp({
  pending = [],
  inProgress = [],
  completed = [],
  flash = null,
  error = null}) {
  const { t } = useTranslation('clinical');
  const [completeRow, setCompleteRow] = useState(null);
  const [findings, setFindings] = useState('');
  const [conclusion, setConclusion] = useState('');

  async function startExam(row) {
    const oi = parseInt(String(row?.opd_order_item_id || ''), 10) || 0;
    const code = String(row?.service_code || '').trim();
    if (oi > 0 && code) {
      const qs = new URLSearchParams({
        code,
        oi: String(oi),
        lock: '1',
        autoload: '1',
        start: '1',
        radiology_result_id: String(row.id)});
      window.location.href = `/radiology/templates?${qs.toString()}`;
      return;
    }

    if (!(await confirmModal({
      title: t('radiologyWorkflow.start_custom_title'),
      message: t('radiologyWorkflow.start_custom_msg'),
      confirmLabel: t('radiologyWorkflow.start_custom_confirm')}))) return;
    const r = await fetch(`/radiology/${row.id}/start`, { method: 'POST', credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (j.ok) window.location.reload();
    else notifyError(j.error || t('radiologyWorkflow.error_start'));
  }

  async function resetExam(id) {
    if (!(await confirmModal({
      title: t('radiologyWorkflow.reset_title'),
      message: t('radiologyWorkflow.reset_msg'),
      confirmLabel: t('radiologyWorkflow.reset_confirm'),
      tone: 'danger'}))) return;
    const r = await fetch(`/radiology/${id}/reset`, { method: 'POST', credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (j.ok) window.location.reload();
    else notifyError(j.error || t('radiologyWorkflow.error_reset'));
  }

  async function submitComplete(ev) {
    ev.preventDefault();
    if (!completeRow) return;
    const body = new URLSearchParams({ findings, conclusion_code: conclusion });
    const r = await fetch(`/radiology/${completeRow.id}/complete`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body});
    const j = await r.json().catch(() => ({}));
    if (j.ok) window.location.reload();
    else notifyError(j.error || t('radiologyWorkflow.error_complete'));
  }

  const cols = [
    { key: 'pending', title: t('radiologyWorkflow.pending'), rows: pending, tone: 'border-amber-400 bg-amber-50' },
    { key: 'in_progress', title: t('radiologyWorkflow.in_progress'), rows: inProgress, tone: 'border-blue-400 bg-blue-50' },
    { key: 'completed', title: t('radiologyWorkflow.completed'), rows: completed, tone: 'border-emerald-400 bg-emerald-50' },
  ];

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2">
      <FlashMessages flash={flash} error={error} />

      <SurfaceHero
        icon="film"
        title={t('radiologyWorkflow.title')}
        subtitle={t('radiologyWorkflow.subtitle')}
      >
        <div className="hms-surface-hero-actions mt-4">
          <a href="/radiology" className="hms-btn-secondary text-xs">
            {t('radiologyWorkflow.requests_list')}
          </a>
          <a href="/radiology/validate" className="hms-btn-primary text-xs">
            {t('radiologyWorkflow.new_request')}
          </a>
        </div>
      </SurfaceHero>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label={t('radiologyWorkflow.pending')} value={pending.length} tone="warning" icon="clock-o" />
        <StatCard label={t('radiologyWorkflow.in_progress')} value={inProgress.length} tone="brand" icon="spinner" />
        <StatCard label={t('radiologyWorkflow.completed')} value={completed.length} tone="brand" icon="check-circle" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {cols.map((col) => (
          <div key={col.key} className={`rounded-xl border-t-4 p-3 ${col.tone}`}>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-700">
              {col.title} ({col.rows.length})
            </h2>
            {!col.rows.length ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                {t('radiologyWorkflow.none')}
              </p>
            ) : (
              col.rows.map((r) => (
                <RadCard
                  key={r.id}
                  row={r}
                  column={col.key}
                  onStart={startExam}
                  onReset={resetExam}
                  onComplete={setCompleteRow}
                  t={t}
                />
              ))
            )}
          </div>
        ))}
      </div>

      <Modal
        open={!!completeRow}
        onClose={() => setCompleteRow(null)}
        title={t('radiologyWorkflow.complete_exam')}
        subtitle={
          completeRow
            ? `${completeRow.p_fn} ${completeRow.p_ln} · ${completeRow.exam_name || '—'}`
            : undefined
        }
        size="lg"
        footer={
          <>
            <ModalCancelButton onClick={() => setCompleteRow(null)} />
            <ModalSubmitButton form="rad-complete-form" label={t('radiologyWorkflow.save_complete')} icon="save" />
          </>
        }
      >
        <form id="rad-complete-form" onSubmit={submitComplete}>
          <label className="mb-1 block text-xs font-bold">{t('radiologyWorkflow.findings')}</label>
          <textarea className="hms-input mb-3 w-full" rows={4} value={findings} onChange={(e) => setFindings(e.target.value)} />
          <label className="mb-1 block text-xs font-bold">{t('radiologyWorkflow.conclusion_code')}</label>
          <input className="hms-input w-full" value={conclusion} onChange={(e) => setConclusion(e.target.value)} />
        </form>
      </Modal>
      </div>
    </div>
  );
}
