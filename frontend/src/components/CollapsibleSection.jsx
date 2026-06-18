import { useState } from 'react';

const ACCENTS = {
  brand: { border: 'border-brand/30', text: 'text-brand' },
  slate: { border: 'border-slate-200', text: 'text-slate-600' },
  emerald: { border: 'border-emerald-200', text: 'text-emerald-700' },
  amber: { border: 'border-amber-200', text: 'text-amber-800' },
  indigo: { border: 'border-indigo-200', text: 'text-indigo-700' }};

export function CollapsibleSection({
  number,
  title,
  hint,
  accent = 'slate',
  defaultOpen = false,
  children}) {
  const [open, setOpen] = useState(defaultOpen);
  const accentStyle = ACCENTS[accent] || ACCENTS.slate;

  return (
    <section className={`rounded-xl border border-dashed bg-white p-4 ${accentStyle.border}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <h3 className={`text-xs font-bold uppercase tracking-wide ${accentStyle.text}`}>
            {number ? `${number}. ` : ''}
            {title}
          </h3>
          {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-600"
          aria-hidden
        >
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">{children}</div> : null}
    </section>
  );
}
