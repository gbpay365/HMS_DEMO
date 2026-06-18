import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200';
const selectClass =
  'w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200';

function FieldLabel({ children, required }) {
  return (
    <label className="mb-2 block text-sm font-bold text-slate-800">
      {children}
      {required ? <span className="ml-0.5 text-red-600">*</span> : null}
    </label>
  );
}

function appendPick(prev, pick) {
  const trimmed = String(prev || '').trim();
  if (!trimmed) return pick;
  if (trimmed.toLowerCase().includes(String(pick).toLowerCase())) return trimmed;
  const sep = /[.;]\s*$/.test(trimmed) ? ' ' : '; ';
  return `${trimmed}${sep}${pick}`;
}

export function SoapPickField({
  label,
  name,
  catalog = [],
  rows = 3,
  required,
  placeholder,
  defaultValue = ''}) {
  const { t } = useTranslation('clinical');
  const [text, setText] = useState(defaultValue || '');

  const onPick = useCallback((e) => {
    const pick = e.target.value;
    if (!pick) return;
    setText((prev) => appendPick(prev, pick));
    e.target.value = '';
  }, []);

  return (
    <div className="mb-4 last:mb-0">
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="mb-2 overflow-hidden rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-800">
          <i className="fa fa-list-ul" aria-hidden="true" />
          {t('consultation.soap_pick_label')}
        </div>
        <select
          className={selectClass}
          defaultValue=""
          onChange={onPick}
          aria-label={t('consultation.soap_pick_placeholder')}
        >
          <option value="">{t('consultation.soap_pick_placeholder')}</option>
          {catalog.map(({ group, items }) => (
            <optgroup key={group} label={group}>
              {(items || []).map((item) => (
                <option key={`${group}-${item}`} value={item}>
                  {item}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="mt-1.5 text-[11px] text-indigo-900/70">
          <i className="fa fa-info-circle mr-1" aria-hidden="true" />
          {t('consultation.soap_pick_hint')}
        </p>
      </div>
      <textarea
        name={name}
        rows={rows}
        required={required}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={`${inputClass} resize-y`}
      />
    </div>
  );
}
