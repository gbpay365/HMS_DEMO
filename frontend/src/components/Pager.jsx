import { useTranslation } from 'react-i18next';
import { buildPageUrl } from '../lib/listUi';
import { PAGE_SIZE_OPTIONS } from '../lib/pagination';

/**
 * Standard HMS React list pager.
 * - Client mode: pass `onPageChange(page)` (no full reload).
 * - Server mode: pass `basePath` (+ optional `query`) for URL navigation.
 */
export function Pager({
  pager,
  onPageChange,
  onPage,
  basePath,
  query = {},
  pageParam = 'p',
  onPageSizeChange,
  onPageSize,
  pageSizeOptions = PAGE_SIZE_OPTIONS}) {
  const { t } = useTranslation('common');
  const changePage = onPageChange || onPage;
  const changePageSize = onPageSizeChange || onPageSize;
  if (!pager) return null;

  const showNav = (pager.totalPages || 1) > 1 || (pager.total || 0) > (pager.pageSize || 1);
  const prevLabel = t('pagination.prev');
  const nextLabel = t('pagination.next');

  const go = (nextPage) => {
    if (nextPage < 1 || nextPage > pager.totalPages) return;
    if (changePage) {
      changePage(nextPage);
      return;
    }
    if (basePath) {
      window.location.assign(buildPageUrl(basePath, nextPage, query, pageParam));
    }
  };

  const start = Math.max(1, pager.page - 2);
  const end = Math.min(pager.totalPages, pager.page + 2);
  const pages = [];
  for (let i = start; i <= end; i += 1) pages.push(i);

  const navBtn = (label, targetPage, disabled = false) => {
    if (disabled) {
      return (
        <span className="rounded-xl px-3 py-1.5 text-xs text-slate-300" aria-hidden>
          {label}
        </span>
      );
    }
    return (
      <button
        type="button"
        className={label === prevLabel || label === nextLabel ? 'hms-btn-secondary px-3 py-1.5 text-xs' : `rounded-xl px-3 py-1.5 text-xs font-semibold ${targetPage === pager.page ? 'bg-brand text-white' : 'text-slate-600 hover:bg-white'}`}
        onClick={() => go(targetPage)}
        aria-current={targetPage === pager.page ? 'page' : undefined}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-500">
          {t('pagination.showing', { from: pager.from || 0, to: pager.to || 0, total: pager.total || 0 })}
          {showNav ? (
            <>
              {' '}
              · {t('pagination.page_of', { page: pager.page, totalPages: pager.totalPages })}
            </>
          ) : null}
        </p>
        {changePageSize ? (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            {t('pagination.rows')}
            <select
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              value={pager.pageSize}
              onChange={(e) => changePageSize(parseInt(e.target.value, 10))}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {showNav ? (
        <nav className="flex flex-wrap items-center gap-1" aria-label={t('pagination.aria')}>
          {navBtn(prevLabel, pager.page - 1, !pager.hasPrev)}
          {pages.map((n) => navBtn(String(n), n))}
          {navBtn(nextLabel, pager.page + 1, !pager.hasNext)}
        </nav>
      ) : null}
    </div>
  );
}
