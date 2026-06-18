import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_PAGE_SIZE, paginateItems } from '../lib/pagination';

/**
 * Client-side pagination for React lists (search/filter first, then paginate).
 * @template T
 * @param {T[]} items - full filtered list
 * @param {{ pageSize?: number, resetKeys?: unknown[] }} [opts]
 */
export function useClientPagination(items, opts = {}) {
  const pageSize = opts.pageSize || DEFAULT_PAGE_SIZE;
  const resetKeys = opts.resetKeys || [];
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [items.length, pageSize, ...resetKeys]);

  const result = useMemo(() => paginateItems(items, page, pageSize), [items, page, pageSize]);

  return {
    page,
    setPage,
    pageSize,
    pager: result,
    rows: result.items};
}
