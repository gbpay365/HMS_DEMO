import { useEffect, useRef, useState } from 'react';
import { formatDmyInput, isoToDmy, parseDmyToIso } from '../lib/formValidation';

function openNativePicker(native) {
  if (!native) return;
  if (typeof native.showPicker === 'function') {
    try {
      native.showPicker();
      return;
    } catch {
      /* fall through */
    }
  }
  native.focus();
  native.click();
}

/**
 * Text date field (DD/MM/YYYY) with hidden input for form POST (YYYY-MM-DD) and calendar picker.
 */
export function DateDmyInput({
  name,
  value = '',
  onChange,
  className = 'hms-input',
  required = false,
  id,
  placeholder = 'DD/MM/YYYY',
  autoComplete = 'off',
}) {
  const [dmy, setDmy] = useState(() => isoToDmy(value) || '');
  const nativeRef = useRef(null);

  useEffect(() => {
    setDmy(isoToDmy(value) || '');
  }, [value]);

  const isoValue = parseDmyToIso(dmy) || (/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : '');

  const handleChange = (ev) => {
    const next = formatDmyInput(ev.target.value);
    setDmy(next);
    const iso = parseDmyToIso(next);
    onChange?.(iso || '');
  };

  const handleNativeChange = (ev) => {
    const iso = ev.target.value;
    if (!iso) return;
    const next = isoToDmy(iso);
    setDmy(next);
    onChange?.(iso);
  };

  return (
    <div className="hms-dmy-date-field">
      {name ? <input type="hidden" name={name} value={isoValue} /> : null}
      <input
        type="text"
        id={id}
        inputMode="numeric"
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={className}
        value={dmy}
        onChange={handleChange}
        onDoubleClick={() => openNativePicker(nativeRef.current)}
        required={required}
      />
      <button
        type="button"
        className="hms-dmy-picker-btn"
        aria-label="Pick date"
        onClick={() => {
          if (nativeRef.current && !nativeRef.current.value && isoValue) {
            nativeRef.current.value = isoValue;
          }
          openNativePicker(nativeRef.current);
        }}
      >
        <i className="fa fa-calendar" aria-hidden="true" />
      </button>
      <input
        ref={nativeRef}
        type="date"
        className="hms-dmy-native-picker"
        tabIndex={-1}
        aria-hidden="true"
        value={isoValue}
        onChange={handleNativeChange}
      />
    </div>
  );
}
