import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogImportPanel } from '../components/CatalogImportPanel';
import { FilterChip } from '../components/FilterChip';
import { FlashMessages } from '../components/FlashMessages';
import { Pager } from '../components/Pager';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { useClientPagination } from '../hooks/useClientPagination';
import { normalizeCatalogAccess } from '../lib/catalogAccessClient';
import {
  catBadgeClass,
  prettyCat,
  serviceSearchBlob,
  tabCat} from '../lib/catalogUi';
import { formatMoney, priceUnitLabel } from '../lib/hmsLocale';
import { DEFAULT_PAGE_SIZE } from '../lib/pagination';
import { CatalogServiceModal } from '../modals/CatalogServiceModal';

function formatCatalogPrice(n) {
  return formatMoney(n);
}

function tabFromHash() {
  const h = String(window.location.hash || '').replace('#', '').trim().toLowerCase();
  if (!h) return null;
  if (h === 'radiology' || h === 'rad' || h === 'scans_imaging' || h === 'imaging') return 'scans_imaging';
  if (h === 'lab' || h === 'laboratory') return 'laboratory';
  if (h === 'pharmacy') return 'pharmacy';
  return null;
}

export function CatalogPageApp({ services = [], flash = null, error = null, catalogAccess: catalogAccessRaw = null }) {
  const { t } = useTranslation('ops');
  const access = useMemo(() => normalizeCatalogAccess(catalogAccessRaw), [catalogAccessRaw]);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('__all');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [addOpen, setAddOpen] = useState(false);
  const [editService, setEditService] = useState(null);

  useEffect(() => {
    const tab = tabFromHash();
    if (tab && access.canReadTab(tab)) {
      setActiveCat(tab);
    } else if (tab && access.canReadTab('__all') && !access.canReadTab(tab)) {
      setActiveCat('__all');
    } else if (!access.canReadTab('__all') && access.readSections?.length === 1) {
      const only = access.readSections[0];
      const mapped = only === 'radiology' ? 'scans_imaging' : only;
      if (access.canReadTab(mapped)) setActiveCat(mapped);
    }
  }, [access]);

  const enriched = useMemo(
    () =>
      services.map((s) => ({
        ...s,
        _tabCat: tabCat(s.category),
        _search: serviceSearchBlob(s)})),
    [services]
  );

  const categories = useMemo(() => {
    const set = new Set(enriched.map((s) => s._tabCat));
    return Array.from(set)
      .filter((cat) => access.canReadTab(cat))
      .sort((a, b) => a.localeCompare(b));
  }, [enriched, access]);

  const catCounts = useMemo(() => {
    const counts = { __all: enriched.length };
    enriched.forEach((s) => {
      counts[s._tabCat] = (counts[s._tabCat] || 0) + 1;
    });
    return counts;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((s) => {
      const okCat = activeCat === '__all' || s._tabCat === activeCat;
      const okQ = !q || s._search.includes(q);
      return okCat && okQ;
    });
  }, [enriched, search, activeCat]);

  const isPharmacyTab = activeCat === 'pharmacy';
  const nameCol = isPharmacyTab ? t('catalog.col_medication') : t('catalog.col_service_name');
  const deptCol = isPharmacyTab ? t('catalog.col_used_for') : t('catalog.col_department');
  const canWriteActive =
    activeCat === '__all' ? access.canWriteAny : access.canWriteTab(activeCat);

  const { setPage, pager, rows } = useClientPagination(filtered, {
    pageSize,
    resetKeys: [search, activeCat, pageSize]});

  const selectCategory = (cat) => {
    setActiveCat(cat);
    if (cat === 'scans_imaging') window.location.hash = 'radiology';
    else if (cat === 'laboratory') window.location.hash = 'lab';
    else if (cat === 'pharmacy') window.location.hash = 'pharmacy';
    else if (cat === '__all') window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero
          icon="book"
          title={t('catalog.title')}
          subtitle={t('catalog.subtitle', { currency: priceUnitLabel() })}
        >
          {canWriteActive ? (
            <div className="hms-surface-hero-actions mt-4">
              <button type="button" className="hms-btn-primary text-xs" onClick={() => setAddOpen(true)}>
                {t('catalog.add_service')}
              </button>
            </div>
          ) : null}
        </SurfaceHero>

        {access.canImportAny ? <CatalogImportPanel access={access} activeCat={activeCat} /> : null}

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatCard label={t('catalog.stat_active')} value={services.length} />
          <StatCard label={t('catalog.stat_categories')} value={categories.length} />
          <StatCard label={t('catalog.stat_filtered')} value={filtered.length} />
        </div>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SearchField
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              placeholder={t('catalog.search_ph')}
            />
            <span className="text-xs text-slate-500">
              {t('catalog.showing_count', { filtered: filtered.length, total: services.length })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {access.canReadTab('__all') ? (
              <FilterChip active={activeCat === '__all'} onClick={() => selectCategory('__all')} count={catCounts.__all || 0}>
                {t('catalog.tab_all')}
              </FilterChip>
            ) : null}
            {categories.map((cat) => (
              <FilterChip key={cat} active={activeCat === cat} onClick={() => selectCategory(cat)} count={catCounts[cat] || 0}>
                {prettyCat(cat)}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {!isPharmacyTab ? <th className="px-4 py-3">{t('catalog.col_category')}</th> : null}
                  <th className="px-4 py-3">{nameCol}</th>
                  <th className="px-4 py-3">{deptCol}</th>
                  <th className="px-4 py-3 text-right">{t('catalog.col_price')}</th>
                  {canWriteActive ? <th className="px-4 py-3 text-right">{t('catalog.col_action')}</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={isPharmacyTab ? (canWriteActive ? 4 : 3) : canWriteActive ? 5 : 4} className="px-4 py-12 text-center text-sm text-slate-500">
                      {services.length === 0 ? t('catalog.empty_catalog') : t('catalog.empty_filter')}
                    </td>
                  </tr>
                ) : (
                  rows.map((service) => {
                    const canEdit = access.canWriteTab(service._tabCat);
                    return (
                      <tr key={service.id} className="hover:bg-slate-50/80">
                        {!isPharmacyTab ? (
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${catBadgeClass(service._tabCat)}`}
                            >
                              {prettyCat(service._tabCat)}
                            </span>
                          </td>
                        ) : null}
                        <td className="px-4 py-3 font-semibold text-ink">{service.name}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {isPharmacyTab
                            ? service.department_name?.trim() || t('catalog.uncategorized')
                            : service.department_name || t('catalog.general')}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-ink">
                          {formatCatalogPrice(service.price)}
                        </td>
                        {canWriteActive ? (
                          <td className="px-4 py-3 text-right">
                            {canEdit ? (
                              <button
                                type="button"
                                className="hms-btn-secondary px-3 py-1.5 text-xs"
                                onClick={() => setEditService(service)}
                              >
                                {t('catalog.edit')}
                              </button>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pager pager={pager} onPage={setPage} pageSize={pageSize} onPageSize={setPageSize} />
        </div>

        <CatalogServiceModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          mode="add"
          writeSections={access.writeSections}
        />
        <CatalogServiceModal
          open={!!editService}
          onClose={() => setEditService(null)}
          mode="edit"
          service={editService}
          writeSections={access.writeSections}
        />
      </div>
    </div>
  );
}
