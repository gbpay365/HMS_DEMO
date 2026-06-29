import { useState } from 'react';
import { FaIcon } from '../FaIcon';

/** Shared horizontal clinical workflow strip — full-width, larger stations. */
export function ClinicalWorkflowBanner({
  title,
  subtitle,
  steps = [],
  footnote = null,
  accent = 'teal',
  stationTitle = (n) => `Station ${n}`,
  listAriaLabel = null,
  defaultCollapsed = false,
  showLabel = 'Show workflow',
  hideLabel = 'Hide workflow'}) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const borderAccent = accent === 'blue' ? 'border-blue-700' : 'border-teal-600';
  const subAccent = accent === 'blue' ? 'text-blue-700' : 'text-teal-700';

  return (
    <div className="mb-6 w-full rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 via-slate-50 to-white p-5 shadow-card sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className={`min-w-0 flex-1 border-l-4 ${borderAccent} pl-3`}>
          <h2 className="text-xl font-extrabold text-ink sm:text-2xl">{title}</h2>
          {subtitle ? (
            <p className={`text-xs font-bold uppercase tracking-wider sm:text-sm ${subAccent}`}>{subtitle}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <FaIcon name={open ? 'chevron-up' : 'chevron-down'} />
          {open ? hideLabel : showLabel}
        </button>
      </div>

      {open ? (
        <>
          <div className="w-full overflow-x-auto pb-2 lg:overflow-visible">
            <div
              className="flex w-full min-w-[920px] items-start lg:min-w-0"
              role="list"
              aria-label={listAriaLabel || `${title} stations`}
            >
              {steps.map((s, i) => (
                <div key={s.n} className="flex min-w-0 flex-1 items-start" role="listitem">
                  <div className="flex w-full flex-col items-center px-0.5 sm:px-1">
                    <span
                      className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-full text-base font-extrabold text-white shadow md:h-12 md:w-12 md:text-lg"
                      style={{ background: s.color }}
                      title={stationTitle(s.n)}
                    >
                      {s.n}
                    </span>
                    <span
                      className="mb-2.5 flex h-14 w-14 items-center justify-center rounded-full text-xl md:h-16 md:w-16 md:text-2xl"
                      style={{ background: `${s.color}18`, border: `2px solid ${s.color}`, color: s.color }}
                      aria-hidden="true"
                    >
                      <FaIcon name={s.icon} />
                    </span>
                    <span className="whitespace-pre-line text-center text-xs font-bold leading-snug text-slate-800 md:text-sm">
                      {s.label}
                    </span>
                    <span className="mt-1 text-center text-xs text-slate-500 md:text-sm">{s.role}</span>
                    {s.note ? (
                      <span className="mt-0.5 text-center text-[11px] italic md:text-xs" style={{ color: s.color }}>
                        {s.note}
                      </span>
                    ) : null}
                  </div>
                  {i < steps.length - 1 ? (
                    <span className="mt-10 shrink-0 px-0.5 text-base text-teal-600 md:mt-12 md:text-lg" aria-hidden="true">
                      <FaIcon name="long-arrow-right" />
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {footnote ? (
            <p className="mt-4 border-t border-dashed border-slate-300 pt-3 text-xs leading-relaxed text-slate-600 md:text-sm">
              {footnote}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
