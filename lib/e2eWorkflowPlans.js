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

/**
 * @param {string} phase login | task | logout
 */
function step(file, login, path, title, role, explanation, phase, waitMs = 5500) {
  return {
    file,
    login,
    password: login ? PASS : null,
    path,
    title,
    role,
    explanation,
    phase: phase || 'task',
    waitMs,
  };
}

function logout(file, login, role, explanation) {
  return step(
    file,
    login,
    '/logout',
    `Sign out — ${role} (${login})`,
    role,
    explanation || `Click Sign out in the top menu to end the ${role} session on shared workstations.`,
    'logout',
    4500
  );
}

function loginScreen(file, explanation) {
  return step(
    file,
    null,
    '/',
    'Staff login screen',
    'All staff',
    explanation || 'Open the HMS URL. Enter your username (not case-sensitive) and password, then click Sign in.',
    'login',
    4000
  );
}

/** Workflow 1 — OPD: one patient through Cashier → Nurse → Doctor → Lab → Rad → Pharmacy */
function buildOpdWorkflowPlan(ctx) {
  const p = ctx.opd;
  const pid = p.patientId;
  const vid = p.visitId;
  const name = p.label;
  const q = encodeURIComponent(name.split(' ')[0] || '');
  const prefix = 'opd';
  const consult = `/consultation-new?patient_id=${pid}${vid ? `&visit_id=${vid}` : ''}`;

  return {
    id: 'opd-e2e',
    title: 'OPD End-to-End Workflow',
    subtitle: 'One patient: Cashier → Nurse → Doctor → Cashier (orders) → Lab → Radiology → Pharmacy → Doctor (complete)',
    patient: name,
    patientId: pid,
    credentials: USERS,
    steps: [
      loginScreen(
        `${prefix}-01-login.png`,
        `This workflow follows patient <strong>${name}</strong> (ID ${pid}) through outpatient care. Start at the login screen.`
      ),

      step(`${prefix}-02-cashier-portal.png`, USERS.cashier, '/portal/cashier', 'Cashier — sign in & open portal', 'Cashier', `Login as <strong>${USERS.cashier}</strong> / ${PASS}. You land on the Cashier portal with shortcuts to Command Center, wallets, and billing.`, 'login', 5000),
      step(`${prefix}-03-cashier-prepay.png`, USERS.cashier, `/cashier?prepay=1&patient_id=${pid}&service=consultation`, 'Cashier — issue consultation prepayment', 'Cashier', `Open <strong>Issue payment</strong> for patient ${name}. Select consultation service, choose payment method, and collect the consultation fee before OPD queue.`, 'task', 6500),
      step(`${prefix}-04-cashier-hub.png`, USERS.cashier, '/cashier?tab=pending', 'Cashier — pending payments queue', 'Cashier', 'Review the Pending tab for tickets awaiting collection. Print receipt and give the patient any payment codes for later department visits.', 'task', 6000),
      logout(`${prefix}-05-cashier-logout.png`, USERS.cashier, 'Cashier', 'Cashier signs out after collecting the consultation fee. Patient proceeds to OPD queue / nursing triage.'),

      loginScreen(`${prefix}-06-login-nurse.png`, `Next user: Nurse <strong>${USERS.nurse}</strong>. Sign in to continue the same patient journey.`),
      step(`${prefix}-07-nurse-portal.png`, USERS.nurse, '/portal/nurse', 'Nurse — sign in & open portal', 'Nurse', `Login as <strong>${USERS.nurse}</strong>. Open OPD triage and vitals shortcuts from the Nurse portal.`, 'login', 5000),
      step(`${prefix}-08-patient-chart.png`, USERS.nurse, `/patient-chart/${pid}`, 'Nurse — patient chart review', 'Nurse', `Open the chart for <strong>${name}</strong>. Confirm demographics, allergies, and prior visits before triage.`, 'task', 6000),
      step(`${prefix}-09-opd-queue.png`, USERS.nurse, '/opd-queue', 'Nurse — OPD queue', 'Nurse', 'Locate the patient on the OPD queue. Status should progress from Registered → Triage → Waiting for doctor.', 'task', 6000),
      step(`${prefix}-10-opd-triage.png`, USERS.nurse, `/opd-queue?q=${q}`, 'Nurse — triage & vitals', 'Nurse', 'Record chief complaint, priority, and vital signs (BP, pulse, temperature, SpO₂). Move patient to <em>Waiting for doctor</em>.', 'task', 6000),
      logout(`${prefix}-11-nurse-logout.png`, USERS.nurse, 'Nurse', 'Nurse signs out after triage. Patient waits for the consulting doctor.'),

      loginScreen(`${prefix}-12-login-doctor.png`, `Doctor <strong>${USERS.doctor}</strong> signs in for the consultation phase.`),
      step(`${prefix}-13-doctor-portal.png`, USERS.doctor, '/portal/doctor', 'Doctor — sign in & open portal', 'Doctor', `Login as <strong>${USERS.doctor}</strong>. Review OPD queue KPIs and open consultations.`, 'login', 5000),
      step(`${prefix}-14-doctor-queue.png`, USERS.doctor, '/opd-queue', 'Doctor — OPD queue', 'Doctor', `Select <strong>${name}</strong> from the queue and start the consultation.`, 'task', 6000),
      step(`${prefix}-15-consultation.png`, USERS.doctor, consult, 'Doctor — consultation & orders', 'Doctor', 'Document history and examination. Add laboratory tests, imaging, and prescriptions. Save consultation — patient must pay orders at Cashier before Lab/Rad/Pharmacy.', 'task', 7500),
      logout(`${prefix}-16-doctor-logout.png`, USERS.doctor, 'Doctor', 'Doctor signs out after placing orders. Patient returns to Cashier for order payment.'),

      loginScreen(`${prefix}-17-login-cashier2.png`, `Cashier <strong>${USERS.cashier}</strong> signs in again to collect payment for doctor orders.`),
      step(`${prefix}-18-cashier-opd.png`, USERS.cashier, '/cashier?tab=opd', 'Cashier — OPD order payment', 'Cashier', `Pay lab, radiology, and pharmacy lines for <strong>${name}</strong>. Issue LAB/RAD/PHARM codes on the receipt.`, 'task', 6500),
      logout(`${prefix}-19-cashier-logout2.png`, USERS.cashier, 'Cashier', 'Cashier signs out. Patient visits Lab, Radiology, and Pharmacy with payment codes.'),

      loginScreen(`${prefix}-20-login-lab.png`, `Lab Technician <strong>${USERS.lab}</strong> processes paid laboratory orders.`),
      step(`${prefix}-21-lab-portal.png`, USERS.lab, '/portal/lab', 'Lab — sign in & portal', 'Lab Technician', `Login as <strong>${USERS.lab}</strong>.`, 'login', 5000),
      step(`${prefix}-22-laboratory.png`, USERS.lab, '/laboratory', 'Lab — registry worklist', 'Lab Technician', 'Open the laboratory registry for pending and in-progress tests.', 'task', 6000),
      step(`${prefix}-23-lab-validate.png`, USERS.lab, '/laboratory/validate', 'Lab — validate payment code', 'Lab Technician', 'Scan or enter the LAB code from the patient receipt. Confirm paid status before entering results.', 'task', 6000),
      step(`${prefix}-24-lab-alerts.png`, USERS.lab, '/laboratory/order-alerts', 'Lab — doctor order alerts', 'Lab Technician', 'Review alerts for doctor-ordered tests. Open template workbench and finalize results.', 'task', 6000),
      logout(`${prefix}-25-lab-logout.png`, USERS.lab, 'Lab Technician', 'Lab signs out after finalizing results on the patient chart.'),

      loginScreen(`${prefix}-26-login-rad.png`, `Radiologist <strong>${USERS.rad}</strong> performs imaging and reporting.`),
      step(`${prefix}-27-rad-portal.png`, USERS.rad, '/portal/radiology', 'Radiologist — sign in & portal', 'Radiologist', `Login as <strong>${USERS.rad}</strong>.`, 'login', 5000),
      step(`${prefix}-28-radiology.png`, USERS.rad, '/radiology', 'Radiologist — imaging worklist', 'Radiologist', 'Open paid imaging studies for the patient. Enter findings and finalize the radiology report.', 'task', 6500),
      logout(`${prefix}-29-rad-logout.png`, USERS.rad, 'Radiologist', 'Radiologist signs out after report finalization.'),

      loginScreen(`${prefix}-30-login-pharm.png`, `Pharmacist <strong>${USERS.pharm}</strong> dispenses paid prescriptions.`),
      step(`${prefix}-31-pharm-portal.png`, USERS.pharm, '/portal/pharmacy', 'Pharmacist — sign in & portal', 'Pharmacist', `Login as <strong>${USERS.pharm}</strong>.`, 'login', 5000),
      step(`${prefix}-32-pharmacy.png`, USERS.pharm, '/pharmacy', 'Pharmacist — dispensing queue', 'Pharmacist', `Locate <strong>${name}</strong> prescription. Verify payment, dispense medications, and counsel the patient.`, 'task', 6500),
      logout(`${prefix}-33-pharm-logout.png`, USERS.pharm, 'Pharmacist', 'Pharmacist signs out after dispensing.'),

      loginScreen(`${prefix}-34-login-doctor2.png`, `Doctor <strong>${USERS.doctor}</strong> returns to review results and complete the visit.`),
      step(`${prefix}-35-chart-complete.png`, USERS.doctor, `/patient-chart/${pid}`, 'Doctor — review & complete visit', 'Doctor', 'Review lab results, imaging reports, and dispensing on the patient chart. Mark OPD visit Completed.', 'task', 6500),
      logout(`${prefix}-36-doctor-logout2.png`, USERS.doctor, 'Doctor', 'Doctor signs out. OPD visit for this patient is complete.'),
    ],
  };
}

/** Workflow 2 — IPD: Cashier → admission → bed → clinical discharge → financial discharge */
function buildIpdWorkflowPlan(ctx) {
  const p = ctx.ipd;
  const pid = p.patientId;
  const aid = p.admissionId;
  const name = p.label;
  const prefix = 'ipd';

  return {
    id: 'ipd-e2e',
    title: 'IPD Hospitalization Workflow',
    subtitle: 'Cashier deposit → Hospitalization → Bed assignment → Ward care → Clinical discharge → Financial discharge',
    patient: name,
    patientId: pid,
    admissionId: aid,
    credentials: USERS,
    steps: [
      loginScreen(`${prefix}-01-login.png`, `IPD workflow for <strong>${name}</strong> (patient ID ${pid}, admission ID ${aid}).`),

      step(`${prefix}-02-cashier-portal.png`, USERS.cashier, '/portal/cashier', 'Cashier — sign in', 'Cashier', `Login as <strong>${USERS.cashier}</strong> to collect the admission deposit.`, 'login', 5000),
      step(`${prefix}-03-cashier-prepay.png`, USERS.cashier, `/cashier?prepay=1&patient_id=${pid}&service=hospitalisation`, 'Cashier — IPD admission deposit', 'Cashier', 'Collect admission deposit / prepayment. This opens a running credit tab for ward charges.', 'task', 6500),
      step(`${prefix}-04-cashier-ipd-tab.png`, USERS.cashier, '/cashier?tab=ipd', 'Cashier — IPD payment tab', 'Cashier', 'Monitor IPD accounts awaiting interim or final settlement.', 'task', 6000),
      logout(`${prefix}-05-cashier-logout.png`, USERS.cashier, 'Cashier', 'Cashier signs out after deposit. ADT assigns bed after payment.'),

      loginScreen(`${prefix}-06-login-doctor.png`, `Doctor <strong>${USERS.doctor}</strong> manages admission and ward rounds.`),
      step(`${prefix}-07-doctor-portal.png`, USERS.doctor, '/portal/doctor', 'Doctor — sign in & portal', 'Doctor', `Login as <strong>${USERS.doctor}</strong>.`, 'login', 5000),
      step(`${prefix}-08-ipd-hub.png`, USERS.doctor, '/ipd', 'Doctor — IPD hub', 'Doctor', 'Review active hospitalizations and census KPIs.', 'task', 6000),
      step(`${prefix}-09-hospitalizations.png`, USERS.doctor, '/ipd/hospitalizations', 'Doctor — hospitalizations list', 'Doctor', `Locate admission for <strong>${name}</strong>.`, 'task', 6000),
      step(`${prefix}-10-admission-detail.png`, USERS.doctor, `/ipd/hospitalization/${aid}`, 'Doctor — admission detail', 'Doctor', 'Review admitting diagnosis, orders, and running bill forecast.', 'task', 7000),
      step(`${prefix}-11-ward-rounds.png`, USERS.doctor, '/ipd/ward-rounds', 'Doctor — ward rounds', 'Doctor', 'Document daily ward round notes and update care plan.', 'task', 6000),
      logout(`${prefix}-12-doctor-logout.png`, USERS.doctor, 'Doctor', 'Doctor signs out after clinical review.'),

      loginScreen(`${prefix}-13-login-nurse.png`, `Nurse <strong>${USERS.nurse}</strong> assigns bed and provides ward care.`),
      step(`${prefix}-14-nurse-portal.png`, USERS.nurse, '/portal/nurse', 'Nurse — sign in & portal', 'Nurse', `Login as <strong>${USERS.nurse}</strong>.`, 'login', 5000),
      step(`${prefix}-15-wards-board.png`, USERS.nurse, '/wards', 'Nurse — ward & bed board', 'Nurse', 'Assign patient to ward and bed. Bed status changes to Occupied.', 'task', 7000),
      step(`${prefix}-16-ipd-chart.png`, USERS.nurse, `/ipd/chart/${aid}`, 'Nurse — IPD nursing chart', 'Nurse', 'Record nursing care, vitals, and medication administration.', 'task', 6000),
      logout(`${prefix}-17-nurse-logout.png`, USERS.nurse, 'Nurse', 'Nurse signs out after ward documentation.'),

      loginScreen(`${prefix}-18-login-doctor-discharge.png`, `Doctor signs clinical discharge when patient is fit for release.`),
      step(`${prefix}-19-doctor-portal-discharge.png`, USERS.doctor, '/portal/doctor', 'Doctor — sign in', 'Doctor', `Login as <strong>${USERS.doctor}</strong>.`, 'login', 5000),
      step(`${prefix}-20-clinical-discharge.png`, USERS.doctor, `/ipd/discharge/${aid}`, 'Doctor — clinical discharge', 'Doctor', 'Complete discharge summary and sign clinical discharge. Enables financial settlement.', 'task', 7000),
      logout(`${prefix}-21-doctor-logout2.png`, USERS.doctor, 'Doctor', 'Doctor signs out after clinical discharge.'),

      loginScreen(`${prefix}-22-login-cashier-settle.png`, `Cashier settles the final IPD bill.`),
      step(`${prefix}-23-cashier-portal-settle.png`, USERS.cashier, '/portal/cashier', 'Cashier — sign in', 'Cashier', `Login as <strong>${USERS.cashier}</strong>.`, 'login', 5000),
      step(`${prefix}-24-running-bill.png`, USERS.cashier, `/ipd/running-bill/${aid}`, 'Cashier — running bill review', 'Cashier', 'Review all ward charges, procedures, and pharmacy lines before settlement.', 'task', 6000),
      step(`${prefix}-25-cashier-settle.png`, USERS.cashier, '/cashier?tab=ipd', 'Cashier — financial discharge', 'Cashier', 'Collect final payment, print receipt, and mark patient financially discharged. Bed is freed.', 'task', 6500),
      logout(`${prefix}-26-cashier-logout2.png`, USERS.cashier, 'Cashier', 'Cashier signs out. IPD stay complete for this patient.'),
    ],
  };
}

/** Workflow 3 — Maternity full module */
function buildMaternityWorkflowPlan(ctx) {
  const p = ctx.maternity;
  const pid = p.patientId;
  const mid = p.maternityId;
  const name = p.label;
  const prefix = 'mat';

  return {
    id: 'maternity-e2e',
    title: 'Maternity Module Workflow',
    subtitle: 'ANC registration → antenatal chart → labor → delivery → newborn → postnatal → billing',
    patient: name,
    patientId: pid,
    maternityId: mid,
    credentials: USERS,
    steps: [
      loginScreen(`${prefix}-01-login.png`, `Maternity workflow for <strong>${name}</strong> (HMS patient ${pid}, maternity chart ${mid}).`),

      loginScreen(`${prefix}-02-login-nurse.png`, `Nurse <strong>${USERS.nurse}</strong> registers ANC and opens the maternity chart.`),
      step(`${prefix}-03-nurse-portal.png`, USERS.nurse, '/portal/nurse', 'Nurse — sign in & portal', 'Nurse', `Login as <strong>${USERS.nurse}</strong> / ${PASS}.`, 'login', 5000),
      step(`${prefix}-04-maternity-hub.png`, USERS.nurse, '/maternity', 'Nurse — maternity dashboard', 'Nurse', 'Review ANC registry KPIs, high-risk flags, and labor ward status.', 'task', 6000),
      step(`${prefix}-05-patients-registry.png`, USERS.nurse, '/maternity/patients', 'Nurse — maternity patients registry', 'Nurse', 'Locate or register the patient in the maternity module.', 'task', 6000),
      step(`${prefix}-06-register.png`, USERS.nurse, `/maternity/register?patient_id=${pid}`, 'Nurse — ANC registration', 'Nurse', `Link HMS patient <strong>${name}</strong> to a maternity chart (ANC number assigned).`, 'task', 6000),
      logout(`${prefix}-07-nurse-logout.png`, USERS.nurse, 'Nurse', 'Nurse signs out after registration.'),

      loginScreen(`${prefix}-08-login-doctor.png`, `Doctor <strong>${USERS.doctor}</strong> documents antenatal care.`),
      step(`${prefix}-09-doctor-portal.png`, USERS.doctor, '/portal/doctor', 'Doctor — sign in & portal', 'Doctor', `Login as <strong>${USERS.doctor}</strong>.`, 'login', 5000),
      step(`${prefix}-10-chart-anc.png`, USERS.doctor, `/maternity/chart/${mid}?tab=anc`, 'Doctor — ANC visits', 'Doctor', 'Record antenatal visit findings, fundal height, FHR, and next appointment.', 'task', 7000),
      step(`${prefix}-11-chart-risk.png`, USERS.doctor, `/maternity/chart/${mid}?tab=risk`, 'Doctor — risk assessment', 'Doctor', 'Document obstetric risk factors and mitigation plan.', 'task', 6000),
      step(`${prefix}-12-chart-scans.png`, USERS.doctor, `/maternity/chart/${mid}?tab=scans`, 'Doctor — ultrasound & investigations', 'Doctor', 'Record scan results and ordered investigations.', 'task', 6000),
      step(`${prefix}-13-chart-labor.png`, USERS.doctor, `/maternity/chart/${mid}?tab=labor`, 'Doctor — labor admission', 'Doctor', 'Admit to labor ward — document cervical exam and labor progress.', 'task', 6000),
      step(`${prefix}-14-chart-delivery.png`, USERS.doctor, `/maternity/chart/${mid}?tab=delivery`, 'Doctor — delivery record', 'Doctor', 'Complete delivery details: mode, time, complications, Apgar scores.', 'task', 7000),
      logout(`${prefix}-15-doctor-logout.png`, USERS.doctor, 'Doctor', 'Doctor signs out after delivery documentation.'),

      loginScreen(`${prefix}-16-login-nurse-pnc.png`, `Nurse documents newborn and postnatal care.`),
      step(`${prefix}-17-nurse-portal-pnc.png`, USERS.nurse, '/portal/nurse', 'Nurse — sign in', 'Nurse', `Login as <strong>${USERS.nurse}</strong>.`, 'login', 5000),
      step(`${prefix}-18-chart-newborn.png`, USERS.nurse, `/maternity/chart/${mid}?tab=newborn`, 'Nurse — newborn registration', 'Nurse', 'Register baby, link to mother chart, record birth weight and initial care.', 'task', 6000),
      step(`${prefix}-19-chart-postnatal.png`, USERS.nurse, `/maternity/chart/${mid}?tab=postnatal`, 'Nurse — postnatal care', 'Nurse', 'Document postnatal visits, breastfeeding, and discharge readiness.', 'task', 6000),
      logout(`${prefix}-20-nurse-logout2.png`, USERS.nurse, 'Nurse', 'Nurse signs out after postnatal documentation.'),

      loginScreen(`${prefix}-21-login-cashier.png`, `Cashier collects maternity service payments.`),
      step(`${prefix}-22-cashier-portal-mat.png`, USERS.cashier, '/portal/cashier', 'Cashier — sign in', 'Cashier', `Login as <strong>${USERS.cashier}</strong>.`, 'login', 5000),
      step(`${prefix}-23-cashier-maternity.png`, USERS.cashier, `/cashier?prepay=1&patient_id=${pid}&service=maternity&maternity_id=${mid}`, 'Cashier — maternity billing', 'Cashier', 'Collect ANC package, delivery, or postnatal fees linked to maternity chart.', 'task', 6500),
      logout(`${prefix}-24-cashier-logout.png`, USERS.cashier, 'Cashier', 'Cashier signs out. Maternity episode billing complete.'),
    ],
  };
}

/** Workflow 4 — Emergency / A&E */
function buildEmergencyWorkflowPlan(ctx) {
  const p = ctx.emergency;
  const pid = p.patientId;
  const vid = p.visitId;
  const completedVid = p.completedVisitId || vid;
  const name = p.label;
  const prefix = 'er';

  return {
    id: 'emergency-e2e',
    title: 'Emergency / A&E Workflow',
    subtitle: 'ER registration → Triage → Doctor treatment → Lab/Rad/Pharm → Disposition → Cashier settlement',
    patient: name,
    patientId: pid,
    visitId: vid,
    credentials: USERS,
    steps: [
      loginScreen(`${prefix}-01-login.png`, `Emergency workflow for <strong>${name}</strong> (patient ${pid}, ER visit ${vid}). No prepayment required — billing is retrospective.`),

      loginScreen(`${prefix}-02-login-nurse-er.png`, `Nurse <strong>${USERS.nurse}</strong> opens the emergency board.`),
      step(`${prefix}-03-nurse-portal.png`, USERS.nurse, '/portal/nurse', 'Nurse — sign in & portal', 'Nurse', `Login as <strong>${USERS.nurse}</strong> / ${PASS}.`, 'login', 5000),
      step(`${prefix}-04-emergency-board.png`, USERS.nurse, '/emergency', 'Nurse — emergency board', 'Nurse', 'Review active A&E visits, triage priority, and bed status.', 'task', 6000),
      step(`${prefix}-05-visit-chart.png`, USERS.nurse, `/emergency/visit/${vid}`, 'Nurse — ER visit triage', 'Nurse', `Open ER chart for <strong>${name}</strong>. Record vitals, acuity, and chief complaint immediately.`, 'task', 7000),
      logout(`${prefix}-06-nurse-logout.png`, USERS.nurse, 'Nurse', 'Nurse signs out after triage. Doctor begins concurrent assessment.'),

      loginScreen(`${prefix}-07-login-doctor-er.png`, `Doctor <strong>${USERS.doctor}</strong> treats on the credit tab.`),
      step(`${prefix}-08-doctor-portal.png`, USERS.doctor, '/portal/doctor', 'Doctor — sign in & portal', 'Doctor', `Login as <strong>${USERS.doctor}</strong>.`, 'login', 5000),
      step(`${prefix}-09-er-kpi.png`, USERS.doctor, '/emergency/kpi?days=7', 'Doctor — emergency KPIs', 'Doctor', 'Monitor ER volume and turnaround metrics.', 'task', 5500),
      step(`${prefix}-10-doctor-visit.png`, USERS.doctor, `/emergency/visit/${vid}`, 'Doctor — assessment & orders', 'Doctor', 'Immediate assessment, treatment, and rapid orders (IV, labs, imaging, meds) on credit tab.', 'task', 7500),
      step(`${prefix}-11-credit-tab.png`, USERS.doctor, `/emergency/credit-tab/${vid}`, 'Doctor — ER credit tab', 'Doctor', 'Review running unpaid charges accumulated during emergency care.', 'task', 6000),
      logout(`${prefix}-12-doctor-logout.png`, USERS.doctor, 'Doctor', 'Doctor signs out after disposition decision (discharge, admit, or transfer).'),

      loginScreen(`${prefix}-13-login-lab-er.png`, `Lab processes urgent ER investigations.`),
      step(`${prefix}-14-lab-portal.png`, USERS.lab, '/portal/lab', 'Lab — sign in & portal', 'Lab Technician', `Login as <strong>${USERS.lab}</strong>.`, 'login', 5000),
      step(`${prefix}-15-lab-er.png`, USERS.lab, '/laboratory/order-alerts', 'Lab — emergency order alerts', 'Lab Technician', 'Process STAT lab orders from ER visit.', 'task', 6000),
      logout(`${prefix}-16-lab-logout.png`, USERS.lab, 'Lab Technician', 'Lab signs out after uploading urgent results.'),

      loginScreen(`${prefix}-17-login-rad-er.png`, `Radiologist handles emergency imaging.`),
      step(`${prefix}-18-rad-portal.png`, USERS.rad, '/portal/radiology', 'Radiologist — sign in & portal', 'Radiologist', `Login as <strong>${USERS.rad}</strong>.`, 'login', 5000),
      step(`${prefix}-19-rad-er.png`, USERS.rad, '/radiology', 'Radiologist — ER imaging worklist', 'Radiologist', 'Perform and report urgent imaging.', 'task', 6000),
      logout(`${prefix}-20-rad-logout.png`, USERS.rad, 'Radiologist', 'Radiologist signs out after ER imaging report.'),

      loginScreen(`${prefix}-21-login-pharm-er.png`, `Pharmacist dispenses emergency medications.`),
      step(`${prefix}-22-pharm-portal.png`, USERS.pharm, '/portal/pharmacy', 'Pharmacist — sign in & portal', 'Pharmacist', `Login as <strong>${USERS.pharm}</strong>.`, 'login', 5000),
      step(`${prefix}-23-pharm-er.png`, USERS.pharm, '/pharmacy', 'Pharmacist — ER dispensing', 'Pharmacist', 'Dispense ER medications to credit tab.', 'task', 6000),
      logout(`${prefix}-24-pharm-logout.png`, USERS.pharm, 'Pharmacist', 'Pharmacist signs out after dispensing.'),

      loginScreen(`${prefix}-25-login-cashier-er.png`, `Cashier settles retrospective ER bill.`),
      step(`${prefix}-26-cashier-portal.png`, USERS.cashier, '/portal/cashier', 'Cashier — sign in & portal', 'Cashier', `Login as <strong>${USERS.cashier}</strong>.`, 'login', 5000),
      step(`${prefix}-27-cashier-er.png`, USERS.cashier, '/cashier?tab=emergency', 'Cashier — emergency settlement', 'Cashier', 'Present final ER bill to family and collect payment.', 'task', 6500),
      logout(`${prefix}-28-cashier-logout.png`, USERS.cashier, 'Cashier', 'Cashier signs out after ER settlement.'),

      loginScreen(`${prefix}-29-login-nurse-close.png`, `Nurse confirms visit closure.`),
      step(`${prefix}-30-nurse-portal-close.png`, USERS.nurse, '/portal/nurse', 'Nurse — sign in', 'Nurse', `Login as <strong>${USERS.nurse}</strong>.`, 'login', 5000),
      step(`${prefix}-31-completed-visit.png`, USERS.nurse, `/emergency/visit/${completedVid}`, 'Nurse — completed ER visit', 'Nurse', 'Verify visit status Completed and documentation closed.', 'task', 6000),
      logout(`${prefix}-32-nurse-logout2.png`, USERS.nurse, 'Nurse', 'Nurse signs out. Emergency episode complete.'),
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
  USERS,
  PASS,
  buildAllWorkflowPlans,
  buildOpdWorkflowPlan,
  buildIpdWorkflowPlan,
  buildMaternityWorkflowPlan,
  buildEmergencyWorkflowPlan,
};
