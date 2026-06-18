import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

function patientLabel(p) {
  const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Patient';
  const code = p.patient_code ? ` · ${p.patient_code}` : '';
  return `${name} (#P-${p.id}${code})`;
}

export function PatientAsyncSearchSelect({
  name = 'patient_id',
  id = 'patient-async-search',
  required = false,
  label,
  onPatientChange}) {
  const { t } = useTranslation('ops');
  const fieldLabel = label ?? t('shared.patient');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [matches, setMatches] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    function onDoc(ev) {
      if (wrapRef.current && !wrapRef.current.contains(ev.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (selectedId && selectedPatient) return;
    const q = query.trim();
    if (q.length < 2) {
      setMatches([]);
      setLoading(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`, { credentials: 'same-origin' });
        const rows = await res.json();
        setMatches(Array.isArray(rows) ? rows : []);
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(debounceRef.current);
  }, [query, selectedId, selectedPatient]);

  function pick(p) {
    const pid = String(p.id);
    setSelectedId(pid);
    setSelectedPatient(p);
    setQuery(patientLabel(p));
    setOpen(false);
    setMatches([]);
    onPatientChange?.(pid);
  }

  function clear() {
    setSelectedId('');
    setSelectedPatient(null);
    setQuery('');
    setMatches([]);
    setOpen(true);
    onPatientChange?.('');
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className="mb-1 block text-xs font-bold text-slate-600" htmlFor={id}>
        {fieldLabel} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <input type="hidden" name={name} value={selectedId} required={required} />
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
        <input
          id={id}
          type="search"
          className="hms-input w-full pl-9 pr-9"
          value={query}
          onChange={(ev) => {
            setQuery(ev.target.value);
            setSelectedId('');
            setSelectedPatient(null);
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
      {open && !selectedId ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-slate-500">{t('patients.searching')}</div>
          ) : null}
          {!loading && query.trim().length < 2 ? (
            <div className="px-3 py-2 text-xs text-slate-500">
              {t('patients.search_min_chars')}
            </div>
          ) : null}
          {!loading && query.trim().length >= 2 && matches.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">{t('patients.search_no_match')}</div>
          ) : null}
          {!loading && matches.length > 0 ? (
            <ul className="max-h-56 overflow-auto py-1">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-red-50"
                    onClick={() => pick(p)}
                  >
                    <div className="font-semibold text-slate-900">
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
        </div>
      ) : null}
    </div>
  );
}
