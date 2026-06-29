import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  return <label className="consult-mocdoc-label">{children}</label>;
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
    <div className="consult-mocdoc-field-group">
      <FieldLabel>{label}</FieldLabel>

      <div className="consult-mocdoc-lines">
        <div className="consult-mocdoc-lines-head">
          <div className="consult-mocdoc-lines-head-title">
            <span className="consult-mocdoc-lines-head-badge">P</span>
            {t('consultation.plan_items_label')}
          </div>
          <button type="button" onClick={() => addLine(lines.length - 1)} className="consult-mocdoc-lines-add">
            <span className="text-base leading-none">+</span>
            {t('consultation.plan_add_item')}
          </button>
        </div>

        <div className="consult-mocdoc-lines-body">
          {lines.map((line, index) => (
            <div key={index} className="consult-mocdoc-line-row">
              <span className="consult-mocdoc-line-serial" aria-hidden>
                {index + 1}
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
                className="consult-mocdoc-line-input"
                autoComplete="off"
              />
              {lines.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  className="consult-mocdoc-line-remove"
                  title={t('consultation.plan_remove_item')}
                  aria-label={t('consultation.plan_remove_item')}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="consult-mocdoc-lines-footer">
          <i className="fa fa-lightbulb-o mr-1" />
          {t('consultation.plan_hint')}
        </div>
      </div>

      <input type="hidden" name={name} value={serialized} />
    </div>
  );
}
