import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

function serializeMedicationLines(items) {
  return items
    .map((it) => {
      const parts = [it.name];
      if (it.dosage) parts.push(it.dosage);
      if (it.qty) parts.push(`Qty: ${it.qty}`);
      return parts.join(' — ');
    })
    .join('\n');
}

export function PharmacyMedicationPicker({ name = 'items', inputId = 'rx-items' }) {
  const { t } = useTranslation('clinical');
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState([]);
  const [pending, setPending] = useState(null);
  const [pendingDosage, setPendingDosage] = useState('');
  const [pendingQty, setPendingQty] = useState('1');
  const searchRef = useRef(null);
  const suggestRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/pharmacy/inventory-for-charge', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const rows = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
        setInventory(rows);
      })
      .catch(() => {
        if (!cancelled) setInventory([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onDoc = (ev) => {
      if (suggestRef.current && !suggestRef.current.contains(ev.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const addedIds = useMemo(() => new Set(added.map((a) => a.id)), [added]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = inventory.filter((it) => !addedIds.has(it.id));
    if (!q) return pool.slice(0, 18);
    return pool.filter((it) => String(it.name || '').toLowerCase().includes(q)).slice(0, 18);
  }, [query, inventory, addedIds]);

  const selectHit = useCallback((it) => {
    setPending(it);
    setPendingDosage('');
    setPendingQty('1');
    setQuery(String(it.name || ''));
    setOpen(false);
  }, []);

  const addPending = useCallback(() => {
    if (!pending) return;
    setAdded((prev) => [
      ...prev,
      {
        id: pending.id,
        name: String(pending.name || '').trim(),
        dosage: pendingDosage.trim(),
        qty: pendingQty.trim() || '1',
      },
    ]);
    setPending(null);
    setPendingDosage('');
    setPendingQty('1');
    setQuery('');
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [pending, pendingDosage, pendingQty]);

  const removeItem = useCallback((id) => {
    setAdded((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const updateItem = useCallback((id, patch) => {
    setAdded((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const serialized = serializeMedicationLines(added);

  return (
    <div className="space-y-3">
      <input type="hidden" id={inputId} name={name} value={serialized} readOnly />

      <div className="relative" ref={suggestRef}>
        <label className="hms-label" htmlFor="rx-med-search">
          {t('modals.newPrescription.medication_items')}
        </label>
        <div className="relative mt-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">
            <i className="fa fa-search" />
          </span>
          <input
            ref={searchRef}
            id="rx-med-search"
            type="search"
            className="hms-input w-full pl-9"
            autoComplete="off"
            disabled={loading}
            placeholder={t('modals.newPrescription.med_search_ph')}
            value={query}
            onChange={(ev) => {
              setQuery(ev.target.value);
              setOpen(true);
              if (pending && ev.target.value !== pending.name) setPending(null);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && hits.length === 1) {
                ev.preventDefault();
                selectHit(hits[0]);
              }
            }}
          />
        </div>
        {open ? (
          <div className="ph-rx-med-suggest absolute left-0 right-0 top-full z-[2100] mt-1 max-h-52 overflow-y-auto rounded-xl border border-[var(--pha-soft-border,#f4c0d1)] bg-white shadow-lg">
            {loading ? (
              <div className="px-3 py-2 text-sm text-slate-500">{t('modals.newPrescription.med_loading')}</div>
            ) : !hits.length ? (
              <div className="px-3 py-2 text-sm text-slate-500">
                {query.trim() ? t('modals.newPrescription.med_no_matches') : t('modals.newPrescription.med_type_to_search')}
              </div>
            ) : (
              hits.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="block w-full border-b border-slate-100 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-[var(--pha-page-bg,#fff0f5)]"
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    selectHit(it);
                  }}
                >
                  <span className="font-semibold text-[var(--pha-primary,#4b1528)]">{it.name}</span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      {pending ? (
        <div className="rounded-xl border border-[var(--pha-accent,#d4537e)]/30 bg-[var(--pha-rx-label-bg,#fce4ec)]/50 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--pha-primary,#4b1528)]">
            {t('modals.newPrescription.med_add_selected')}
          </div>
          <div className="mb-2 text-sm font-semibold text-[var(--pha-primary,#4b1528)]">{pending.name}</div>
          <div className="grid gap-2 sm:grid-cols-[1fr_100px_auto]">
            <input
              type="text"
              className="hms-input h-9 text-sm"
              placeholder={t('modals.newPrescription.med_dosage_ph')}
              value={pendingDosage}
              onChange={(ev) => setPendingDosage(ev.target.value)}
            />
            <input
              type="number"
              min="1"
              className="hms-input h-9 text-sm"
              placeholder={t('modals.newPrescription.med_qty_ph')}
              value={pendingQty}
              onChange={(ev) => setPendingQty(ev.target.value)}
            />
            <button type="button" className="pha-btn-primary h-9 rounded-lg px-3 text-xs font-bold uppercase tracking-wide" onClick={addPending}>
              {t('modals.newPrescription.med_add_btn')}
            </button>
          </div>
        </div>
      ) : null}

      {added.length ? (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {t('modals.newPrescription.med_added_count', { count: added.length })}
          </div>
          {added.map((it) => (
            <div
              key={it.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--pha-soft-border,#f4c0d1)] bg-white px-3 py-2"
            >
              <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--pha-primary,#4b1528)]">{it.name}</span>
              <input
                type="text"
                className="hms-input h-8 w-28 text-xs"
                placeholder={t('modals.newPrescription.med_dosage_ph')}
                value={it.dosage}
                onChange={(ev) => updateItem(it.id, { dosage: ev.target.value })}
              />
              <input
                type="number"
                min="1"
                className="hms-input h-8 w-16 text-xs"
                value={it.qty}
                onChange={(ev) => updateItem(it.id, { qty: ev.target.value })}
              />
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => removeItem(it.id)}
                aria-label={t('modals.newPrescription.med_remove')}
              >
                <i className="fa fa-times" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">{t('modals.newPrescription.med_hint')}</p>
      )}
    </div>
  );
}
