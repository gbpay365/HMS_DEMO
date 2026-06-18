import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { FilterChip } from '../components/FilterChip';
import { Pager } from '../components/Pager';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { StatusBadge } from '../components/StatusBadge';
import { useClientPagination } from '../hooks/useClientPagination';
import { hasPerm, inventoryStockStatusLabel, postForm } from '../lib/listUi';
import { confirmModal } from '../lib/modalBridge';
import { DEFAULT_PAGE_SIZE } from '../lib/pagination';

const VIEW_KEYS = [
  { id: 'overview', labelKey: 'pharmacy.tab_overview' },
  { id: 'products', labelKey: 'pharmacy.tab_products' },
  { id: 'dispensing', labelKey: 'pharmacy.tab_dispensing' },
  { id: 'prescriptions', labelKey: 'pharmacy.tab_prescriptions' },
];

const PHARMACY_RETURN = '/pharmacy?view=products';

function pharmacyStockStatus(qty, reorder, t) {
  const q = Number(qty) || 0;
  const r = Number(reorder) || 0;
  let variant = 'success';
  if (q <= 0) variant = 'cancelled';
  else if (q <= r) variant = 'pending';
  return { variant, label: inventoryStockStatusLabel(t, qty, reorder) };
}

function PharmacyQuickStockAdjust({ itemId, quantity, canWrite, t }) {
  const [delta, setDelta] = useState('');
  const qty = Number(quantity) || 0;

  if (!canWrite) {
    return <span className="font-bold tabular-nums">{qty}</span>;
  }

  const btnClass =
    'flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:border-brand hover:text-brand';

  return (
    <div className="flex flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      <span className="font-bold tabular-nums text-ink">{qty}</span>
      <div className="flex items-center gap-1">
        <form method="POST" action="/pharmacy/stock-adjust" className="inline">
          <input type="hidden" name="inventory_item_id" value={itemId} />
          <input type="hidden" name="quantity_delta" value="-1" />
          <input type="hidden" name="_return" value={PHARMACY_RETURN} />
          <button type="submit" className={btnClass} disabled={qty <= 0} title={t('pharmacy.adjust_minus')}>
            −
          </button>
        </form>
        <form method="POST" action="/pharmacy/stock-adjust" className="inline">
          <input type="hidden" name="inventory_item_id" value={itemId} />
          <input type="hidden" name="quantity_delta" value="1" />
          <input type="hidden" name="_return" value={PHARMACY_RETURN} />
          <button type="submit" className={btnClass} title={t('pharmacy.adjust_plus')}>
            +
          </button>
        </form>
        <form method="POST" action="/pharmacy/stock-adjust" className="inline-flex items-center gap-1">
          <input type="hidden" name="inventory_item_id" value={itemId} />
          <input type="hidden" name="_return" value={PHARMACY_RETURN} />
          <input
            type="number"
            name="quantity_delta"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="±"
            className="h-7 w-14 rounded-lg border border-slate-200 px-1.5 text-center text-xs font-semibold"
            title={t('pharmacy.adjust_custom_ph')}
          />
          <button
            type="submit"
            className="h-7 rounded-lg bg-slate-800 px-2 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-slate-900"
            title={t('pharmacy.adjust_apply')}
          >
            {t('pharmacy.adjust_apply')}
          </button>
        </form>
      </div>
    </div>
  );
}

function PharmacyReceiveStock({ itemId, canWrite, t }) {
  if (!canWrite) return null;
  return (
    <form
      method="POST"
      action="/pharmacy/stock-receive"
      className="mt-1 flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <input type="hidden" name="inventory_item_id" value={itemId} />
      <input type="hidden" name="_return" value={PHARMACY_RETURN} />
      <input
        type="number"
        name="quantity_add"
        min="1"
        placeholder={t('pharmacy.receive_qty_ph')}
        className="h-7 w-14 rounded-lg border border-slate-200 px-1.5 text-center text-xs"
        required
      />
      <button type="submit" className="h-7 rounded-lg bg-emerald-600 px-2 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-emerald-700">
        {t('pharmacy.receive_stock')}
      </button>
    </form>
  );
}

function PharmacyReorderLevel({ itemId, reorderLevel, canWrite, t }) {
  const level = Number(reorderLevel) || 0;
  if (!canWrite) {
    return <span className="tabular-nums text-slate-600">{level}</span>;
  }
  return (
    <form
      method="POST"
      action="/pharmacy/reorder-level"
      className="inline-flex items-center justify-end gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <input type="hidden" name="inventory_item_id" value={itemId} />
      <input type="hidden" name="_return" value={PHARMACY_RETURN} />
      <input
        type="number"
        name="reorder_level"
        min="0"
        defaultValue={level}
        className="h-7 w-16 rounded-lg border border-slate-200 px-1.5 text-right text-xs font-semibold"
      />
      <button type="submit" className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold uppercase tracking-wide text-slate-700 hover:border-brand hover:text-brand">
        {t('pharmacy.adjust_apply')}
      </button>
    </form>
  );
}

function catalogPrice(item) {
  const p = item.catalog_price != null ? item.catalog_price : item.unit_price;
  return Number(p || 0);
}

export function PharmacyPageApp({
  phaView = 'products',
  stats = {},
  inventory = [],
  queue = [],
  dispensed = [],
  pendingDispense = [],
  dispenseDay = '',
  dispenseMode = 'log',
  dispensedToday = 0,
  prescriptions = [],
  rxStats = {},
  userDisplayName = 'Pharmacist',
  userPerms = [],
  flash = null,
  error = null}) {
  const { t } = useTranslation('ops');
  const [view, setView] = useState(phaView);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [dayFilter, setDayFilter] = useState(dispenseDay || new Date().toISOString().slice(0, 10));
  const [dispMode, setDispMode] = useState(dispenseMode === 'pending' ? 'pending' : 'log');

  const canWrite = hasPerm(userPerms, ['pharmacy.write', '*']);

  const dispensingList =
    dispMode === 'pending' ? pendingDispense.length ? pendingDispense : queue : dispensed;

  const list =
    view === 'products'
      ? inventory
      : view === 'dispensing'
        ? dispensingList
        : view === 'prescriptions'
          ? prescriptions
          : [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || view === 'overview') return list;
    return list.filter((item) => {
      if (view === 'products') {
        return [item.name, item.sku, item.category, item.medicine_type_name, item.medicine_category_name]
          .join(' ')
          .toLowerCase()
          .includes(q);
      }
      if (view === 'dispensing') {
        return [
          item.medication_name,
          item.item_name,
          item.first_name,
          item.last_name,
          item.prescription_id,
          item.service_code,
          item.pharmacist_name,
        ]
          .join(' ')
          .toLowerCase()
          .includes(q);
      }
      return [item.title, item.first_name, item.last_name, item.status].join(' ').toLowerCase().includes(q);
    });
  }, [list, search, view]);

  const { setPage, pager, rows } = useClientPagination(filtered, {
    pageSize,
    resetKeys: [search, view, pageSize]});

  const quickLinks = [
    { href: '/pharmacy?view=products', labelKey: 'pharmacy.link_products' },
    { href: '/pharmacy?view=dispensing', labelKey: 'pharmacy.link_dispensing' },
    { href: '/pharmacy/validate', labelKey: 'pharmacy.link_validate' },
    { href: '/pharmacy/reporting/expiry', labelKey: 'pharmacy.link_expiry' },
  ];

  const viewTitle = t(VIEW_KEYS.find((v) => v.id === view)?.labelKey || 'pharmacy.tab_overview');

  return (
    <div className="page-wrapper hms-surface-module hms-ui">
      <FlashMessages flash={flash} error={error} />

      <SurfaceHero icon="medkit" title={viewTitle} subtitle={t('pharmacy.dashboard_subtitle')}>
        <div className="hms-surface-hero-actions mt-4">
          <a href="/pharmacy/validate" className="hms-btn-primary text-xs">
            {t('pharmacy.link_validate')}
          </a>
          <a href="/pharmacy/reporting" className="hms-btn-secondary text-xs">
            {t('pharmacy.link_reports')}
          </a>
        </div>
      </SurfaceHero>

      <div className="mb-4 flex flex-wrap gap-2">
        {VIEW_KEYS.map((v) => (
          <FilterChip
            key={v.id}
            active={view === v.id}
            onClick={() => {
              setView(v.id);
              setSearch('');
              window.history.replaceState(null, '', v.id === 'overview' ? '/pharmacy?view=overview' : `/pharmacy?view=${v.id}`);
            }}
          >
            {t(v.labelKey)}
          </FilterChip>
        ))}
      </div>

      {view === 'overview' ? (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label={t('pharmacy.kpi_products')} value={stats.total || 0} />
            <StatCard label={t('pharmacy.kpi_pending')} value={pendingDispense.length || queue.length} tone="warning" />
            <StatCard label={t('pharmacy.kpi_dispensed_today')} value={dispensedToday} tone="brand" />
            <StatCard label={t('pharmacy.kpi_out_stock')} value={stats.out_stock || 0} tone="danger" />
            <StatCard label={t('pharmacy.kpi_active_rx')} value={rxStats.active || 0} />
            <StatCard label={t('pharmacy.kpi_rx_today')} value={rxStats.today || 0} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickLinks.map((l) => (
              <a key={l.href} href={l.href} className="rounded-2xl border border-slate-100 bg-white p-4 font-semibold text-brand shadow-card hover:bg-brand/5">
                {t(l.labelKey)} →
              </a>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchField value={search} onChange={(ev) => setSearch(ev.target.value)} placeholder={t('shared.search')} />
            <div className="flex flex-wrap items-center gap-2">
              {view === 'products' ? (
                <>
                  <a href="/catalog" className="hms-btn-secondary text-xs">
                    {t('pharmacy.link_catalog_prices')}
                  </a>
                  {canWrite ? (
                    <button
                      type="button"
                      className="hms-btn-primary text-xs"
                      onClick={async () => {
                        const ok = await confirmModal({
                          title: t('pharmacy.sync_inventory'),
                          message: t('pharmacy.sync_inventory_confirm'),
                          confirmLabel: t('pharmacy.sync_inventory')});
                        if (ok) postForm('/pharmacy/sync-inventory');
                      }}
                    >
                      {t('pharmacy.sync_inventory')}
                    </button>
                  ) : null}
                </>
              ) : null}
              {view === 'dispensing' ? (
                <>
                  <div className="flex rounded-full border border-slate-200 bg-white p-0.5 text-xs font-semibold">
                    <a
                      href={`/pharmacy?view=dispensing&day=${encodeURIComponent(dayFilter)}&dispense=log`}
                      className={`rounded-full px-3 py-1.5 ${dispMode === 'log' ? 'bg-brand text-white' : 'text-slate-600'}`}
                      onClick={(ev) => {
                        if (!ev.metaKey && !ev.ctrlKey) {
                          ev.preventDefault();
                          setDispMode('log');
                          setSearch('');
                        }
                      }}
                    >
                      {t('pharmacy.dispense_log')}
                    </a>
                    <a
                      href="/pharmacy?view=dispensing&dispense=pending"
                      className={`rounded-full px-3 py-1.5 ${dispMode === 'pending' ? 'bg-amber-500 text-white' : 'text-slate-600'}`}
                      onClick={(ev) => {
                        if (!ev.metaKey && !ev.ctrlKey) {
                          ev.preventDefault();
                          setDispMode('pending');
                          setSearch('');
                        }
                      }}
                    >
                      {t('pharmacy.dispense_pending')} ({pendingDispense.length || queue.length})
                    </a>
                  </div>
                  {dispMode === 'log' ? (
                    <form
                      className="flex items-center gap-1"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        window.location.href = `/pharmacy?view=dispensing&day=${encodeURIComponent(dayFilter)}&dispense=log`;
                      }}
                    >
                      <input
                        type="date"
                        value={dayFilter}
                        onChange={(ev) => setDayFilter(ev.target.value)}
                        className="hms-input h-9 text-xs"
                      />
                      <button type="submit" className="hms-btn-secondary text-xs">
                        {t('pharmacy.dispense_go_day')}
                      </button>
                    </form>
                  ) : null}
                  <a href="/pharmacy/validate" className="hms-btn-primary text-xs">
                    {t('pharmacy.validate_code')}
                  </a>
                </>
              ) : null}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {view === 'products' ? (
                    <tr>
                      <th className="px-4 py-3">{t('pharmacy.col_sku')}</th>
                      <th className="px-4 py-3">{t('pharmacy.col_product')}</th>
                      <th className="px-4 py-3">{t('pharmacy.col_category')}</th>
                      <th className="px-4 py-3 text-right">{t('pharmacy.col_price')}</th>
                      <th className="px-4 py-3 text-right">{t('pharmacy.col_on_hand')}</th>
                      <th className="px-4 py-3 text-right">{t('pharmacy.col_reorder')}</th>
                      <th className="px-4 py-3">{t('shared.status')}</th>
                      <th className="px-4 py-3 text-right">{t('shared.action')}</th>
                    </tr>
                  ) : view === 'dispensing' ? (
                    <tr>
                      <th className="px-4 py-3">{dispMode === 'pending' ? t('pharmacy.col_code') : t('pharmacy.col_dispensed_at')}</th>
                      <th className="px-4 py-3">{t('shared.patient')}</th>
                      <th className="px-4 py-3">{t('pharmacy.col_medication')}</th>
                      <th className="px-4 py-3 text-right">{t('pharmacy.col_qty')}</th>
                      <th className="px-4 py-3">{t('pharmacy.col_pharmacist')}</th>
                      <th className="px-4 py-3">{t('shared.status')}</th>
                      <th className="px-4 py-3 text-right">{t('shared.action')}</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="px-4 py-3">{t('pharmacy.col_rx_num')}</th>
                      <th className="px-4 py-3">{t('shared.patient')}</th>
                      <th className="px-4 py-3">{t('pharmacy.col_title')}</th>
                      <th className="px-4 py-3">{t('shared.status')}</th>
                      <th className="px-4 py-3 text-right">{t('shared.action')}</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={view === 'products' ? 8 : view === 'dispensing' ? 7 : 6} className="px-4 py-10 text-center text-sm text-slate-500">
                        {view === 'dispensing' && dispMode === 'log'
                          ? t('pharmacy.empty_dispensed')
                          : t('pharmacy.empty')}
                      </td>
                    </tr>
                  ) : view === 'products' ? (
                    rows.map((item) => {
                      const qty = Number(item.quantity) || 0;
                      const st = pharmacyStockStatus(qty, item.reorder_level, t);
                      const exp = expiryState(item.expiry_date);
                      const price = catalogPrice(item);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-mono text-xs">{item.sku}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-ink">{item.name}</div>
                            {exp ? (
                              <div className={`text-xs ${exp === 'expired' ? 'text-red-600' : 'text-amber-600'}`}>
                                {exp === 'expired' ? t('pharmacy.expired') : t('pharmacy.expiring_soon')} · {String(item.expiry_date).slice(0, 10)}
                              </div>
                            ) : null}
                            <PharmacyReceiveStock itemId={item.id} canWrite={canWrite} t={t} />
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{item.category || item.medicine_category_name || t('pharmacy.general')}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="font-semibold tabular-nums">{price.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA</div>
                            <div className="text-[10px] text-slate-400">{t('pharmacy.price_catalog_hint')}</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <PharmacyQuickStockAdjust itemId={item.id} quantity={qty} canWrite={canWrite} t={t} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <PharmacyReorderLevel itemId={item.id} reorderLevel={item.reorder_level} canWrite={canWrite} t={t} />
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge variant={st.variant} label={st.label} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <a
                              href={`/pharmacy/products/${item.id}/movements`}
                              className="hms-btn-secondary px-3 py-1.5 text-xs"
                            >
                              {t('pharmacy.view_movements')}
                            </a>
                          </td>
                        </tr>
                      );
                    })
                  ) : view === 'dispensing' ? (
                    rows.map((q) => {
                      const isPending = dispMode === 'pending';
                      const medName = q.item_name || q.medication_name || '—';
                      const servedAt = q.served_at ? new Date(q.served_at) : null;
                      const code = q.service_code || (q.prescription_id ? `RX-${q.prescription_id}-${q.id}` : `#${q.id}`);
                      return (
                        <tr key={`${isPending ? 'p' : 'd'}-${q.id}`} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-mono text-xs">
                            {isPending ? (
                              <code className="rounded bg-slate-100 px-1.5 py-0.5">{code}</code>
                            ) : (
                              <div>
                                <div className="font-semibold text-slate-800">
                                  {servedAt
                                    ? servedAt.toLocaleString(undefined, {
                                        day: '2-digit',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit'})
                                    : '—'}
                                </div>
                                {q.service_code ? (
                                  <code className="mt-0.5 inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800">
                                    {q.service_code}
                                  </code>
                                ) : null}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {q.first_name} {q.last_name}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold">{medName}</div>
                            {q.served_notes ? <div className="text-xs text-slate-500">{q.served_notes}</div> : null}
                            {!isPending && [q.medication_dose, q.medication_route].filter(Boolean).length ? (
                              <div className="text-xs text-slate-500">
                                {[q.medication_dose, q.medication_route].filter(Boolean).join(' ')}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums">{q.quantity != null ? q.quantity : '—'}</td>
                          <td className="px-4 py-3 text-xs">{q.pharmacist_name || (isPending ? '—' : userDisplayName)}</td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              variant={isPending ? 'pending' : 'success'}
                              label={isPending ? t('pharmacy.status_awaiting') : t('pharmacy.status_dispensed')}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isPending ? (
                              q.service_code ? (
                                <a href={`/pharmacy/validate/${encodeURIComponent(q.service_code)}`} className="hms-btn-primary px-3 py-1.5 text-xs">
                                  {t('pharmacy.open_validate')}
                                </a>
                              ) : (
                                <a href="/pharmacy/validate" className="hms-btn-secondary px-3 py-1.5 text-xs">
                                  {t('pharmacy.validate_code')}
                                </a>
                              )
                            ) : q.service_code ? (
                              <a href={`/pharmacy/validate/${encodeURIComponent(q.service_code)}`} className="hms-btn-secondary px-3 py-1.5 text-xs">
                                {t('shared.open')}
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-mono text-xs">#{r.id}</td>
                        <td className="px-4 py-3">
                          {r.first_name} {r.last_name}
                        </td>
                        <td className="px-4 py-3">{r.title || t('pharmacy.prescription')}</td>
                        <td className="px-4 py-3">
                          <StatusBadge variant="info" label={t('pharmacy.status_active')} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a href={`/prescriptions/${r.id}`} className="hms-btn-secondary px-3 py-1.5 text-xs">
                            {t('shared.open')}
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pager pager={pager} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </div>
        </>
      )}
    </div>
  );
}

function expiryState(exp) {
  if (!exp) return '';
  const d = String(exp).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (d < today) return 'expired';
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  if (d <= soon.toISOString().slice(0, 10)) return 'soon';
  return '';
}
