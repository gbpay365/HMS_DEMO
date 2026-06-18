import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotifyHost } from './components/NotifyHost';
import { LoginPageApp } from './pages/LoginPageApp';
import { VisitingDoctorClaimPageApp } from './pages/VisitingDoctorClaimPageApp';
import { mountNotifyBridge } from './lib/notifyBridge';
import { parsePageData } from './lib/parsePageData';
import { ensureI18n, resolveBootLocale, i18n } from './i18n';

async function bootLoginPage() {
  const props = parsePageData('hms-page-data') || {};
  const locale = resolveBootLocale(props);
  await ensureI18n(locale);

  const notifyRoot = document.getElementById('hms-notify-root');
  if (notifyRoot && !notifyRoot.dataset.hmsMounted) {
    notifyRoot.dataset.hmsMounted = '1';
    createRoot(notifyRoot).render(createElement(NotifyHost));
  }
  mountNotifyBridge();

  const reactRoot = document.getElementById('hms-react-root');
  if (!reactRoot || reactRoot.dataset.hmsMounted) return;

  const page = String(reactRoot.dataset.page || '').trim();
  const App = page === 'visiting-doctor' ? VisitingDoctorClaimPageApp : LoginPageApp;

  reactRoot.dataset.hmsMounted = '1';
  createRoot(reactRoot).render(
    createElement(
      I18nextProvider,
      { i18n, key: locale },
      createElement(ErrorBoundary, null, createElement(App, { ...props, key: locale }))
    )
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    bootLoginPage().catch((err) => console.error('[HMS login] boot failed:', err));
  });
} else {
  bootLoginPage().catch((err) => console.error('[HMS login] boot failed:', err));
}
