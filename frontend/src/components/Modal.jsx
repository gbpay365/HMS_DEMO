import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl',
  workspace: 'max-w-[min(96vw,1280px)]',
  fullscreen: 'max-w-none'};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function getFocusableNodes(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  headerClassName = ''}) {
  const { t } = useTranslation('common');
  const panelRef = useRef(null);
  const lastActiveRef = useRef(null);
  const isFullscreen = size === 'fullscreen';

  useEffect(() => {
    if (!open) return undefined;
    lastActiveRef.current = document.activeElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = getFocusableNodes(panelRef.current);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    const focusTimer = window.setTimeout(() => {
      const nodes = getFocusableNodes(panelRef.current);
      (nodes[0] || panelRef.current)?.focus?.();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      const last = lastActiveRef.current;
      if (last && typeof last.focus === 'function') last.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[2000] flex animate-fade-in ${
        isFullscreen ? 'p-0' : 'items-end justify-center p-2 sm:items-center sm:p-6'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hms-modal-title"
    >
      {!isFullscreen ? (
        <button
          type="button"
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
          aria-label={t('aria.close_dialog')}
          onClick={() => closeOnBackdrop && onClose?.()}
        />
      ) : null}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative flex w-full flex-col overflow-hidden bg-white outline-none ${
          isFullscreen
            ? 'h-dvh max-h-dvh rounded-none shadow-none animate-none'
            : `max-h-[calc(100dvh-1rem)] rounded-2xl shadow-modal sm:max-h-[min(90dvh,900px)] ${
                size === 'workspace' ? 'sm:max-h-[min(94dvh,960px)]' : ''
              } ${SIZES[size] || SIZES.md} animate-slide-up`
        }`}
      >
        <div
          className={`flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-brand to-brand-dark px-4 py-4 text-white sm:px-6 sm:py-5 ${headerClassName}`}
        >
          <div className="min-w-0">
            <h2 id="hms-modal-title" className="text-lg font-bold tracking-tight">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm text-indigo-100">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hms-chrome-btn hms-chrome-btn--sm hms-chrome-btn--danger"
            aria-label={t('aria.close')}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/80 ${
            isFullscreen ? 'px-4 py-4 sm:px-6 sm:py-5' : 'px-4 py-4 sm:px-6 sm:py-5'
          }`}
        >
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-6px_16px_rgba(15,23,42,0.08)] sm:gap-3 sm:px-6 sm:py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.getElementById('hms-modal-root') || document.body
  );
}
