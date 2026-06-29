import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

function FieldLabel({ children, required }) {
  return (
    <label className="consult-mocdoc-label">
      {children}
      {required ? <span className="text-red-600"> *</span> : null}
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
    <div className="consult-mocdoc-field-group">
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="consult-mocdoc-pick-box">
        <div className="consult-mocdoc-pick-label">
          <i className="fa fa-list-ul" aria-hidden="true" />
          {t('consultation.soap_pick_label')}
        </div>
        <select
          className="consult-mocdoc-pick-select"
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
        <p className="consult-mocdoc-hint mt-1">
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
        className="consult-mocdoc-field resize-y"
      />
    </div>
  );
}
