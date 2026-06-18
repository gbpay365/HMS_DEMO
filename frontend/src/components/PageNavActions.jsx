import { useTranslation } from 'react-i18next';

function canGoBack() {
  if (typeof window === 'undefined' || window.history.length <= 1) return false;
  const ref = document.referrer;
  if (!ref) return false;
  try {
    return new URL(ref, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

function goBack(fallbackHref) {
  if (canGoBack()) {
    window.history.back();
    return;
  }
  window.location.href = fallbackHref || '/dashboard';
}

function IconBack() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Compact Back control for the Odoo top navbar (before the apps grid). */
export function NavBackButton({
  homeHref = '/dashboard',
  backFallback = '/dashboard',
  backLabel}) {
  const { t } = useTranslation('nav');
  const back = backLabel || t('back');
  const fallback = backFallback || homeHref || '/dashboard';

  return (
    <button
      type="button"
      onClick={() => goBack(fallback)}
      className="o_nav_back"
      aria-label={back}
    >
      <IconBack />
      <span className="o_nav_back_label">{back}</span>
    </button>
  );
}

/** Back (browser history) — Home lives in the global top bar. */
export function PageNavActions({
  homeHref = '/dashboard',
  backFallback = '/dashboard',
  backLabel,
  className = ''}) {
  const { t } = useTranslation('nav');
  const back = backLabel || t('back');
  const fallback = backFallback || homeHref || '/dashboard';

  return (
    <nav
      className={`flex w-full items-center justify-start ${className}`.trim()}
      aria-label={t('aria_page_navigation')}
    >
      <button
        type="button"
        onClick={() => goBack(fallback)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:shadow focus:outline-none focus:ring-2 focus:ring-brand/30"
      >
        <IconBack />
        {back}
      </button>
    </nav>
  );
}

export { canGoBack, goBack };
