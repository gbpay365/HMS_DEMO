import { useState } from 'react';

export function CustomCatalogRows({
  name,
  theme = 'lab',
  title,
  fieldLabel,
  placeholder,
  hint,
  addLabel,
  initialNames = [],
  inputClassName = 'consult-mocdoc-field',
  t}) {
  const [rows, setRows] = useState(() => {
    const names = (initialNames || []).map((n) => String(n || '').trim()).filter(Boolean);
    return names.length ? names : [''];
  });

  const addRow = () => setRows((prev) => [...prev, '']);
  const removeRow = (index) => setRows((prev) => (prev.length <= 1 ? [''] : prev.filter((_, i) => i !== index)));
  const updateRow = (index, value) => setRows((prev) => prev.map((v, i) => (i === index ? value : v)));

  return (
    <div className="consult-mocdoc-custom-box">
      <div className="consult-mocdoc-custom-head">
        <div className="consult-mocdoc-custom-title">{title}</div>
        <button type="button" onClick={addRow} className="consult-mocdoc-custom-add">
          + {addLabel}
        </button>
      </div>
      {hint ? <p className="consult-mocdoc-hint mb-2">{hint}</p> : null}
      <div className="space-y-2">
        {rows.map((value, index) => (
          <div key={index} className="consult-mocdoc-line-row">
            <span className="consult-mocdoc-line-serial">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
                {fieldLabel}
              </label>
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
              className="consult-mocdoc-line-remove"
              title={t('consultation.remove')}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
