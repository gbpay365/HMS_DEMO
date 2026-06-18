import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';

function fmtDt(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'});
  } catch {
    return String(value);
  }
}

function statusTone(st) {
  const s = String(st || 'pending').toLowerCase();
  if (s === 'ready' || s === 'fulfilled') return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
  if (s === 'preparing') return 'bg-sky-100 text-sky-800 ring-sky-200';
  if (s === 'cancelled') return 'bg-slate-100 text-slate-600 ring-slate-200';
  return 'bg-amber-100 text-amber-900 ring-amber-200';
}

function emptyLine() {
  return { inventory_item_id: '', quantity: '', remarks: '' };
}

export function NursingSupplyRequestsPageApp({
  requests = [],
  inventoryItems = [],
  context = {},
  flash = null,
  error = null}) {
  const { t } = useTranslation('ipd');
  const [lines, setLines] = useState([emptyLine()]);

  const defaultNotes = useMemo(() => {
    const bits = [];
    if (context.ward_name) bits.push(`${t('supply.ward')}: ${context.ward_name}`);
    if (context.patient_label) bits.push(`${t('supply.patient')}: ${context.patient_label}`);
    if (context.admission_id) bits.push(`${t('supply.admission')}: #${context.admission_id}`);
    return bits.join(' · ');
  }, [context, t]);

  const updateLine = (idx, key, val) => {
    setLines((prev) => prev.map((ln, i) => (i === idx ? { ...ln, [key]: val } : ln)));
  };

  const stockFor = (id) => inventoryItems.find((it) => String(it.id) === String(id));

  const pendingCount = useMemo(
    () => requests.filter((r) => !['fulfilled', 'cancelled', 'ready'].includes(String(r.status || '').toLowerCase())).length,
    [requests]
  );

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="medkit" badge={t('supply.station_label')} title={t('supply.title')} subtitle={t('supply.subtitle')}>
          <div className="hms-surface-hero-actions mt-4">
            <a href="/wards" className="hms-btn-secondary text-xs">
              <i className="fa fa-th-large mr-1" aria-hidden="true" />
              {t('wards.title')}
            </a>
            <a href="/ipd/handover" className="hms-btn-secondary text-xs">
              <i className="fa fa-exchange mr-1" aria-hidden="true" />
              {t('handover.short_label')}
            </a>
            <a href="/ipd" className="hms-btn-secondary text-xs">
              {t('hub.title')}
            </a>
          </div>
        </SurfaceHero>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard label={t('supply.stat_requests')} value={requests.length} tone="brand" icon="history" />
          <StatCard label={t('supply.stat_catalog')} value={inventoryItems.length} tone="default" icon="cube" />
          <StatCard label={t('supply.stat_pending')} value={pendingCount} tone="warning" icon="clock" />
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {!inventoryItems.length ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <strong>{t('supply.no_stock_title')}</strong> {t('supply.no_stock_body')}{' '}
                <a href="/inventory" className="font-bold underline">
                  {t('supply.inventory_link')}
                </a>
              </div>
            ) : (
              <form method="POST" action="/nursing/supply-requests" className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
                <h2 className="mb-3 font-extrabold text-ink">
                  <i className="fa fa-plus-circle mr-1 text-orange-600" aria-hidden="true" />
                  {t('supply.new_request')}
                </h2>

                {context.patient_label || context.ward_name ? (
                  <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                    <i className="fa fa-user mr-1" aria-hidden="true" />
                    {context.patient_label || '—'}
                    {context.ward_name ? ` · ${context.ward_name}` : ''}
                  </div>
                ) : null}

                <input type="hidden" name="admission_id" value={context.admission_id || ''} />
                <input type="hidden" name="ward_name" value={context.ward_name || ''} />
                <input type="hidden" name="patient_label" value={context.patient_label || ''} />

                <div className="mb-4">
                  <label className="hms-label" htmlFor="supply-notes">
                    {t('supply.notes_label')}
                  </label>
                  <textarea
                    id="supply-notes"
                    name="notes"
                    className="hms-input w-full text-sm"
                    rows={2}
                    maxLength={2000}
                    defaultValue={defaultNotes}
                    placeholder={t('supply.notes_ph')}
                  />
                </div>

                <p className="mb-2 text-xs text-slate-500">{t('supply.lines_hint')}</p>
                <div className="space-y-3">
                  {lines.map((ln, idx) => {
                    const stock = stockFor(ln.inventory_item_id);
                    return (
                      <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                        <div className="grid gap-2 sm:grid-cols-12">
                          <div className="sm:col-span-6">
                            <label className="hms-label text-[10px]">{t('supply.item_label')}</label>
                            <select
                              className="hms-input text-sm"
                              name="inventory_item_id"
                              value={ln.inventory_item_id}
                              onChange={(ev) => updateLine(idx, 'inventory_item_id', ev.target.value)}
                              required={idx === 0}
                            >
                              <option value="">{t('supply.select_item')}</option>
                              {inventoryItems.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="hms-label text-[10px]">{t('supply.qty_label')}</label>
                            <input
                              className="hms-input text-sm"
                              name="quantity"
                              value={ln.quantity}
                              onChange={(ev) => updateLine(idx, 'quantity', ev.target.value)}
                              placeholder="2"
                              required={!!ln.inventory_item_id}
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="hms-label text-[10px]">{t('supply.stock_label')}</label>
                            <div className="hms-input flex items-center bg-white text-xs text-slate-500">
                              {stock ? (
                                <>
                                  <span
                                    className={`mr-1.5 h-2 w-2 rounded-full ${
                                      stock.qty <= 0 ? 'bg-red-500' : stock.stockLabel === 'Low stock' ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                  />
                                  {stock.qty} {t('supply.units')}
                                </>
                              ) : (
                                '—'
                              )}
                            </div>
                          </div>
                          <div className="flex items-end sm:col-span-1">
                            {lines.length > 1 ? (
                              <button
                                type="button"
                                className="hms-btn-secondary w-full px-2 text-xs"
                                onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                          <div className="sm:col-span-12">
                            <input
                              className="hms-input text-sm"
                              name="remarks"
                              value={ln.remarks}
                              onChange={(ev) => updateLine(idx, 'remarks', ev.target.value)}
                              placeholder={t('supply.remarks_ph')}
                            />
                          </div>
                        </div>
                        {stock?.line_type ? (
                          <div className="mt-1 text-[10px] font-bold uppercase text-slate-400">
                            {stock.line_type === 'drug' ? t('supply.type_drug') : t('supply.type_material')}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="hms-btn-secondary text-xs" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
                    <i className="fa fa-plus mr-1" aria-hidden="true" />
                    {t('supply.add_line')}
                  </button>
                  <button type="submit" className="hms-btn-primary">
                    <i className="fa fa-paper-plane mr-1" aria-hidden="true" />
                    {t('supply.send')}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-slate-100 bg-white shadow-card">
              <div className="border-b border-slate-100 px-4 py-3 font-bold text-ink">
                <i className="fa fa-history mr-1 text-slate-400" aria-hidden="true" />
                {t('supply.recent_title')}
              </div>
              <div className="max-h-[640px] space-y-2 overflow-y-auto p-3">
                {!requests.length ? (
                  <p className="py-8 text-center text-sm text-slate-400">{t('supply.no_requests')}</p>
                ) : (
                  requests.map((r) => (
                    <div key={r.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-extrabold text-ink">#{r.id}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset ${statusTone(r.status)}`}>
                          {r.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500">{fmtDt(r.created_at)}</div>
                      {r.patient_label || r.ward_name ? (
                        <div className="mt-1 text-xs text-orange-800">
                          {r.patient_label || ''}
                          {r.ward_name ? ` · ${r.ward_name}` : ''}
                        </div>
                      ) : null}
                      {r.lines?.length ? (
                        <ul className="mt-2 space-y-1 text-xs text-slate-600">
                          {r.lines.slice(0, 4).map((ln) => (
                            <li key={ln.id}>
                              <i className="fa fa-cube mr-1 opacity-50" aria-hidden="true" />
                              {ln.item_name} × {ln.quantity || '—'}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
