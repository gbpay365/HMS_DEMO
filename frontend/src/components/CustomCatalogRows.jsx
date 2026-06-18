import { useState } from 'react';
import { lineGradient, ORDER_THEMES } from '../lib/lineItemUi';

export function CustomCatalogRows({
  name,
  theme = 'lab',
  title,
  fieldLabel,
  placeholder,
  hint,
  addLabel,
  initialNames = [],
  inputClassName = 'hms-input',
  t}) {
  const th = ORDER_THEMES[theme] || ORDER_THEMES.lab;
  const [rows, setRows] = useState(() => {
    const names = (initialNames || []).map((n) => String(n || '').trim()).filter(Boolean);
    return names.length ? names : [''];
  });

  const addRow = () => setRows((prev) => [...prev, '']);
  const removeRow = (index) => setRows((prev) => (prev.length <= 1 ? [''] : prev.filter((_, i) => i !== index)));
  const updateRow = (index, value) => setRows((prev) => prev.map((v, i) => (i === index ? value : v)));

  return (
    <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-600">{title}</div>
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          + {addLabel}
        </button>
      </div>
      {hint ? <p className="mb-2 text-[11px] text-slate-500">{hint}</p> : null}
      <div className="space-y-2">
        {rows.map((value, index) => (
          <div
            key={index}
            className={`group flex items-center gap-2.5 rounded-xl border border-slate-100/80 bg-white/90 px-2.5 py-2 shadow-sm transition hover:bg-white hover:shadow-md ${th.rowHover}`}
          >
            <div
              className={`flex h-8 min-w-[2rem] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-extrabold text-white shadow ${lineGradient(index)}`}
            >
              {index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[11px] font-semibold text-slate-600">{fieldLabel}</label>
              <input
                name={name}
                className={inputClassName}
                placeholder={placeholder}
                value={value}
                onChange={(e) => updateRow(index, e.target.value)}
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
              title={t('consultation.remove')}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
