import { useEffect, useState } from 'react';
import { formatDmyInput, isoToDmy, parseDmyToIso } from '../lib/formValidation';

/**
 * Text date field (DD/MM/YYYY) with hidden input for form POST (YYYY-MM-DD).
 */
export function DateDmyInput({
  name,
  value = '',
  onChange,
  className = 'hms-input',
  required = false,
  id,
  placeholder = 'DD/MM/YYYY',
  autoComplete = 'off'}) {
  const [dmy, setDmy] = useState(() => isoToDmy(value) || '');

  useEffect(() => {
    setDmy(isoToDmy(value) || '');
  }, [value]);

  const isoValue = parseDmyToIso(dmy) || ( /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : '');

  const handleChange = (ev) => {
    const next = formatDmyInput(ev.target.value);
    setDmy(next);
    const iso = parseDmyToIso(next);
    onChange?.(iso || '');
  };

  return (
    <>
      <input type="hidden" name={name} value={isoValue} />
      <input
        type="text"
        id={id}
        inputMode="numeric"
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={className}
        value={dmy}
        onChange={handleChange}
        required={required}
      />
    </>
  );
}
