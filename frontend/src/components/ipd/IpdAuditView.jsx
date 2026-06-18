import { useTranslation } from 'react-i18next';
import { formatDate } from '../../lib/listUi';

function auditActionClass(action) {
  const a = String(action || '').toLowerCase();
  if (a.includes('delete') || a.includes('discontinued') || a.includes('miss') || a.includes('dose_slot_delete')) {
    return 'border-red-200 bg-red-50 text-red-900';
  }
  if (a.includes('add') || a.includes('extend') || a.includes('administer') || a.includes('dose_administered')) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  }
  if (
    a.includes('shorten') ||
    a.includes('labels') ||
    a.includes('replace') ||
    a.includes('update') ||
    a.includes('dose_slot')
  ) {
    return 'border-amber-200 bg-amber-50 text-amber-900';
  }
  if (a.includes('terminate')) return 'border-red-300 bg-red-100 text-red-950';
  if (a.includes('administer') || a.includes('given')) return 'border-emerald-300 bg-emerald-100 text-emerald-950';
  return 'border-slate-200 bg-white text-slate-800';
}

function parseDetail(raw) {
  if (!raw) return '';
  if (typeof raw === 'object') return JSON.stringify(raw, null, 0).slice(0, 400);
  try {
    const j = JSON.parse(raw);
    return JSON.stringify(j, null, 0).slice(0, 400);
  } catch {
    return String(raw).slice(0, 400);
  }
}

function fmtSlotTime(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(val);
  }
}

export function IpdAuditView({ admission = {}, treatments = [], auditByTx = {}, medAudit = [] }) {
  const { t } = useTranslation('ipd');

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">{t('treatment.audit_title')}</h1>
          <p className="text-sm text-slate-500">
            {admission.first_name} {admission.last_name} · #{admission.id}
          </p>
        </div>
        <a href={`/ipd/treatment/${admission.id}`} className="hms-btn hms-btn-secondary text-sm">
          {t('shared.treatment')}
        </a>
      </div>

      <div className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold">{t('treatment.audit_events')}</h2>
        {!medAudit.length ? (
          <p className="text-sm text-slate-400">{t('shared.no_records')}</p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {medAudit.map((row) => (
              <div
                key={row.id}
                className={`rounded-lg border px-3 py-2 text-sm ${auditActionClass(row.action)}`}
              >
                <div className="flex flex-wrap justify-between gap-2 font-bold">
                  <span>{row.action}</span>
                  <span className="text-xs font-normal opacity-80">
                    {row.created_at ? formatDate(row.created_at) : ''}
                    {row.actor_name ? ` · ${row.actor_name}` : ''}
                  </span>
                </div>
                {row.detail ? <div className="mt-1 text-xs opacity-90">{parseDetail(row.detail)}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {treatments.map((tx) => {
        const bundle = auditByTx[tx.id] || { prescriptions: [], slots: [] };
        const { prescriptions = [], slots = [] } = bundle;
        return (
          <div key={tx.id} className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">
                {tx.diagnosis} · {tx.status}
              </h2>
              <span className="text-xs text-slate-500">
                {tx.start_date ? formatDate(tx.start_date) : '—'}
              </span>
            </div>

            {prescriptions.length ? (
              <div className="mb-4">
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">{t('pages.prescriptions', { count: prescriptions.length })}</h3>
                <div className="space-y-1">
                  {prescriptions.map((rx) => (
                    <div
                      key={rx.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        Number(rx.locked) ? 'border-slate-300 bg-slate-100 line-through opacity-75' : 'border-slate-200'
                      }`}
                    >
                      <span className="font-semibold">{rx.drug_name}</span> — {rx.dosage} · {rx.frequency_label} ·{' '}
                      {t('treatment.duration_days', { count: rx.duration_days })}
                      <span className="ml-2 text-xs text-slate-500">
                        ({rx.slots_given}/{rx.slots_total} {t('treatment.given').toLowerCase()})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {slots.length ? (
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">{t('treatment.admin_protocol')}</h3>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {slots.map((slot) => (
                    <div
                      key={slot.id}
                      className={`rounded border px-2 py-1 text-xs ${
                        slot.administered
                          ? 'border-emerald-300 bg-emerald-50'
                          : slot.missed_reason
                            ? 'border-red-300 bg-red-50 line-through'
                            : slot.hidden_on_terminate
                              ? 'border-slate-200 bg-slate-50 opacity-60'
                              : 'border-amber-200'
                      }`}
                    >
                      {fmtSlotTime(slot.scheduled_at)} · {slot.drug_name} {slot.dosage}
                      {slot.administered ? ` · ${t('treatment.given')}` : ''}
                      {slot.missed_reason ? ` · ${slot.missed_reason}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
