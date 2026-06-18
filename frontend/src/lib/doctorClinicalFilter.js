function normClinicalLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseClinicalList(value) {
  if (Array.isArray(value)) {
    return value.map(normClinicalLabel).filter(Boolean);
  }
  const raw = String(value || '').trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(normClinicalLabel).filter(Boolean);
    } catch (_) {
      /* fall through */
    }
  }
  return raw.split(/[,;|]/).map(normClinicalLabel).filter(Boolean);
}

function uniqClinicalLabels(values) {
  const out = [];
  const seen = new Set();
  for (const label of values || []) {
    const norm = normClinicalLabel(label);
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out;
}

export function doctorClinicalDepartments(doc) {
  const fromArrays = [
    ...(Array.isArray(doc?.departments) ? doc.departments : []),
    ...parseClinicalList(doc?.departments_all),
  ];
  const legacy = normClinicalLabel(doc?.primary_department);
  if (legacy) fromArrays.unshift(legacy);
  return uniqClinicalLabels(fromArrays);
}

export function doctorClinicalSpecialisations(doc) {
  const fromArrays = [
    ...(Array.isArray(doc?.specialisations) ? doc.specialisations : []),
    ...parseClinicalList(doc?.specialisations_all),
  ];
  const legacy = normClinicalLabel(doc?.specialisation);
  if (legacy) fromArrays.unshift(legacy);
  return uniqClinicalLabels(fromArrays);
}

export function doctorMatchesDepartment(doc, departmentName) {
  const want = normClinicalLabel(departmentName).toLowerCase();
  if (!want) return true;
  return doctorClinicalDepartments(doc).some((label) => label.toLowerCase() === want);
}

function labelsMatchSpecialisation(label, want) {
  const l = normClinicalLabel(label).toLowerCase();
  const w = normClinicalLabel(want).toLowerCase();
  if (!l || !w) return false;
  return l === w || l.includes(w) || w.includes(l);
}

export function doctorMatchesSpecialisation(doc, specialisationName) {
  const want = normClinicalLabel(specialisationName);
  if (!want) return true;
  return doctorClinicalSpecialisations(doc).some((label) => labelsMatchSpecialisation(label, want));
}

export function filterDoctorsByDepartment(doctors, departmentName) {
  const want = normClinicalLabel(departmentName);
  if (!want) return doctors || [];
  return (doctors || []).filter((doc) => doctorMatchesDepartment(doc, want));
}

/** Appointment / portal booking: department pick matches assigned dept or same-named specialty. */
export function filterDoctorsForBookingDepartment(doctors, departmentName) {
  const want = normClinicalLabel(departmentName);
  if (!want) return doctors || [];
  return (doctors || []).filter(
    (doc) => doctorMatchesDepartment(doc, want) || doctorMatchesSpecialisation(doc, want)
  );
}

export function filterDoctorsBySpecialisation(doctors, specialisationName) {
  const want = normClinicalLabel(specialisationName);
  if (!want) return doctors || [];
  return (doctors || []).filter((doc) => doctorMatchesSpecialisation(doc, want));
}

export function filterDoctorsByClinicalCriteria(doctors, { department, specialisation } = {}) {
  let list = doctors || [];
  const dept = normClinicalLabel(department);
  const spec = normClinicalLabel(specialisation);
  if (dept) list = filterDoctorsByDepartment(list, dept);
  if (spec) list = filterDoctorsBySpecialisation(list, spec);
  return list;
}

const GENERAL_CONSULT_SPEC_PATTERNS = [
  /^general\s+medicine$/i,
  /^general\s+practitioner$/i,
  /^general\s+practice$/i,
  /^family\s+medicine$/i,
  /^internal\s+medicine$/i,
  /^primary\s+care$/i,
  /^gp$/i,
  /generalist/i,
  /^odp$/i,
  /^out\s*patient/i,
  /^outpatient/i,
];

const NON_PHYSICIAN_DEPT_PATTERNS = [/^nursing\b/i, /ward\s+service/i, /^general\s+medicine$/i];

function isGeneralConsultSpecialisation(spec) {
  const s = normClinicalLabel(spec).toLowerCase();
  if (!s) return false;
  return GENERAL_CONSULT_SPEC_PATTERNS.some((re) => re.test(s));
}

function clinicianSpecLabel(doc) {
  const specs = doctorClinicalSpecialisations(doc);
  if (specs.length) return specs[0];
  return normClinicalLabel(doc?.primary_department);
}

export function doctorMatchesGeneralConsultation(doc) {
  return doctorClinicalSpecialisations(doc).some((label) => isGeneralConsultSpecialisation(label))
    || isGeneralConsultSpecialisation(doc?.primary_department);
}

function isBroadConsultationService(name) {
  const n = normClinicalLabel(name).toLowerCase();
  return n === 'general consultation' || n === 'specialist consultation';
}

function isGeneralConsultationService(name) {
  const n = normClinicalLabel(name).toLowerCase();
  return n === 'general consultation' || /\bgeneral\s+consultation\b/.test(n);
}

function isSpecialistConsultationService(name) {
  const n = normClinicalLabel(name).toLowerCase();
  return n === 'specialist consultation' || /\bspecialist\s+consultation\b/.test(n);
}

function doctorFilterDepartment(serviceName, departmentName) {
  if (isBroadConsultationService(serviceName)) return '';
  const dept = normClinicalLabel(departmentName);
  if (!dept) return '';
  if (NON_PHYSICIAN_DEPT_PATTERNS.some((re) => re.test(dept))) return '';
  return dept;
}

export function filterDoctorsForCashierService(doctors, catalogItem, { specialistSpec = '' } = {}) {
  if (!catalogItem) return doctors || [];
  const name = catalogItem.name || '';
  if (isGeneralConsultationService(name)) {
    return (doctors || []).filter((doc) => doctorMatchesGeneralConsultation(doc));
  }
  if (isSpecialistConsultationService(name)) {
    const spec = normClinicalLabel(specialistSpec);
    if (!spec) return doctors || [];
    return filterDoctorsBySpecialisation(doctors, spec);
  }
  const dept = doctorFilterDepartment(name, catalogItem.department_name);
  return filterDoctorsByClinicalCriteria(doctors, { department: dept });
}

export function doctorOptionLabel(doc) {
  const depts = doctorClinicalDepartments(doc);
  const specs = doctorClinicalSpecialisations(doc);
  const bits = [];
  if (depts.length) bits.push(depts.join(', '));
  if (specs.length) bits.push(specs.join(', '));
  return bits.join(' · ');
}
