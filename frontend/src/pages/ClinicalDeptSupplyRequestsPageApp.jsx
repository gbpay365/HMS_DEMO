import { useMemo, useState } from 'react';
import { ClinicalDeptItemPicker } from '../components/ClinicalDeptItemPicker';
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
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

function statusTone(st) {
  const s = String(st || 'submitted').toLowerCase();
  if (s === 'submitted') return 'bg-sky-100 text-sky-800 ring-sky-200';
  if (s === 'cancelled') return 'bg-slate-100 text-slate-600 ring-slate-200';
  return 'bg-amber-100 text-amber-900 ring-amber-200';
}

function itemTypeLabel(types, value) {
  const hit = (types || []).find((t) => t.value === value);
  return hit ? hit.label : value || 'Item';
}

function emptyLine(units) {
  return {
    item_type: 'reagent',
    inventory_item_id: '',
    description: '',
    quantity: '1',
    uom: units?.[0]?.value || 'unit',
    remarks: '',
  };
}

export function ClinicalDeptSupplyRequestsPageApp({
  department = 'laboratory',
  departmentLabel = 'Laboratory',
  basePath = '/laboratory/supply-requests',
  requests = [],
  inventoryItems = [],
  itemOptionsByType = {},
  itemTypes = [],
  units = [],
  flash = null,
  error = null,
}) {
  const isLab = department === 'laboratory';
  const [lines, setLines] = useState([emptyLine(units)]);
  const [customByType, setCustomByType] = useState({});

  const catalogCount = useMemo(() => {
    const sets = itemOptionsByType || {};
    return Object.values(sets).reduce((n, arr) => n + (arr?.length || 0), 0);
  }, [itemOptionsByType]);

  const optionsForType = (itemType) => {
    const base = itemOptionsByType?.[itemType] || [];
    const custom = (customByType[itemType] || []).map((name) => ({
      id: `custom-${itemType}-${name}`,
      name,
      source: 'custom',
      inventory_item_id: null,
    }));
    return [...base, ...custom];
  };

  const updateLine = (idx, key, val) => {
    setLines((prev) =>
      prev.map((ln, i) => {
        if (i !== idx) return ln;
        const next = { ...ln, [key]: val };
        if (key === 'item_type') {
          next.inventory_item_id = '';
          next.description = '';
        }
        return next;
      })
    );
  };

  const handleItemPick = (idx, itemType, picked) => {
    setLines((prev) =>
      prev.map((ln, i) => {
        if (i !== idx) return ln;
        return {
          ...ln,
          description: picked.description,
          inventory_item_id: picked.inventory_item_id || '',
        };
      })
    );
    if (picked.custom && picked.description) {
      const name = String(picked.description).trim();
      setCustomByType((prev) => {
        const list = prev[itemType] || [];
        if (list.some((n) => n.toLowerCase() === name.toLowerCase())) return prev;
        return { ...prev, [itemType]: [...list, name] };
      });
    }
  };

  const stockFor = (id) => inventoryItems.find((it) => String(it.id) === String(id));

  const pendingCount = useMemo(
    () => requests.filter((r) => String(r.status || '').toLowerCase() === 'submitted').length,
    [requests]
  );

  const subtitle = isLab
    ? 'Request reagents, consumables, and lab equipment — forwarded to Procurement as a purchase request.'
    : 'Request contrast media, films, consumables, and imaging equipment — forwarded to Procurement.';

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero
          icon={isLab ? 'laboratory' : 'radiology'}
          badge="Procurement"
          title={`${departmentLabel} — supply requests`}
          subtitle={subtitle}
        >
          <div className="hms-surface-hero-actions mt-4">
            <a href={isLab ? '/laboratory' : '/radiology'} className="hms-btn-secondary text-xs">
              <i className={`fa fa-${isLab ? 'flask' : 'medkit'} mr-1`} aria-hidden="true" />
              {isLab ? 'Lab registry' : 'Radiology worklist'}
            </a>
            <a href="/procurement/purchase-requests" className="hms-btn-secondary text-xs">
              <i className="fa fa-shopping-cart mr-1" aria-hidden="true" />
              Procurement PRs
            </a>
          </div>
        </SurfaceHero>

        <div className="hms-compact-kpi-grid hms-compact-kpi-grid--3 mb-4">
          <StatCard label="My requests" value={requests.length} tone="brand" icon="history" />
          <StatCard label="Catalog items" value={catalogCount} tone="default" icon="cube" />
          <StatCard label="With procurement" value={pendingCount} tone="info" icon="paper-plane" />
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <form method="POST" action={basePath} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
              <h2 className="mb-3 font-extrabold text-ink">
                <i className="fa fa-plus-circle mr-1 text-orange-600" aria-hidden="true" />
                New procurement request
              </h2>

              <div className="hms-compact-kpi-grid mb-3">
                <div>
                  <label className="hms-label" htmlFor="needed-by">
                    Needed by (optional)
                  </label>
                  <input id="needed-by" type="date" name="needed_by" className="hms-input w-full text-sm" />
                </div>
                <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                  <i className="fa fa-info-circle mr-1" aria-hidden="true" />
                  Submitted requests create a <strong>Purchase Request</strong> in Procurement automatically.
                </div>
              </div>

              <div className="mb-4">
                <label className="hms-label" htmlFor="dept-notes">
                  Notes for procurement
                </label>
                <textarea
                  id="dept-notes"
                  name="notes"
                  className="hms-input w-full text-sm"
                  rows={2}
                  maxLength={2000}
                  placeholder="Urgency, preferred vendor, batch requirements…"
                />
              </div>

              <p className="mb-2 text-xs text-slate-500">
                Select a type, then search the item list or type a new name if it is not listed.
              </p>

              <div className="space-y-3">
                {lines.map((ln, idx) => {
                  const stock = stockFor(ln.inventory_item_id);
                  const lineOptions = optionsForType(ln.item_type);
                  return (
                    <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <div className="grid gap-2 sm:grid-cols-12">
                        <div className="sm:col-span-3">
                          <label className="hms-label text-[10px]">Type</label>
                          <select
                            className="hms-input text-sm"
                            name="item_type[]"
                            value={ln.item_type}
                            onChange={(ev) => updateLine(idx, 'item_type', ev.target.value)}
                          >
                            {itemTypes.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-9">
                          <ClinicalDeptItemPicker
                            itemType={ln.item_type}
                            options={lineOptions}
                            value={ln.description}
                            inventoryItemId={ln.inventory_item_id}
                            inputName="description[]"
                            hiddenInvName="inventory_item_id[]"
                            onChange={(picked) => handleItemPick(idx, ln.item_type, picked)}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="hms-label text-[10px]">Qty</label>
                          <input
                            className="hms-input text-sm"
                            name="quantity[]"
                            value={ln.quantity}
                            onChange={(ev) => updateLine(idx, 'quantity', ev.target.value)}
                            required
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="hms-label text-[10px]">Unit</label>
                          <select
                            className="hms-input text-sm"
                            name="uom[]"
                            value={ln.uom}
                            onChange={(ev) => updateLine(idx, 'uom', ev.target.value)}
                          >
                            {units.map((u) => (
                              <option key={u.value} value={u.value}>
                                {u.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-6">
                          <label className="hms-label text-[10px]">Remarks</label>
                          <input
                            className="hms-input text-sm"
                            name="remarks[]"
                            value={ln.remarks}
                            onChange={(ev) => updateLine(idx, 'remarks', ev.target.value)}
                            placeholder="Brand, catalogue ref, storage…"
                          />
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
                        {stock ? (
                          <div className="sm:col-span-12 text-[10px] font-bold uppercase text-slate-400">
                            Stock: {stock.qty} · {stock.stockLabel}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="hms-btn-secondary text-xs"
                  onClick={() => setLines((prev) => [...prev, emptyLine(units)])}
                >
                  <i className="fa fa-plus mr-1" aria-hidden="true" />
                  Add line
                </button>
                <button type="submit" className="hms-btn-primary">
                  <i className="fa fa-paper-plane mr-1" aria-hidden="true" />
                  Submit to procurement
                </button>
              </div>
            </form>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-slate-100 bg-white shadow-card">
              <div className="border-b border-slate-100 px-4 py-3 font-bold text-ink">
                <i className="fa fa-history mr-1 text-slate-400" aria-hidden="true" />
                My requests
              </div>
              <div className="max-h-[640px] space-y-2 overflow-y-auto p-3">
                {!requests.length ? (
                  <p className="py-8 text-center text-sm text-slate-400">No requests yet.</p>
                ) : (
                  requests.map((r) => (
                    <div key={r.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-extrabold text-ink">{r.req_number}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset ${statusTone(r.status)}`}
                        >
                          {r.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500">{fmtDt(r.created_at)}</div>
                      {r.procurement_pr_id ? (
                        <div className="mt-2 text-xs">
                          <a
                            href={`/procurement/purchase-requests/${r.procurement_pr_id}`}
                            className="font-bold text-sky-700 underline"
                          >
                            PR {r.procurement_pr_number || `#${r.procurement_pr_id}`}
                          </a>
                          {r.procurement_pr_status ? (
                            <span className="ml-1 text-slate-500">({r.procurement_pr_status})</span>
                          ) : null}
                        </div>
                      ) : null}
                      {r.lines?.length ? (
                        <ul className="mt-2 space-y-1 text-xs text-slate-600">
                          {r.lines.slice(0, 5).map((ln) => (
                            <li key={ln.id}>
                              <i className="fa fa-cube mr-1 opacity-50" aria-hidden="true" />
                              <span className="text-[10px] uppercase text-slate-400">
                                {itemTypeLabel(itemTypes, ln.item_type)}{' '}
                              </span>
                              {ln.description} × {ln.quantity} {ln.uom}
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
