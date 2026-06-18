import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getQuickLauncherItems } from '../lib/quickLauncherCatalog';

function scoreItem(item, q) {
  const hay = `${item.label} ${item.href} ${item.group}`.toLowerCase();
  if (!q) return 1;
  if (hay.includes(q)) return 10;
  const parts = q.split(/\s+/).filter(Boolean);
  return parts.every((p) => hay.includes(p)) ? 5 : 0;
}

export function QuickLauncher() {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);

  const items = useMemo(() => getQuickLauncherItems(), []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .map((item) => ({ item, score: scoreItem(item, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
      .slice(0, 12)
      .map((x) => x.item);
  }, [items, query]);

  const go = useCallback((href) => {
    if (!href) return;
    window.location.href = href;
  }, []);

  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[activeIdx]) {
        e.preventDefault();
        go(results[activeIdx].href);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, results, activeIdx, go]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIdx(0);
      return;
    }
    const tmr = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(tmr);
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2100] flex items-start justify-center bg-slate-900/45 p-4 pt-[12vh] backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label={t('aria.close_dialog', { defaultValue: 'Close' })}
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <i className="fa fa-search text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            className="hms-input flex-1 border-0 shadow-none focus:ring-0"
            placeholder={t('quick_launcher.placeholder', { defaultValue: 'Jump to module…' })}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500 sm:inline">
            Esc
          </kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-2" role="listbox">
          {results.length ? (
            results.map((item, idx) => (
              <li key={item.href}>
                <button
                  type="button"
                  role="option"
                  aria-selected={idx === activeIdx}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${
                    idx === activeIdx ? 'bg-brand/10 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => go(item.href)}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-brand">
                    <i className={`fa ${item.icon || 'fa-link'}`} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{item.label}</span>
                    <span className="block truncate text-xs text-slate-500">{item.href}</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">{item.group}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-4 py-8 text-center text-sm text-slate-500">
              {t('quick_launcher.no_results', { defaultValue: 'No matching modules.' })}
            </li>
          )}
        </ul>
        <div className="border-t border-slate-100 px-4 py-2 text-center text-[11px] text-slate-400">
          {t('quick_launcher.hint', { defaultValue: 'Ctrl+K anywhere in HMS' })}
        </div>
      </div>
    </div>
  );
}
