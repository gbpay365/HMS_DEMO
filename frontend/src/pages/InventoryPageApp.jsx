import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionMenu } from '../components/ActionMenu';
import { FlashMessages } from '../components/FlashMessages';
import { Pager } from '../components/Pager';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { SurfaceHero } from '../components/SurfaceHero';
import { hasPerm, inventoryStockStatusLabel } from '../lib/listUi';
import { confirmModal } from '../lib/modalBridge';
import { AddInventorySkuModal } from '../modals/AddInventorySkuModal';

function postAction(url) {
  const f = document.createElement('form');
  f.method = 'POST';
  f.action = url;
  document.body.appendChild(f);
  f.submit();
}

function QuickStockAdjust({ itemId, quantity, returnUrl, canWrite, t }) {
  const [delta, setDelta] = useState('');
  const qty = Number(quantity) || 0;

  if (!canWrite) {
    return <span className="font-semibold tabular-nums">{qty}</span>;
  }

  const btnClass =
    'flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:border-brand hover:text-brand';

  return (
    <div className="flex flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      <span className="font-semibold tabular-nums text-ink">{qty}</span>
      <div className="flex items-center gap-1">
        <form method="POST" action="/inventory/adjust-stock" className="inline">
          <input type="hidden" name="inventory_item_id" value={itemId} />
          <input type="hidden" name="quantity_delta" value="-1" />
          <input type="hidden" name="_return" value={returnUrl} />
          <button type="submit" className={btnClass} disabled={qty <= 0} title={t('inventory.adjust_minus')}>
            −
          </button>
        </form>
        <form method="POST" action="/inventory/adjust-stock" className="inline">
          <input type="hidden" name="inventory_item_id" value={itemId} />
          <input type="hidden" name="quantity_delta" value="1" />
          <input type="hidden" name="_return" value={returnUrl} />
          <button type="submit" className={btnClass} title={t('inventory.adjust_plus')}>
            +
          </button>
        </form>
        <form method="POST" action="/inventory/adjust-stock" className="inline-flex items-center gap-1">
          <input type="hidden" name="inventory_item_id" value={itemId} />
          <input type="hidden" name="_return" value={returnUrl} />
          <input
            type="number"
            name="quantity_delta"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="±"
            className="h-7 w-14 rounded-lg border border-slate-200 px-1.5 text-center text-xs font-semibold"
            title={t('inventory.adjust_custom_ph')}
          />
          <button
            type="submit"
            className="h-7 rounded-lg bg-slate-800 px-2 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-slate-900"
            title={t('inventory.adjust_apply')}
          >
            {t('inventory.adjust_apply')}
          </button>
        </form>
      </div>
    </div>
  );
}

function inventoryStockStatus(qty, reorder, t) {
  const st = { variant: 'success' };
  const q = Number(qty) || 0;
  const r = Number(reorder) || 0;
  if (q === 0) st.variant = 'cancelled';
  else if (q <= r) st.variant = 'pending';
  return { ...st, label: inventoryStockStatusLabel(t, qty, reorder) };
}

export function InventoryPageApp({
  stats = {},
  items = [],
  alerts = [],
  invCategories = [],
  pager = null,
  searchQ = '',
  flash = null,
  error = null,
  userPerms = []}) {
  const { t } = useTranslation('ops');
  const [search, setSearch] = useState(searchQ || '');
  const [addOpen, setAddOpen] = useState(false);

  const canWrite = hasPerm(userPerms, ['inventory.write', 'pharmacy.write', '*']);
  const query = search.trim() ? { q: search.trim() } : {};
  const returnUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/inventory';
    return window.location.pathname + window.location.search;
  }, []);

  const menuFor = (item) => {
    const menuItems = [];
    if (hasPerm(userPerms, ['inventory.read', 'pharmacy.read'])) {
      menuItems.push({
        href: `/inventory/item/${item.id}/movements`,
        label: t('inventory.view_movements'),
        icon: <span className="text-brand">📋</span>});
      menuItems.push({
        href: `/inventory/item/${item.id}/movements?reason=dispense`,
        label: t('inventory.view_dispense_history'),
        icon: <span className="text-rose-500">💊</span>});
    }
    if (hasPerm(userPerms, ['procurement.write', 'inventory.write']) && Number(item.quantity) <= Number(item.reorder_level || 0)) {
      menuItems.push({
        href: '/procurement/rfq',
        label: t('inventory.request_restock'),
        icon: <span className="text-amber-600">📦</span>});
    }
    return menuItems;
  };

  const onSearch = (e) => {
    e.preventDefault();
    const q = search.trim();
    window.location.href = q ? `/inventory?q=${encodeURIComponent(q)}` : '/inventory';
  };

  const confirmImportCatalog = async () => {
    const ok = await confirmModal({
      title: t('inventory.import_catalog'),
      message: t('inventory.import_catalog_confirm'),
      confirmLabel: t('inventory.import_catalog')});
    if (ok) postAction('/inventory/import-pharmacy-catalog');
  };

  const confirmApplyStockSheet = async () => {
    const ok = await confirmModal({
      title: t('inventory.apply_stock_sheet'),
      message: t('inventory.apply_stock_confirm'),
      confirmLabel: t('inventory.apply_stock_sheet'),
      tone: 'danger'});
    if (ok) postAction('/inventory/apply-pharmacy-stock-sheet');
  };

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero
          icon="fa-archive"
          badge={t('inventory.badge')}
          title={t('inventory.title')}
          subtitle={t('inventory.subtitle')}
        >
          {canWrite ? (
            <div className="hms-surface-hero-actions mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="hms-btn-secondary text-xs"
                onClick={confirmImportCatalog}
              >
                <i className="fa fa-download mr-1" aria-hidden="true" />
                {t('inventory.import_catalog')}
              </button>
              <button
                type="button"
                className="hms-btn-secondary text-xs"
                onClick={confirmApplyStockSheet}
              >
                <i className="fa fa-file-excel-o mr-1" aria-hidden="true" />
                {t('inventory.apply_stock_sheet')}
              </button>
              <button type="button" className="hms-btn-primary text-xs" onClick={() => setAddOpen(true)}>
                <i className="fa fa-plus mr-1" aria-hidden="true" />
                {t('inventory.add_sku')}
              </button>
            </div>
          ) : null}
        </SurfaceHero>

        <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t('inventory.stat_skus')}
            value={stats.total_skus || 0}
            hint={t('inventory.stat_skus_hint')}
            icon="fa-cubes"
          />
          <StatCard
            label={t('inventory.stat_units')}
            value={stats.total_units || 0}
            hint={t('inventory.stat_units_hint')}
            tone="brand"
            icon="fa-cube"
          />
          <StatCard
            label={t('inventory.stat_low')}
            value={stats.low_stock || 0}
            hint={t('inventory.stat_low_hint')}
            tone="warning"
            icon="fa-exclamation-triangle"
          />
          <StatCard
            label={t('inventory.stat_out')}
            value={stats.out_stock || 0}
            hint={t('inventory.stat_out_hint')}
            tone="danger"
            icon="fa-ban"
          />
        </div>

        {alerts.length > 0 ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 hms-surface-card">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-amber-900">
                <i className="fa fa-bell mr-1" aria-hidden="true" />
                {t('inventory.alerts_title')}
              </h3>
              {hasPerm(userPerms, ['procurement.write', 'inventory.write']) ? (
                <a href="/procurement/rfq" className="text-xs font-bold text-amber-800 underline">
                  {t('inventory.start_rfq')}
                </a>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {alerts.map((a) => (
                <a
                  key={a.id}
                  href={`/inventory/item/${a.id}/movements`}
                  className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:border-amber-400"
                >
                  {t('inventory.alerts_left', { name: a.name, qty: a.quantity })}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mb-4 hms-surface-card rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <SearchField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('inventory.search_ph')}
            onSubmit={onSearch}
          />
        </div>

        <div className="hms-surface-card overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('inventory.col_sku')}</th>
                  <th className="px-4 py-3">{t('inventory.col_product')}</th>
                  <th className="px-4 py-3">{t('inventory.col_category')}</th>
                  <th className="px-4 py-3 text-right">{t('inventory.col_qty')}</th>
                  <th className="px-4 py-3 text-right">{t('inventory.col_reorder')}</th>
                  <th className="px-4 py-3">{t('inventory.col_status')}</th>
                  <th className="px-4 py-3 text-right">{t('inventory.col_action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      {t('inventory.empty')}
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const st = inventoryStockStatus(item.quantity, item.reorder_level, t);
                    const menu = menuFor(item);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-semibold text-brand">{item.sku}</td>
                        <td className="px-4 py-3 font-medium text-ink">{item.name}</td>
                        <td className="px-4 py-3 text-slate-600">{item.cat_name || item.category || t('inventory.general')}</td>
                        <td className="px-4 py-3 text-right">
                          <QuickStockAdjust
                            itemId={item.id}
                            quantity={item.quantity}
                            returnUrl={returnUrl}
                            canWrite={canWrite}
                            t={t}
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">{item.reorder_level}</td>
                        <td className="px-4 py-3">
                          <StatusBadge variant={st.variant} label={st.label} />
                        </td>
                        <td className="px-4 py-3 text-right">{menu.length ? <ActionMenu items={menu} /> : null}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pager pager={pager} basePath="/inventory" query={query} />
        </div>
      </div>

      <AddInventorySkuModal open={addOpen} onClose={() => setAddOpen(false)} categories={invCategories} />
    </div>
  );
}
