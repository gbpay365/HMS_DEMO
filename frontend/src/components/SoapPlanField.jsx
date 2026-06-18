import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const LINE_GRADIENTS = [
  'from-emerald-500 to-teal-600 shadow-emerald-500/25',
  'from-indigo-500 to-violet-600 shadow-indigo-500/25',
  'from-amber-500 to-orange-600 shadow-amber-500/25',
  'from-rose-500 to-pink-600 shadow-rose-500/25',
  'from-cyan-500 to-blue-600 shadow-cyan-500/25',
  'from-fuchsia-500 to-purple-600 shadow-fuchsia-500/25',
];

/** Strip leading "1 - " style prefixes from stored plan text. */
export function parsePlanLines(text) {
  const raw = String(text || '').trim();
  if (!raw) return [''];
  const lines = raw.split(/\r?\n/).map((line) => line.replace(/^\s*\d+\s*[-–.:)]\s*/u, '').trim());
  return lines.length ? lines : [''];
}

/** Serialize line items as numbered plan text for the server. */
export function serializePlanLines(lines) {
  return (lines || [])
    .map((l) => String(l || '').trim())
    .filter(Boolean)
    .map((line, i) => `${i + 1} - ${line}`)
    .join('\n');
}

function FieldLabel({ children }) {
  return <label className="mb-2 block text-sm font-bold text-slate-800">{children}</label>;
}

export function SoapPlanField({ label, name = 'treatment_plan', defaultValue = '' }) {
  const { t } = useTranslation('clinical');
  const [lines, setLines] = useState(() => parsePlanLines(defaultValue));
  const inputRefs = useRef([]);

  const serialized = useMemo(() => serializePlanLines(lines), [lines]);

  const updateLine = useCallback((index, value) => {
    setLines((prev) => prev.map((line, i) => (i === index ? value : line)));
  }, []);

  const addLine = useCallback((afterIndex) => {
    setLines((prev) => {
      const next = [...prev];
      next.splice(afterIndex + 1, 0, '');
      return next;
    });
    requestAnimationFrame(() => {
      inputRefs.current[afterIndex + 1]?.focus();
    });
  }, []);

  const removeLine = useCallback((index) => {
    setLines((prev) => {
      if (prev.length <= 1) return [''];
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const onKeyDown = (e, index) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addLine(index);
    }
    if (e.key === 'Backspace' && !lines[index] && lines.length > 1) {
      e.preventDefault();
      removeLine(index);
      requestAnimationFrame(() => inputRefs.current[Math.max(0, index - 1)]?.focus());
    }
  };

  return (
    <div className="mb-4 last:mb-0">
      <FieldLabel>{label}</FieldLabel>

      <div className="overflow-hidden rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/30 to-teal-50/40 shadow-sm ring-1 ring-emerald-100/60">
        <div className="flex items-center justify-between border-b border-emerald-100/80 bg-white/60 px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-800/80">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-[10px] font-extrabold text-white shadow-sm">
              P
            </span>
            {t('consultation.plan_items_label')}
          </div>
          <button
            type="button"
            onClick={() => addLine(lines.length - 1)}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <span className="text-base leading-none">+</span>
            {t('consultation.plan_add_item')}
          </button>
        </div>

        <div className="space-y-2 p-3 md:p-4">
          {lines.map((line, index) => {
            const gradient = LINE_GRADIENTS[index % LINE_GRADIENTS.length];
            return (
              <div
                key={index}
                className="group flex items-center gap-2.5 rounded-xl border border-slate-100/80 bg-white/90 px-2.5 py-2 shadow-sm transition hover:border-emerald-200/80 hover:bg-white hover:shadow-md"
              >
                <div
                  className={`flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-sm font-extrabold text-white shadow-md`}
                  aria-hidden
                >
                  {index + 1}
                </div>
                <span className="shrink-0 text-base font-bold text-emerald-600/70" aria-hidden>
                  —
                </span>
                <input
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  value={line}
                  onChange={(e) => updateLine(index, e.target.value)}
                  onKeyDown={(e) => onKeyDown(e, index)}
                  placeholder={t('consultation.plan_item_ph')}
                  className="min-w-0 flex-1 border-0 bg-transparent py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                  autoComplete="off"
                />
                {lines.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                    title={t('consultation.plan_remove_item')}
                    aria-label={t('consultation.plan_remove_item')}
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="border-t border-emerald-100/60 bg-emerald-50/40 px-4 py-2 text-[11px] text-emerald-900/70">
          <i className="fa fa-lightbulb-o mr-1" />
          {t('consultation.plan_hint')}
        </div>
      </div>

      <input type="hidden" name={name} value={serialized} />
    </div>
  );
}
