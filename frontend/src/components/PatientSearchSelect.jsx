import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

function patientLabel(p, t) {
  const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || t('shared.patient', { ns: 'ops' });
  const code = p.patient_code ? ` · ${p.patient_code}` : '';
  return `${name} (#P-${p.id}${code})`;
}

function patientHaystack(p) {
  return [p.id, p.first_name, p.last_name, p.patient_code, p.phone]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function PatientSearchSelect({
  patients = [],
  name = 'patient_id',
  id = 'patient-search',
  required = false,
  initialPatientId = '',
  label,
  onPatientChange}) {
  const { t } = useTranslation('ops');
  const fieldLabel = label ?? t('shared.patient');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const pid = String(initialPatientId || '');
    setSelectedId(pid);
    if (pid) {
      const p = patients.find((x) => String(x.id) === pid);
      setQuery(p ? patientLabel(p, t) : '');
    } else {
      setQuery('');
    }
    setOpen(false);
  }, [initialPatientId, patients, t]);

  const selected = useMemo(
    () => patients.find((p) => String(p.id) === String(selectedId)) || null,
    [patients, selectedId]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (selected && query === patientLabel(selected, t)) {
      return [];
    }
    if (!q) return patients.slice(0, 12);
    return patients.filter((p) => patientHaystack(p).includes(q)).slice(0, 12);
  }, [patients, query, selected, t]);

  useEffect(() => {
    function onDoc(ev) {
      if (wrapRef.current && !wrapRef.current.contains(ev.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(p) {
    const pid = String(p.id);
    setSelectedId(pid);
    setQuery(patientLabel(p, t));
    setOpen(false);
    onPatientChange?.(pid);
  }

  function clear() {
    setSelectedId('');
    setQuery('');
    setOpen(true);
    onPatientChange?.('');
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className="hms-label" htmlFor={id}>
        {fieldLabel} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <input type="hidden" name={name} value={selectedId} required={required} />
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
        <input
          id={id}
          type="search"
          className="hms-input pl-9 pr-9"
          value={query}
          onChange={(ev) => {
            setQuery(ev.target.value);
            setSelectedId('');
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t('patients.search_select_ph')}
          autoComplete="off"
          required={required && !selectedId}
        />
        {selectedId ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-xs font-bold text-slate-400 hover:text-red-600"
            onClick={clear}
            aria-label={t('aria.clear_patient', { ns: 'common' })}
          >
            ✕
          </button>
        ) : null}
      </div>
      {open && !selectedId && matches.length > 0 ? (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-light"
                onClick={() => pick(p)}
              >
                <div className="font-semibold text-ink">
                  {p.first_name} {p.last_name}
                </div>
                <div className="text-xs text-slate-500">
                  #P-{p.id}
                  {p.patient_code ? ` · ${p.patient_code}` : ''}
                  {p.phone ? ` · ${p.phone}` : ''}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && !selectedId && query.trim() && matches.length === 0 ? (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-lg">
          {t('patients.search_no_match')}
        </div>
      ) : null}
    </div>
  );
}
