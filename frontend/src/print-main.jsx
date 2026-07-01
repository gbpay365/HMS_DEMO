import './styles/tailwind.css';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrintPatientsListApp } from './pages/print/PrintPatientsListApp';
import { PrintEmployeesListApp } from './pages/print/PrintEmployeesListApp';
import { PrintPaymentSlipApp, PrintPaymentTicketApp, PrintPaymentSlipBatchApp } from './pages/print/PrintPaymentApps';
import { PrintReceiptApp, PrintInvoiceApp, PrintReceiptClassicApp, PrintReceiptPremiumApp, PrintReceiptBatchApp, PrintDoctorPrescriptionApp, PrintEmergencyMlcApp } from './pages/print/PrintBillingApps';
import { PrintHospitalInvoiceApp } from './pages/print/PrintHospitalInvoiceApp';
import { PrintMedicalPassportApp } from './pages/print/PrintMedicalPassportApp';
import { parsePageData } from './lib/parsePageData';
import { initI18n, localeFromPageData, i18n } from './i18n';

const APPS = {
  'print-patients-list': PrintPatientsListApp,
  'print-employees-list': PrintEmployeesListApp,
  'print-payment-slip': PrintPaymentSlipApp,
  'print-payment-slip-batch': PrintPaymentSlipBatchApp,
  'print-payment-ticket': PrintPaymentTicketApp,
  'print-receipt': PrintReceiptApp,
  'print-invoice': PrintInvoiceApp,
  'print-hospital-invoice': PrintHospitalInvoiceApp,
  'print-receipt-classic': PrintReceiptClassicApp,
  'print-receipt-premium': PrintReceiptPremiumApp,
  'print-receipt-batch': PrintReceiptBatchApp,
  'print-doctor-prescription': PrintDoctorPrescriptionApp,
  'print-emergency-mlc': PrintEmergencyMlcApp,
  'print-medical-passport': PrintMedicalPassportApp};

function bootHmsCountry(props) {
  const boot = props?.hmsCountry;
  if (boot && typeof boot === 'object' && Object.keys(boot).length) {
    window.HMS = Object.assign({}, window.HMS || {}, boot);
  }
}

function bootPrintPage() {
  const root = document.getElementById('hms-react-root');
  if (!root) return;
  const page = String(root.dataset.page || '').trim();
  const App = APPS[page];
  if (!App) return;
  const props = parsePageData('hms-page-data') || {};
  bootHmsCountry(props);
  initI18n(localeFromPageData(props));
  createRoot(root).render(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(
        ErrorBoundary,
        null,
        createElement('div', { className: 'hms-ui' }, createElement(App, props))
      )
    )
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootPrintPage);
} else {
  bootPrintPage();
}
