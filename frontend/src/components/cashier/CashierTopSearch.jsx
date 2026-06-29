import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';

function useDebounced(value, ms = 280) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function CashierTopSearch({ onNavigate }) {
  const { t: tOps } = useTranslation('ops');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({ patients: [], bills: [], receipts: [] });
  const wrapRef = useRef(null);
  const debouncedQ = useDebounced(query.trim(), 300);

  const load = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setResults({ patients: [], bills: [], receipts: [] });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/cashier/search?q=${encodeURIComponent(q)}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setResults({
          patients: data.patients || [],
          bills: data.bills || [],
          receipts: data.receipts || [],
        });
      }
    } catch {
      setResults({ patients: [], bills: [], receipts: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load(debouncedQ);
  }, [debouncedQ, load, open]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const hasResults =
    results.patients.length > 0 || results.bills.length > 0 || results.receipts.length > 0;

  const pick = (item) => {
    setOpen(false);
    setQuery('');
    onNavigate?.(item);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'Enter' && debouncedQ.length >= 2) {
      const first =
        results.bills[0] || results.receipts[0] || results.patients[0];
      if (first) {
        e.preventDefault();
        pick(first);
      }
    }
  };

  const renderSection = (title, items, icon) => {
    if (!items.length) return null;
    return (
      <div className="cs-search-section">
        <div className="cs-search-section__title">{title}</div>
        {items.map((item) => (
          <button
            key={`${item.type}-${item.id}-${item.label}`}
            type="button"
            className="cs-search-item"
            onClick={() => pick(item)}
          >
            <FaIcon name={icon} className="cs-search-item__icon" />
            <span className="cs-search-item__main">
              <span className="cs-search-item__label">{item.label}</span>
              <span className="cs-search-item__sub">{item.sub}</span>
            </span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="cs-search-wrap cs-search-wrap--dropdown" ref={wrapRef}>
      <FaIcon name="search" className="cs-search-icon" />
      <input
        className="cs-search"
        placeholder={tOps('cashier_odoo.search_ph', { defaultValue: 'Search patient, bill, receipt…' })}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        aria-expanded={open}
        aria-haspopup="listbox"
        autoComplete="off"
      />
      {open && query.trim().length >= 2 ? (
        <div className="cs-search-dropdown" role="listbox">
          {loading ? (
            <div className="cs-search-dropdown__empty">
              {tOps('cashier_odoo.searching', { defaultValue: 'Searching…' })}
            </div>
          ) : null}
          {!loading && !hasResults ? (
            <div className="cs-search-dropdown__empty">
              {tOps('cashier_odoo.search_no_results', { defaultValue: 'No patients, bills, or receipts found.' })}
            </div>
          ) : null}
          {!loading ? (
            <>
              {renderSection(
                tOps('cashier_odoo.search_patients', { defaultValue: 'Patients' }),
                results.patients,
                'user'
              )}
              {renderSection(
                tOps('cashier_odoo.search_bills', { defaultValue: 'Bills' }),
                results.bills,
                'file-text-o'
              )}
              {renderSection(
                tOps('cashier_odoo.search_receipts', { defaultValue: 'Receipts' }),
                results.receipts,
                'file-text'
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
