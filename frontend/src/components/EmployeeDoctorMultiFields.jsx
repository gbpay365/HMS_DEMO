import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

function toggleValue(list, value) {
  const key = value.toLowerCase();
  if (list.some((v) => v.toLowerCase() === key)) {
    return list.filter((v) => v.toLowerCase() !== key);
  }
  return [...list, value];
}

function expandClinicalLabel(value) {
  const label = String(value || '').trim();
  const key = label.toLowerCase().replace(/\s+/g, ' ').trim();
  if (
    key === 'hematology and oncology' ||
    key === 'haematology and oncology' ||
    key === 'hematology & oncology' ||
    key === 'haematology & oncology'
  ) {
    return ['Hematology', 'Oncology'];
  }
  if (
    key === 'hematologist and oncologist' ||
    key === 'haematologist and oncologist' ||
    key === 'hematologist & oncologist' ||
    key === 'haematologist & oncologist' ||
    key === 'hermatologist and oncologist' ||
    key === 'hermatologist & oncologist'
  ) {
    return ['Hematologist', 'Oncologist'];
  }
  return label ? [label] : [];
}

function normalizeClinicalList(values) {
  const out = [];
  const seen = new Set();
  (values || []).forEach((raw) => {
    expandClinicalLabel(raw).forEach((label) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(label);
    });
  });
  return out;
}

function syncHiddenInputs(formId, departments, specialisations, primaryDept, primarySpec, isDoctorRole) {
  if (!formId || typeof document === 'undefined') return;
  const form = document.getElementById(formId);
  if (!form) return;

  form.querySelectorAll('input[data-hms-doctor-multi]').forEach((el) => el.remove());

  const append = (name, value) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    input.dataset.hmsDoctorMulti = '1';
    form.appendChild(input);
  };

  const deptList = normalizeClinicalList(departments);
  const specList = normalizeClinicalList(specialisations);

  if (isDoctorRole) {
    deptList.forEach((d) => append('departments[]', d));
    append('departments_json', JSON.stringify(deptList));
    const deptHidden = form.querySelector('[name="primary_department"]');
    if (deptHidden) deptHidden.value = deptList[0] || primaryDept;
  }

  specList.forEach((s) => append('specialisations[]', s));
  append('specialisations_json', JSON.stringify(specList));

  const specHidden = form.querySelector('[name="specialisation"]');
  if (specHidden) specHidden.value = specList[0] || primarySpec || '';
}

function readDoctorRole(formId, doctorRoleIds) {
  if (!formId || typeof document === 'undefined') return false;
  const form = document.getElementById(formId);
  if (!form) return false;
  const roleEl = form.querySelector('[name="role"]');
  if (!roleEl) return false;
  return doctorRoleIds.includes(String(roleEl.value || ''));
}

/** Multi department + specialisation picker for doctor employees. */
export function EmployeeDoctorMultiFields({
  formId = 'hms-employee-form',
  doctorRoleIds = [],
  departments = [],
  specialisationsCatalog = [],
  initialDepartments = [],
  initialSpecialisations = [],
  deptWrapId = 'primaryDepartmentWrap',
  legacySpecWrapId = 'doctorSpecialisationWrap'}) {
  const roleIds = useMemo(() => (doctorRoleIds || []).map(String), [doctorRoleIds]);
  const deptOptions = useMemo(
    () => normalizeClinicalList((departments || []).map((d) => String(d.name || d).trim()).filter(Boolean)).sort(),
    [departments]
  );
  const specOptions = useMemo(
    () =>
      normalizeClinicalList((specialisationsCatalog || []).map((s) => String(s).trim()).filter(Boolean)).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      ),
    [specialisationsCatalog]
  );

  const [isDoctor, setIsDoctor] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState(() => normalizeClinicalList(initialDepartments || []));
  const [selectedSpecs, setSelectedSpecs] = useState(() => normalizeClinicalList(initialSpecialisations || []));
  const [newSpec, setNewSpec] = useState('');
  const [showNewSpec, setShowNewSpec] = useState(false);

  const primaryDept = selectedDepts[0] || '';
  const primarySpec = selectedSpecs[0] || '';

  useEffect(() => {
    if (!formId) return undefined;
    const form = document.getElementById(formId);
    if (!form) return undefined;
    const onRole = () => setIsDoctor(readDoctorRole(formId, roleIds));
    onRole();
    form.addEventListener('change', onRole);
    return () => form.removeEventListener('change', onRole);
  }, [formId, roleIds]);

  useEffect(() => {
    const deptWrap = document.getElementById(deptWrapId);
    const specWrap = document.getElementById(legacySpecWrapId);
    if (deptWrap) deptWrap.style.display = isDoctor ? 'none' : '';
    if (specWrap) {
      specWrap.style.display = 'none';
      specWrap.querySelectorAll('select, input[type="text"]').forEach((el) => {
        el.required = false;
        el.disabled = true;
      });
    }
  }, [isDoctor, deptWrapId, legacySpecWrapId]);

  useEffect(() => {
    syncHiddenInputs(formId, selectedDepts, selectedSpecs, primaryDept, primarySpec, isDoctor);
  }, [formId, selectedDepts, selectedSpecs, primaryDept, primarySpec, isDoctor]);

  useEffect(() => {
    if (!formId) return undefined;
    const form = document.getElementById(formId);
    if (!form) return undefined;
    const onSubmit = () => {
      const specWrap = document.getElementById(legacySpecWrapId);
      if (specWrap) {
        specWrap.querySelectorAll('select, input[type="text"]').forEach((el) => {
          el.required = false;
          el.disabled = true;
        });
      }
      syncHiddenInputs(formId, selectedDepts, selectedSpecs, primaryDept, primarySpec, isDoctor);
    };
    form.addEventListener('submit', onSubmit);
    return () => form.removeEventListener('submit', onSubmit);
  }, [formId, selectedDepts, selectedSpecs, primaryDept, primarySpec, legacySpecWrapId, isDoctor]);

  function addNewSpec() {
    const label = newSpec.trim();
    if (!label) return;
    setSelectedSpecs((prev) => normalizeClinicalList([...prev, ...expandClinicalLabel(label)]));
    setNewSpec('');
    setShowNewSpec(false);
  }


  const { t } = useTranslation('ops');

  return (
    <div className="col-12 space-y-4">
      {isDoctor ? (
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-ink">{t('forms.employeeDoctor.departments')}</div>
            <div className="text-xs text-slate-500">{t('forms.employeeDoctor.departments_hint')}</div>
          </div>
          <a
            href="/departments"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline-primary btn-sm"
            style={{ borderRadius: 8, fontSize: '0.75rem', fontWeight: 700 }}
          >
            <i className="fa fa-cog mr-1" aria-hidden="true" />
            {t('forms.employeeDoctor.manage')}
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          {deptOptions.map((dept) => {
            const active = selectedDepts.some((d) => d.toLowerCase() === dept.toLowerCase());
            const primary = selectedDepts[0]?.toLowerCase() === dept.toLowerCase();
            return (
              <button
                key={dept}
                type="button"
                onClick={() =>
                  setSelectedDepts((prev) => {
                    const next = toggleValue(prev, dept);
                    return next;
                  })
                }
                className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold transition ${
                  active
                    ? primary
                      ? 'border-brand bg-brand text-white shadow-sm'
                      : 'border-brand/40 bg-brand-light text-brand'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {dept}
                {primary ? ' ★' : ''}
              </button>
            );
          })}
        </div>
        {selectedDepts.length === 0 ? (
          <p className="mt-2 text-xs font-semibold text-amber-700">{t('forms.employeeDoctor.err_department')}</p>
        ) : null}
      </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-violet-50/40 to-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-ink">{t('forms.employeeDoctor.specialisations')}</div>
            <div className="text-xs text-slate-500">
              {isDoctor
                ? t('forms.employeeDoctor.specialisations_doctor_hint')
                : t('forms.employeeDoctor.specialisations_staff_hint')}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/departments?tab=specialisations"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-primary btn-sm"
              style={{ borderRadius: 8, fontSize: '0.75rem', fontWeight: 700 }}
            >
              <i className="fa fa-cog mr-1" aria-hidden="true" />
              {t('forms.employeeDoctor.manage')}
            </a>
            <button
              type="button"
              onClick={() => setShowNewSpec((v) => !v)}
              className="btn btn-outline-secondary btn-sm"
              style={{ borderRadius: 8, fontSize: '0.75rem', fontWeight: 700 }}
            >
              {t('forms.employeeDoctor.add_new')}
            </button>
          </div>
        </div>
        {showNewSpec ? (
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              type="text"
              value={newSpec}
              onChange={(e) => setNewSpec(e.target.value)}
              className="hms-input min-w-[200px] flex-1 text-sm"
              placeholder={t('forms.employeeDoctor.spec_ph')}
              maxLength={120}
            />
            <button type="button" onClick={addNewSpec} className="hms-btn-primary text-xs">
              {t('forms.employeeDoctor.add')}
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {[...new Set([...specOptions, ...selectedSpecs])].sort((a, b) => a.localeCompare(b)).map((spec) => {
            const active = selectedSpecs.some((s) => s.toLowerCase() === spec.toLowerCase());
            const primary = selectedSpecs[0]?.toLowerCase() === spec.toLowerCase();
            return (
              <button
                key={spec}
                type="button"
                onClick={() => setSelectedSpecs((prev) => toggleValue(prev, spec))}
                className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold transition ${
                  active
                    ? primary
                      ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                      : 'border-violet-300 bg-violet-50 text-violet-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {spec}
                {primary ? ' ★' : ''}
              </button>
            );
          })}
        </div>
        {selectedSpecs.length === 0 && isDoctor ? (
          <p className="mt-2 text-xs font-semibold text-amber-700">{t('forms.employeeDoctor.err_specialisation')}</p>
        ) : null}
        {selectedSpecs.length > 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            {t('forms.employeeDoctor.selected_hint', { list: selectedSpecs.join(', ') })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
