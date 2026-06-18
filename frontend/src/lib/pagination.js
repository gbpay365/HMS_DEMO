/** Default rows per page for React list views. */
export const DEFAULT_PAGE_SIZE = 25;

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * @param {number} total
 * @param {number} page
 * @param {number} [pageSize]
 */
export function pagerMeta(total, page, pageSize = DEFAULT_PAGE_SIZE) {
  const size = Math.max(1, pageSize || DEFAULT_PAGE_SIZE);
  const safeTotal = Math.max(0, Number(total) || 0);
  const totalPages = Math.max(1, Math.ceil(safeTotal / size) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * size;
  return {
    page: safePage,
    pageSize: size,
    total: safeTotal,
    totalPages,
    offset,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
    from: safeTotal === 0 ? 0 : offset + 1,
    to: Math.min(offset + size, safeTotal)};
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} page
 * @param {number} [pageSize]
 */
export function paginateItems(items, page, pageSize = DEFAULT_PAGE_SIZE) {
  const meta = pagerMeta(items.length, page, pageSize);
  return {
    ...meta,
    items: items.slice(meta.offset, meta.offset + meta.pageSize)};
}
