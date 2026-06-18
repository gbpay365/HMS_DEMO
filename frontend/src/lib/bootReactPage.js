import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ensureI18n, localeFromDocument, localeFromPageData, resolveBootLocale, i18n } from '../i18n';
import { ModalHost } from '../modals/ModalHost';
import { DeathRegistryPageApp } from '../pages/DeathRegistryPageApp';
import { HmsUiKitPageApp } from '../pages/HmsUiKitPageApp';
import { DoctorsPageApp } from '../pages/DoctorsPageApp';
import { AppointmentsPageApp } from '../pages/AppointmentsPageApp';
import { PatientsPageApp } from '../pages/PatientsPageApp';
import { EmployeesPageApp } from '../pages/EmployeesPageApp';
import { EmployeePasswordPageApp } from '../pages/EmployeePasswordPageApp';
import { UsersPageApp } from '../pages/UsersPageApp';
import { PrescriptionsPageApp } from '../pages/PrescriptionsPageApp';
import { InventoryPageApp } from '../pages/InventoryPageApp';
import { BillingPageApp } from '../pages/BillingPageApp';
import { OpdQueuePageApp } from '../pages/OpdQueuePageApp';
import { OpdMedPageApp } from '../pages/OpdMedPageApp';
import { CashierPageApp } from '../pages/CashierPageApp';
import { FrontDeskPageApp } from '../pages/FrontDeskPageApp';
import { LoginPageApp } from '../pages/LoginPageApp';
import { DashboardPageApp } from '../pages/DashboardPageApp';
import { StaffPageApp } from '../pages/StaffPageApp';
import { CatalogPageApp } from '../pages/CatalogPageApp';
import { EmergencyKpiPageApp } from '../pages/EmergencyKpiPageApp';
import { IpdHubPageApp } from '../pages/IpdHubPageApp';
import { IpdCensusPageApp } from '../pages/IpdCensusPageApp';
import { LaboratoryPageApp } from '../pages/LaboratoryPageApp';
import { PharmacyPageApp } from '../pages/PharmacyPageApp';
import { WardsPageApp } from '../pages/WardsPageApp';
import { PortalPageApp } from '../pages/PortalPageApp';
import { RadiologyPageApp } from '../pages/RadiologyPageApp';
import { EmergencyPageApp } from '../pages/EmergencyPageApp';
import { EmergencyVisitPageApp } from '../pages/EmergencyVisitPageApp';
import { HmsAdminAccessPageApp } from '../pages/HmsAdminAccessPageApp';
import { SolutionSubscriptionsPageApp } from '../pages/SolutionSubscriptionsPageApp';
import { CallQueueBoardApp } from '../pages/CallQueueBoardApp';
import { CallQueueLauncherApp } from '../pages/CallQueueLauncherApp';
import { DoctorSchedulePageApp } from '../pages/DoctorSchedulePageApp';
import { DoctorPortalPageApp } from '../pages/DoctorPortalPageApp';
import { RadiologyWorkflowPageApp } from '../pages/RadiologyWorkflowPageApp';
import { FinancialsPageApp } from '../pages/FinancialsPageApp';
import { PatientChartPageApp } from '../pages/PatientChartPageApp';
import { ConsultationNewPageApp, ConsultationSessionPageApp } from '../pages/ConsultationNewPageApp';
import { ConsultationStartPageApp } from '../pages/ConsultationStartPageApp';
import { IpdPageApp } from '../pages/IpdPageApp';
import { NursingSupplyRequestsPageApp } from '../pages/NursingSupplyRequestsPageApp';
import { LabWorkflowPageApp } from '../pages/LabWorkflowPageApp';
import { DoctorErInboxPageApp } from '../pages/DoctorErInboxPageApp';
import { HmsCommissionPageApp } from '../pages/HmsCommissionPageApp';
import { HmsPrescriptionVerifyPageApp } from '../pages/HmsPrescriptionVerifyPageApp';
import { ConsultationRoomsPageApp } from '../pages/ConsultationRoomsPageApp';
import { VisitingDoctorSetupPageApp } from '../pages/VisitingDoctorSetupPageApp';
import { VisitingDoctorAdminPageApp } from '../pages/VisitingDoctorAdminPageApp';
import { VisitingDoctorMyVisitPageApp } from '../pages/VisitingDoctorMyVisitPageApp';
import { MaternityChartPageApp } from '../pages/MaternityChartPageApp';
import { PayrollSettingsPageApp } from '../pages/PayrollSettingsPageApp';
import { NavBackButton, PageNavActions } from '../components/PageNavActions';
import { EmployeeProfilePicturePicker } from '../components/EmployeeProfilePicturePicker';
import { EmployeeDoctorMultiFields } from '../components/EmployeeDoctorMultiFields';
import { mountModalBridge } from './modalBridge';
import { mountNotifyBridge } from './notifyBridge';
import { consumeQueryFlash } from './queryFlash';
import { parsePageData } from './parsePageData';
import { NotifyHost } from '../components/NotifyHost';
import { PayrollModalsHost } from '../components/payroll/PayrollModalsHost';
import { AddChargeModalHost } from '../components/AddChargeModalHost';
import { HmsInvoiceModalHost } from '../components/HmsInvoiceModalHost';
import { PortalBookingWizardHost } from '../components/PortalBookingWizardHost';
import { WalletModalsHost } from '../components/wallet/WalletModalsHost';
import { DiagnosticTemplateModalsHost } from '../components/diagnostic/DiagnosticTemplateModalsHost';
import { QuickLauncher } from '../components/QuickLauncher';

const APPS = {
  doctors: DoctorsPageApp,
  appointments: AppointmentsPageApp,
  patients: PatientsPageApp,
  employees: EmployeesPageApp,
  'employee-password': EmployeePasswordPageApp,
  users: UsersPageApp,
  prescriptions: PrescriptionsPageApp,
  inventory: InventoryPageApp,
  billing: BillingPageApp,
  'opd-queue': OpdQueuePageApp,
  'opd-med': OpdMedPageApp,
  cashier: CashierPageApp,
  'front-desk': FrontDeskPageApp,
  login: LoginPageApp,
  dashboard: DashboardPageApp,
  staff: StaffPageApp,
  catalog: CatalogPageApp,
  'emergency-kpi': EmergencyKpiPageApp,
  'ipd-hub': IpdHubPageApp,
  'ipd-census': IpdCensusPageApp,
  laboratory: LaboratoryPageApp,
  pharmacy: PharmacyPageApp,
  wards: WardsPageApp,
  portal: PortalPageApp,
  'hms-admin-access': HmsAdminAccessPageApp,
  'solution-subscriptions': SolutionSubscriptionsPageApp,
  radiology: RadiologyPageApp,
  emergency: EmergencyPageApp,
  'emergency-visit': EmergencyVisitPageApp,
  'call-queue-board': CallQueueBoardApp,
  'call-queue-launcher': CallQueueLauncherApp,
  'doctor-schedule': DoctorSchedulePageApp,
  'portal-doctor': DoctorPortalPageApp,
  'radiology-workflow': RadiologyWorkflowPageApp,
  financials: FinancialsPageApp,
  'patient-chart': PatientChartPageApp,
  'consultation-new': ConsultationNewPageApp,
  'consultation-session': ConsultationSessionPageApp,
  'consultation-start': ConsultationStartPageApp,
  ipd: IpdPageApp,
  'nursing-supply-requests': NursingSupplyRequestsPageApp,
  'lab-workflow': LabWorkflowPageApp,
  'doctor-er-inbox': DoctorErInboxPageApp,
  'hms-commission': HmsCommissionPageApp,
  'hms-prescription-verify': HmsPrescriptionVerifyPageApp,
  'consultation-rooms': ConsultationRoomsPageApp,
  'visiting-doctor-setup': VisitingDoctorSetupPageApp,
  'visiting-doctor-admin': VisitingDoctorAdminPageApp,
  'visiting-doctor-my-visit': VisitingDoctorMyVisitPageApp,
  'death-registry': DeathRegistryPageApp,
  'ui-kit': HmsUiKitPageApp,
  'maternity-chart': MaternityChartPageApp,
  'payroll-settings': PayrollSettingsPageApp};

function showBootError(message) {
  const root = document.getElementById('hms-react-root');
  if (!root) return;
  root.dataset.hmsBootError = '1';
  root.innerHTML = `<div class="content px-4 py-8"><div class="alert alert-danger border-0 shadow-sm" style="border-radius:12px;"><strong>UI failed to load.</strong> ${message}<br><small class="text-muted">Run <code>npm run build:ui</code> from the project root, then hard-refresh (Ctrl+F5).</small></div></div>`;
}

function pageLocale() {
  const el = document.getElementById('hms-page-data');
  if (!el?.textContent) return localeFromDocument();
  try {
    return resolveBootLocale(JSON.parse(el.textContent));
  } catch {
    return localeFromDocument();
  }
}

export async function bootReactPage() {
  try {
    const locale = pageLocale();
    await ensureI18n(locale);
    const notifyRoot = document.getElementById('hms-notify-root');
    if (notifyRoot && !notifyRoot.dataset.hmsMounted) {
      notifyRoot.dataset.hmsMounted = '1';
      createRoot(notifyRoot).render(createElement(NotifyHost));
    }
    mountNotifyBridge();
    consumeQueryFlash();
    mountModalBridge();

    const modalRoot = document.getElementById('hms-modal-root');
    if (modalRoot && !modalRoot.dataset.hmsMounted) {
      modalRoot.dataset.hmsMounted = '1';
      createRoot(modalRoot).render(createElement(ModalHost));
    }

    const navProps = parsePageData('hms-page-nav-data') || {};
    const topnavBackRoot = document.getElementById('hms-topnav-back-root');
    if (topnavBackRoot && !topnavBackRoot.dataset.hmsMounted) {
      topnavBackRoot.dataset.hmsMounted = '1';
      createRoot(topnavBackRoot).render(
        createElement(I18nextProvider, { i18n }, createElement(NavBackButton, navProps))
      );
    }
    const navRoot = document.getElementById('hms-page-nav-root');
    if (navRoot && !navRoot.dataset.hmsMounted) {
      navRoot.dataset.hmsMounted = '1';
      createRoot(navRoot).render(
        createElement(I18nextProvider, { i18n }, createElement(PageNavActions, navProps))
      );
    }

    const profileRoot = document.getElementById('hms-employee-profile-root');
    if (profileRoot && !profileRoot.dataset.hmsMounted) {
      profileRoot.dataset.hmsMounted = '1';
      const profileProps = parsePageData('hms-employee-profile-data') || {};
      createRoot(profileRoot).render(createElement(EmployeeProfilePicturePicker, profileProps));
    }

    const doctorMultiRoot = document.getElementById('hms-employee-doctor-multi-root');
    if (doctorMultiRoot && !doctorMultiRoot.dataset.hmsMounted) {
      doctorMultiRoot.dataset.hmsMounted = '1';
      const doctorMultiProps = parsePageData('hms-employee-doctor-multi-data') || {};
      createRoot(doctorMultiRoot).render(createElement(EmployeeDoctorMultiFields, doctorMultiProps));
    }

    const payrollModalsRoot = document.getElementById('hms-payroll-modals-root');
    if (payrollModalsRoot && !payrollModalsRoot.dataset.hmsMounted) {
      payrollModalsRoot.dataset.hmsMounted = '1';
      const payrollModalsProps = parsePageData('hms-payroll-modals-data') || {};
      createRoot(payrollModalsRoot).render(
        createElement(I18nextProvider, { i18n }, createElement(PayrollModalsHost, payrollModalsProps))
      );
    }

    const walletModalsRoot = document.getElementById('hms-wallet-modals-root');
    if (walletModalsRoot && !walletModalsRoot.dataset.hmsMounted) {
      walletModalsRoot.dataset.hmsMounted = '1';
      createRoot(walletModalsRoot).render(
        createElement(I18nextProvider, { i18n }, createElement(WalletModalsHost))
      );
    }

    const diagTplModalsRoot = document.getElementById('hms-diag-tpl-modals-root');
    if (diagTplModalsRoot && !diagTplModalsRoot.dataset.hmsMounted) {
      diagTplModalsRoot.dataset.hmsMounted = '1';
      createRoot(diagTplModalsRoot).render(
        createElement(I18nextProvider, { i18n }, createElement(DiagnosticTemplateModalsHost))
      );
    }

    const quickLauncherRoot = document.getElementById('hms-quick-launcher-root');
    if (quickLauncherRoot && !quickLauncherRoot.dataset.hmsMounted) {
      quickLauncherRoot.dataset.hmsMounted = '1';
      createRoot(quickLauncherRoot).render(
        createElement(I18nextProvider, { i18n }, createElement(QuickLauncher))
      );
    }

    const addChargeRoot = document.getElementById('hms-add-charge-root');
    if (addChargeRoot && !addChargeRoot.dataset.hmsMounted) {
      addChargeRoot.dataset.hmsMounted = '1';
      createRoot(addChargeRoot).render(
        createElement(I18nextProvider, { i18n }, createElement(AddChargeModalHost))
      );
    }

    const invoiceModalRoot = document.getElementById('hms-invoice-modal-root');
    if (invoiceModalRoot && !invoiceModalRoot.dataset.hmsMounted) {
      invoiceModalRoot.dataset.hmsMounted = '1';
      createRoot(invoiceModalRoot).render(
        createElement(I18nextProvider, { i18n }, createElement(HmsInvoiceModalHost))
      );
    }

    const portalBookingRoot = document.getElementById('hms-portal-booking-root');
    if (portalBookingRoot && !portalBookingRoot.dataset.hmsMounted) {
      portalBookingRoot.dataset.hmsMounted = '1';
      createRoot(portalBookingRoot).render(
        createElement(I18nextProvider, { i18n }, createElement(PortalBookingWizardHost))
      );
    }

    const reactRoot = document.getElementById('hms-react-root');
    if (!reactRoot) return;

    const page = String(reactRoot.dataset.page || '').trim();
    if (!page) {
      showBootError('Missing data-page on #hms-react-root.');
      return;
    }

    const App = APPS[page];
    if (!App) {
      showBootError(`Unknown React page "${page}".`);
      return;
    }

    const props = parsePageData('hms-page-data') || parsePageData(`hms-${page}-data`);
    const appLocale = resolveBootLocale(props);
    await ensureI18n(appLocale);
    if (!reactRoot.dataset.hmsMounted) {
      reactRoot.dataset.hmsMounted = '1';
      createRoot(reactRoot).render(
        createElement(
          I18nextProvider,
          { i18n, key: appLocale },
          createElement(ErrorBoundary, null, createElement(App, { ...props, key: appLocale }))
        )
      );
    }
  } catch (err) {
    console.error('[HMS UI] boot failed:', err);
    showBootError(err.message || 'Unexpected error while starting the UI.');
  }
}
