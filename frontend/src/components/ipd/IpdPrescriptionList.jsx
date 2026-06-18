import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IpdPrescriptionEditPanel } from './IpdPrescriptionEditPanel';

function drugTypeIcon(drugType) {
  const t = String(drugType || 'tablet').toLowerCase();
  if (t.includes('inject') || t.includes('iv') || t.includes('im')) return 'fa-medkit';
  if (t.includes('syrup') || t.includes('liquid')) return 'fa-tint';
  if (t.includes('cream') || t.includes('oint')) return 'fa-hand-paper-o';
  return 'fa-flask';
}

export function IpdPrescriptionList({
  prescriptions = [],
  canEdit = false,
  inventory = [],
  treatmentActive = true,
  routePrefix = '/ipd'}) {
  const { t } = useTranslation('ipd');
  const [selectedId, setSelectedId] = useState(null);
  const selected = prescriptions.find((r) => r.id === selectedId) || null;
  const editable = canEdit && treatmentActive;

  if (!prescriptions.length) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 px-6 py-10 text-center">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-2xl text-indigo-500">
          <i className="fa fa-medkit" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-indigo-900">{t('pages.no_prescriptions')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm">
      <div className="grid gap-0 lg:grid-cols-12">
        <div
          className={`divide-y divide-indigo-50 ${selected ? 'lg:col-span-5' : 'lg:col-span-12'} max-h-[22rem] overflow-y-auto`}
        >
          {prescriptions.map((rx) => {
            const locked = Number(rx.locked) === 1;
            const isSelected = selectedId === rx.id;
            const given = Number(rx.slots_given) || 0;
            const total = Number(rx.slots_total) || 0;
            const pct = total > 0 ? Math.min(100, Math.round((given / total) * 100)) : 0;

            return (
              <button
                key={rx.id}
                type="button"
                onClick={() => setSelectedId(isSelected ? null : rx.id)}
                className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition ${
                  isSelected
                    ? 'bg-gradient-to-r from-indigo-50 to-violet-50 ring-2 ring-inset ring-indigo-400'
                    : 'bg-white hover:bg-indigo-50/40'
                } ${locked ? 'opacity-85' : ''}`}
              >
                <span
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm ${
                    locked
                      ? 'bg-gradient-to-br from-slate-400 to-slate-500'
                      : 'bg-gradient-to-br from-indigo-500 to-violet-600'
                  }`}
                >
                  <i className={`fa ${drugTypeIcon(rx.drug_type)}`} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-900">{rx.drug_name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-slate-600">
                    <i className="fa fa-tint text-xs text-sky-500" aria-hidden="true" />
                    {rx.dosage}
                    <span className="text-slate-300">·</span>
                    <i className="fa fa-exchange text-xs text-violet-500" aria-hidden="true" />
                    {rx.route || 'oral'}
                    <span className="text-slate-300">·</span>
                    {rx.frequency_label || 'TDS'}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                      <i className="fa fa-calendar-o" aria-hidden="true" />
                      {t('treatment.duration_days', { count: rx.duration_days || 1 })}
                    </span>
                    {locked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-slate-600">
                        <i className="fa fa-lock" aria-hidden="true" />
                        {t('treatment.locked')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-800">
                        <i className="fa fa-check-circle" aria-hidden="true" />
                        {t('treatment.doses_progress', { given, total })}
                      </span>
                    )}
                  </div>
                  {!locked && total > 0 ? (
                    <div className="mt-2 h-1.5 max-w-[10rem] overflow-hidden rounded-full bg-indigo-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : null}
                  {rx.notes ? (
                    <p className="mt-1 truncate text-xs italic text-slate-500">
                      <i className="fa fa-sticky-note-o mr-1" aria-hidden="true" />
                      {rx.notes}
                    </p>
                  ) : null}
                </div>
                <i
                  className={`fa fa-chevron-right mt-2 shrink-0 text-xs ${isSelected ? 'text-indigo-600' : 'text-slate-300'}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        {selected ? (
          <div className="border-t border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-violet-50/40 p-4 lg:col-span-7 lg:max-h-[22rem] lg:overflow-y-auto lg:border-l lg:border-t-0">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-start gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm text-white">
                  <i className="fa fa-pencil" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{t('treatment.edit_rx')}</h3>
                  <p className="text-xs text-slate-500">{selected.drug_name}</p>
                </div>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600"
                onClick={() => setSelectedId(null)}
              >
                <i className="fa fa-times" aria-hidden="true" />
                {t('treatment.close_panel')}
              </button>
            </div>
            {editable ? (
              <IpdPrescriptionEditPanel rx={selected} canEdit={editable} inventory={inventory} compact routePrefix={routePrefix} />
            ) : (
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <i className="fa fa-lock text-amber-600" aria-hidden="true" />
                {t('treatment.line_locked_terminated')}
              </p>
            )}
          </div>
        ) : (
          <div className="hidden border-t border-indigo-100 px-4 py-10 text-center lg:col-span-7 lg:block lg:border-l lg:border-t-0">
            <i className="fa fa-hand-pointer-o mb-2 text-2xl text-indigo-300" aria-hidden="true" />
            <p className="text-xs text-slate-400">{t('treatment.select_rx_hint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
