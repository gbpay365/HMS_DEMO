'use strict';

const PASS = '12345';
const USERS = {
  cashier: 'Lariza',
  nurse: 'Ghong',
  doctor: 'Awelsa',
  lab: 'Sedrick',
  rad: 'Tef',
  pharm: 'Berinyuy',
};

function step(file, login, path, title, role, waitMs) {
  return { file, login, password: PASS, path, title, role, waitMs };
}

/** Workflow 1 — OPD: one patient through all clinical departments */
function buildOpdWorkflowPlan(ctx) {
  const p = ctx.opd;
  const pid = p.patientId;
  const vid = p.visitId;
  const prefix = 'opd';
  return {
    id: 'opd-e2e',
    title: 'OPD End-to-End Workflow',
    subtitle: `One patient journey: Cashier → Nurse → Doctor → Lab → Radiology → Pharmacy`,
    patient: p.label,
    patientId: pid,
    steps: [
      step(`${prefix}-01-login.png`, null, '/', 'Staff login screen', 'All', 4000),
      step(`${prefix}-02-cashier-portal.png`, USERS.cashier, '/portal/cashier', 'Cashier portal home', 'Cashier', 5000),
      step(`${prefix}-03-cashier-prepay.png`, USERS.cashier, `/cashier?prepay=1&patient_id=${pid}&service=consultation`, 'Issue consultation prepayment for patient', 'Cashier', 6000),
      step(`${prefix}-04-cashier-hub.png`, USERS.cashier, '/cashier?tab=pending', 'Cashier Command Center — pending payments', 'Cashier', 6000),
      step(`${prefix}-05-patient-chart.png`, USERS.nurse, `/patient-chart/${pid}`, 'Patient chart — demographics & history', 'Nurse', 6000),
      step(`${prefix}-06-opd-queue.png`, USERS.nurse, '/opd-queue', 'OPD queue — locate patient in triage/waiting', 'Nurse', 6000),
      step(`${prefix}-07-opd-triage.png`, USERS.nurse, `/opd-queue?q=${encodeURIComponent(p.label.split(' ')[0] || '')}`, 'OPD triage — vitals & queue status update', 'Nurse', 6000),
      step(`${prefix}-08-doctor-portal.png`, USERS.doctor, '/portal/doctor', 'Doctor portal — daily workload', 'Doctor', 5000),
      step(`${prefix}-09-doctor-queue.png`, USERS.doctor, '/opd-queue', 'Doctor OPD queue — patient waiting', 'Doctor', 6000),
      step(`${prefix}-10-consultation.png`, USERS.doctor, `/consultation-new?patient_id=${pid}${vid ? `&visit_id=${vid}` : ''}`, 'Start consultation — clinical notes & examination', 'Doctor', 7000),
      step(`${prefix}-11-cashier-opd.png`, USERS.cashier, '/cashier?tab=opd', 'Cashier OPD tab — pay lab/radiology/pharmacy orders', 'Cashier', 6000),
      step(`${prefix}-12-lab-portal.png`, USERS.lab, '/portal/lab', 'Laboratory portal', 'Lab Technician', 5000),
      step(`${prefix}-13-laboratory.png`, USERS.lab, '/laboratory', 'Laboratory registry — worklist', 'Lab Technician', 6000),
      step(`${prefix}-14-lab-validate.png`, USERS.lab, '/laboratory/validate', 'Validate LAB payment code at lab desk', 'Lab Technician', 6000),
      step(`${prefix}-15-lab-lims.png`, USERS.lab, '/lims', 'LIMS hub — requests & samples', 'Lab Technician', 6000),
      step(`${prefix}-16-lab-alerts.png`, USERS.lab, '/laboratory/order-alerts', 'Order alerts — doctor-ordered tests', 'Lab Technician', 6000),
      step(`${prefix}-17-rad-portal.png`, USERS.rad, '/portal/radiology', 'Radiology portal', 'Radiologist', 5000),
      step(`${prefix}-18-radiology.png`, USERS.rad, '/radiology', 'Radiology worklist — imaging studies', 'Radiologist', 6000),
      step(`${prefix}-19-pharm-portal.png`, USERS.pharm, '/portal/pharmacy', 'Pharmacy portal', 'Pharmacist', 5000),
      step(`${prefix}-20-pharmacy.png`, USERS.pharm, '/pharmacy', 'Pharmacy dispensing queue', 'Pharmacist', 6000),
      step(`${prefix}-21-chart-complete.png`, USERS.doctor, `/patient-chart/${pid}`, 'Patient chart — results & prescriptions complete', 'Doctor', 6000),
    ],
  };
}

/** Workflow 2 — IPD: admission through financial discharge */
function buildIpdWorkflowPlan(ctx) {
  const p = ctx.ipd;
  const pid = p.patientId;
  const aid = p.admissionId;
  const prefix = 'ipd';
  return {
    id: 'ipd-e2e',
    title: 'IPD Hospitalization Workflow',
    subtitle: 'Cashier deposit → Hospitalization → Bed assignment → Clinical discharge → Financial discharge',
    patient: p.label,
    patientId: pid,
    steps: [
      step(`${prefix}-01-cashier-prepay.png`, USERS.cashier, `/cashier?prepay=1&patient_id=${pid}&service=hospitalisation`, 'Cashier — IPD admission deposit / prepay', 'Cashier', 6000),
      step(`${prefix}-02-cashier-ipd-tab.png`, USERS.cashier, '/cashier?tab=ipd', 'Cashier IPD settlement tab', 'Cashier', 6000),
      step(`${prefix}-03-ipd-hub.png`, USERS.doctor, '/ipd', 'IPD hub — active hospitalizations', 'Doctor', 6000),
      step(`${prefix}-04-hospitalizations.png`, USERS.doctor, '/ipd/hospitalizations', 'Hospitalizations list', 'Doctor', 6000),
      step(`${prefix}-05-admission-detail.png`, USERS.doctor, `/ipd/hospitalization/${aid}`, 'Admission detail — care plan & running bill', 'Doctor', 7000),
      step(`${prefix}-06-running-bill.png`, USERS.cashier, `/ipd/running-bill/${aid}`, 'Running bill forecast', 'Cashier', 6000),
      step(`${prefix}-07-wards-board.png`, USERS.nurse, '/wards', 'Ward board — bed assignment & status', 'Nurse', 7000),
      step(`${prefix}-08-ward-rounds.png`, USERS.doctor, '/ipd/ward-rounds', 'Ward rounds — in-patient review', 'Doctor', 6000),
      step(`${prefix}-09-ipd-chart.png`, USERS.nurse, `/ipd/chart/${aid}`, 'IPD nursing chart', 'Nurse', 6000),
      step(`${prefix}-10-clinical-discharge.png`, USERS.doctor, `/ipd/discharge/${aid}`, 'Clinical discharge — doctor signs discharge summary', 'Doctor', 7000),
      step(`${prefix}-11-cashier-settle.png`, USERS.cashier, '/cashier?tab=ipd', 'Financial discharge — cashier IPD settlement', 'Cashier', 6000),
      step(`${prefix}-12-patient-chart.png`, USERS.doctor, `/patient-chart/${pid}`, 'Patient chart after IPD stay', 'Doctor', 6000),
    ],
  };
}

/** Workflow 3 — Maternity full module */
function buildMaternityWorkflowPlan(ctx) {
  const p = ctx.maternity;
  const pid = p.patientId;
  const mid = p.maternityId;
  const prefix = 'mat';
  return {
    id: 'maternity-e2e',
    title: 'Maternity Module Workflow',
    subtitle: 'ANC registration through labor, delivery, newborn & postnatal care',
    patient: p.label,
    patientId: pid,
    steps: [
      step(`${prefix}-01-maternity-hub.png`, USERS.nurse, '/maternity', 'Maternity dashboard & registry', 'Nurse', 6000),
      step(`${prefix}-02-patients-registry.png`, USERS.nurse, '/maternity/patients', 'Maternity patients registry', 'Nurse', 6000),
      step(`${prefix}-03-register.png`, USERS.nurse, `/maternity/register?patient_id=${pid}`, 'ANC registration / link HMS patient', 'Nurse', 6000),
      step(`${prefix}-04-chart-anc.png`, USERS.doctor, `/maternity/chart/${mid}?tab=anc`, 'Maternity chart — ANC visits', 'Doctor', 7000),
      step(`${prefix}-05-chart-risk.png`, USERS.doctor, `/maternity/chart/${mid}?tab=risk`, 'Risk assessment', 'Doctor', 6000),
      step(`${prefix}-06-chart-scans.png`, USERS.doctor, `/maternity/chart/${mid}?tab=scans`, 'Ultrasound & investigations', 'Doctor', 6000),
      step(`${prefix}-07-chart-labor.png`, USERS.doctor, `/maternity/chart/${mid}?tab=labor`, 'Labor admission', 'Doctor', 6000),
      step(`${prefix}-08-chart-delivery.png`, USERS.doctor, `/maternity/chart/${mid}?tab=delivery`, 'Delivery record', 'Doctor', 6000),
      step(`${prefix}-09-chart-newborn.png`, USERS.nurse, `/maternity/chart/${mid}?tab=newborn`, 'Newborn registration', 'Nurse', 6000),
      step(`${prefix}-10-chart-postnatal.png`, USERS.nurse, `/maternity/chart/${mid}?tab=postnatal`, 'Postnatal care', 'Nurse', 6000),
      step(`${prefix}-11-cashier-maternity.png`, USERS.cashier, `/cashier?prepay=1&patient_id=${pid}&service=maternity&maternity_id=${mid}`, 'Cashier — maternity billing / prepay', 'Cashier', 6000),
      step(`${prefix}-12-patient-chart.png`, USERS.doctor, `/patient-chart/${pid}`, 'HMS patient chart — maternity episode linked', 'Doctor', 6000),
    ],
  };
}

/** Workflow 4 — Emergency / A&E full pathway */
function buildEmergencyWorkflowPlan(ctx) {
  const p = ctx.emergency;
  const pid = p.patientId;
  const vid = p.visitId;
  const completedVid = p.completedVisitId || vid;
  const prefix = 'er';
  return {
    id: 'emergency-e2e',
    title: 'Emergency / A&E Workflow',
    subtitle: 'Registration → Triage → Doctor → Orders → Disposition → Cashier settlement',
    patient: p.label,
    patientId: pid,
    steps: [
      step(`${prefix}-01-emergency-board.png`, USERS.nurse, '/emergency', 'Emergency board — active A&E visits', 'Nurse', 6000),
      step(`${prefix}-02-er-kpi.png`, USERS.doctor, '/emergency/kpi?days=7', 'Emergency KPI dashboard', 'Doctor', 6000),
      step(`${prefix}-03-visit-chart.png`, USERS.nurse, `/emergency/visit/${vid}`, 'ER visit chart — triage & acuity', 'Nurse', 7000),
      step(`${prefix}-04-credit-tab.png`, USERS.doctor, `/emergency/credit-tab/${vid}`, 'ER credit tab — running charges', 'Doctor', 6000),
      step(`${prefix}-05-doctor-visit.png`, USERS.doctor, `/emergency/visit/${vid}`, 'Doctor assessment & orders on credit', 'Doctor', 7000),
      step(`${prefix}-06-lab-er.png`, USERS.lab, '/laboratory/order-alerts', 'Lab — emergency order alerts', 'Lab Technician', 6000),
      step(`${prefix}-07-rad-er.png`, USERS.rad, '/radiology', 'Radiology — emergency imaging worklist', 'Radiologist', 6000),
      step(`${prefix}-08-pharm-er.png`, USERS.pharm, '/pharmacy', 'Pharmacy — ER medication dispensing', 'Pharmacist', 6000),
      step(`${prefix}-09-disposition.png`, USERS.doctor, `/emergency/visit/${vid}`, 'Disposition — discharge / admit / transfer', 'Doctor', 7000),
      step(`${prefix}-10-cashier-er.png`, USERS.cashier, '/cashier?tab=emergency', 'Cashier — emergency retrospective billing', 'Cashier', 6000),
      step(`${prefix}-11-completed-visit.png`, USERS.nurse, `/emergency/visit/${completedVid}`, 'Completed ER visit — closure', 'Nurse', 6000),
      step(`${prefix}-12-patient-chart.png`, USERS.doctor, `/patient-chart/${pid}`, 'Patient chart — ER episode documented', 'Doctor', 6000),
    ],
  };
}

function buildAllWorkflowPlans(ctx) {
  return [
    buildOpdWorkflowPlan(ctx),
    buildIpdWorkflowPlan(ctx),
    buildMaternityWorkflowPlan(ctx),
    buildEmergencyWorkflowPlan(ctx),
  ];
}

module.exports = {
  buildAllWorkflowPlans,
  buildOpdWorkflowPlan,
  buildIpdWorkflowPlan,
  buildMaternityWorkflowPlan,
  buildEmergencyWorkflowPlan,
};
