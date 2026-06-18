'use strict';

const ROLE_LABELS = {
  '1': 'Admin',
  '2': 'Doctor',
  '3': 'Front Desk',
  '4': 'Lab Technician',
  '5': 'Pharmacist',
  '6': 'Radiology',
  '7': 'Nurse',
  '8': 'Nursing Aid',
  '9': 'Accountant',
  '10': 'Cashier',
  '11': 'Cashier',
  '12': 'Nurse Aid',
  '99': 'Super Admin',
};

const WORKFLOW_CARDS = [
  {
    id: 'opd',
    short: 'OPD',
    title: 'Outpatient Department',
    description:
      'Front Desk registration, Cashier consultation fee, then Front Desk OPD queue — followed by Nurse triage, Doctor consultation, Lab/Radiology, Pharmacy, and discharge.',
    icon: 'fa-stethoscope',
    color: '#1a6bd8',
    bg: '#dbeafe',
    rolesLabel: 'Front Desk · Cashier · Nurse · Doctor · Lab · Pharmacy',
  },
  {
    id: 'ipd',
    short: 'IPD',
    title: 'Inpatient Department',
    description:
      'Doctor admission request, Cashier deposit, ADT bed assignment, ward nursing, daily rounds, Clinical Discharge, Financial Discharge.',
    icon: 'fa-bed',
    color: '#7c3aed',
    bg: '#ede9fe',
    rolesLabel: 'Cashier · Front Desk · ADT · Doctor · Nurse · Lab · Pharmacy',
  },
  {
    id: 'emg',
    short: 'Emergency',
    title: 'Emergency / A&E',
    description:
      'Prepayment bypassed. Rapid Front Desk registration, concurrent Nurse vitals + Doctor treatment, retrospective bill settlement.',
    icon: 'fa-ambulance',
    color: '#ef4444',
    bg: '#fee2e2',
    rolesLabel: 'Front Desk · Doctor · Nurse · Lab · Pharmacy · Cashier',
  },
];

const STEPS = {
  opd: [
    ['1', 'Cashier', '10,11', 'Collect consultation fee. Issue receipt to patient.', 'Billing / Cashier', 'cashier.write'],
    ['2', 'Front Desk', '3', 'Register patient. Add to OPD Queue under correct department.', 'OPD Queue › Add Visit', 'opd.write, patient.write'],
    ['3', 'Nurse / Nursing Aid', '7,8', 'Select patient. Record vitals: BP, Temp, Weight, SpO2, Pulse. Status → Waiting Doctor.', 'OPD Queue › Triage', 'nursing.write, opd.write'],
    ['4', 'Doctor', '2', 'Open consultation. Record notes, diagnosis, orders (lab/imaging/prescriptions).', 'OPD Queue › Consultation', 'consult.write, clinical.write'],
    ['5', 'Cashier', '10,11', 'Patient pays for all investigation and medication orders before processing.', 'Billing / Cashier', 'cashier.write'],
    ['6', 'Lab Technician', '4', 'Run tests ordered. Upload results to patient chart. To edit the lab service catalog: Settings → Access Control → grant Laboratory catalog view/manage permissions.', 'Lab Results Module · Service Catalog', 'lab.write, service_catalog.laboratory.read, service_catalog.laboratory.write'],
    ['7', 'Radiologist', '6', 'Perform imaging. Upload radiology reports to patient chart.', 'Radiology Module', 'radiology.write'],
    ['8', 'Pharmacist', '5', 'Dispense paid prescriptions. Record in system.', 'Pharmacy / Prescriptions', 'pharmacy.write'],
    ['9', 'Doctor', '2', 'Review results. Finalize diagnosis. Mark visit Completed.', 'OPD Queue › Complete', 'consult.write'],
  ],
  ipd: [
    ['1', 'Doctor', '2', 'Decide patient needs hospitalization. Issue admission request with admitting diagnosis.', 'Consultation › Admit Patient', 'consult.write, adt.write'],
    ['2', 'Cashier', '10,11', 'Collect admission deposit. System opens a running credit tab for all future charges.', 'Billing / Cashier', 'cashier.write'],
    ['3', 'Front Desk / ADT', '3', 'Assign patient to a ward and bed. System marks bed as Occupied.', 'ADT Board / Ward Board', 'adt.write'],
    ['4', 'Nurse / Nursing Aid', '7,8', 'Receive patient. Record baseline vitals. Execute care plan and administer medications.', 'Nurse Station / ADT Board', 'nursing.write, adt.read'],
    ['5', 'Doctor', '2', 'Daily ward rounds. Update clinical notes. Issue new orders as needed.', 'Patient Chart / ADT Board', 'clinical.write, consult.write'],
    ['6', 'Lab Tech / Radiologist', '4,6', 'Process investigation orders. Upload results. Costs auto-added to running bill.', 'Lab & Radiology Modules', 'lab.write, radiology.write'],
    ['7', 'Pharmacist', '5', 'Dispense medications to ward. Costs added to running bill.', 'Pharmacy / Prescriptions', 'pharmacy.write'],
    ['8', 'Doctor', '2', 'Issue Clinical Discharge when patient is medically fit. Write discharge summary.', 'ADT Board › Clinical Discharge', 'adt.write, clinical.write'],
    ['9', 'Cashier', '10,11', 'Present final bill. Settle all charges. Issue receipt. Mark Financially Discharged. Bed freed.', 'Billing / Cashier', 'cashier.write, billing.write'],
    ['10', 'Front Desk / ADT', '3', 'Confirm patient has physically left. Bed status → Available.', 'ADT Board', 'adt.write'],
  ],
  emg: [
    ['1', 'Front Desk', '3', 'Rapid registration. Tick "Emergency / Waiver". No prepayment — billing exception created automatically.', 'OPD Queue › Add Visit', 'opd.write, patient.write'],
    ['2', 'System (Auto)', '', 'Visit auto-assigned to Emergency/A&E. Status → Waiting Doctor. Emergency widget updates on all dashboards.', 'OPD Queue (automatic)', '—'],
    ['3', 'Nurse / Nursing Aid', '7,8', 'Record vitals immediately and continuously: BP, Temp, SpO2, Pulse, GCS. Concurrent with Doctor.', 'OPD Queue › Vitals', 'nursing.write'],
    ['4', 'Doctor', '2', 'Immediate assessment. Administer treatment. Issue rapid orders (IV, bloods, imaging, meds) on credit tab.', 'OPD Queue › Consultation', 'consult.write'],
    ['5', 'Lab Tech / Radiologist', '4,6', 'Process urgent investigations. Upload results immediately to chart.', 'Lab & Radiology Modules', 'lab.write, radiology.write'],
    ['6', 'Pharmacist', '5', 'Dispense emergency medications. Costs added to credit tab.', 'Pharmacy', 'pharmacy.write'],
    ['7', 'Doctor', '2', 'Once stabilized: (a) Admit → IPD process, or (b) Discharge. Document disposition.', 'ADT Board / Consultation', 'adt.write, consult.write'],
    ['8', 'Cashier', '10,11', 'Present retrospective bill to family. Settle all emergency charges. Issue receipt.', 'Billing / Cashier', 'cashier.write, billing.write'],
  ],
};

function isAdminRole(role) {
  const r = String(role || '');
  return r === '1' || r === '99';
}

function roleLabel(role) {
  return ROLE_LABELS[String(role || '')] || (role ? `Role ${role}` : null);
}

function parseRoleIds(roleIdsField) {
  if (roleIdsField == null || String(roleIdsField).trim() === '') return [];
  return String(roleIdsField)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function stepIncludesRole(step, role) {
  const ids = parseRoleIds(step.roleIds);
  if (!ids.length) return false;
  return ids.indexOf(String(role)) !== -1;
}

/** Role-scoped: only steps for this user; exclude system/auto rows without a staff role. */
function filterStepsForRole(steps, role) {
  const r = String(role || '');
  return (steps || []).filter((step) => {
    if (!step.roleIds || String(step.roleIds).trim() === '') return false;
    if (/^system/i.test(String(step.roleLabel || ''))) return false;
    return stepIncludesRole(step, r);
  });
}

function stepsToObjects(rawRows) {
  return (rawRows || []).map((row) => ({
    num: row[0],
    roleLabel: row[1],
    roleIds: row[2],
    action: row[3],
    module: row[4],
    perms: row[5],
  }));
}

function resolveStepsCatalog(options = {}) {
  const db = options.dbWorkflow && options.dbWorkflow.steps;
  if (db && (db.opd?.length || db.ipd?.length)) {
    return {
      opd: db.opd || [],
      ipd: db.ipd || [],
      emg: db.emg && db.emg.length ? db.emg : stepsToObjects(STEPS.emg),
    };
  }
  return {
    opd: stepsToObjects(STEPS.opd),
    ipd: stepsToObjects(STEPS.ipd),
    emg: stepsToObjects(STEPS.emg),
  };
}

function workflowsForRole(role, scope, stepsCatalog) {
  const r = String(role || '');
  if (scope === 'full' || isAdminRole(r)) {
    return WORKFLOW_CARDS.filter((wf) => (stepsCatalog[wf.id] || []).length > 0);
  }
  return WORKFLOW_CARDS.filter((wf) => {
    const steps = stepsCatalog[wf.id] || [];
    return filterStepsForRole(steps, r).length > 0;
  });
}

function buildGuideContext(role, options = {}) {
  const r = String(role || '');
  const scope = isAdminRole(r) ? 'full' : 'role';
  const stepsCatalog = resolveStepsCatalog(options);
  const workflows = workflowsForRole(r, scope, stepsCatalog);
  const stepsByWorkflow = {};
  const fromDb = !!(options.dbWorkflow && options.dbWorkflow.steps);
  for (const wf of workflows) {
    const all = stepsCatalog[wf.id] || [];
    const list = scope === 'full' ? all : filterStepsForRole(all, r);
    stepsByWorkflow[wf.id] = list.map((step, idx) => ({
      ...step,
      num: scope === 'full' ? step.num : String(idx + 1),
    }));
  }
  const defaultWorkflowId =
    options.preferWorkflow && workflows.some((w) => w.id === options.preferWorkflow)
      ? options.preferWorkflow
      : workflows[0]?.id || 'opd';

  const portalLabel = roleLabel(r);
  const heroSubtitle =
    scope === 'full'
      ? 'Step-by-step process guides for OPD, Inpatient, and Emergency workflows — betterplanning Ltd'
      : portalLabel
        ? `Steps for your role (${portalLabel}) in each clinical workflow — betterplanning Ltd Platform`
        : 'Steps for your role in each clinical workflow — betterplanning Ltd Platform';

  return {
    guidesScope: scope,
    showSystemModules: scope === 'full',
    showComparisonTable: scope === 'full',
    showPermissionsSummary: scope === 'full',
    showAllWorkflowCards: scope === 'full' || workflows.length > 1,
    workflowSource: fromDb ? 'database' : 'builtin',
    userRole: r,
    myRoleLabel: roleLabel(r),
    workflows,
    stepsByWorkflow,
    defaultWorkflowId,
    heroSubtitle,
  };
}

module.exports = {
  ROLE_LABELS,
  WORKFLOW_CARDS,
  STEPS,
  isAdminRole,
  roleLabel,
  buildGuideContext,
  filterStepsForRole,
  stepIncludesRole,
};
