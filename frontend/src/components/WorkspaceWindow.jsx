import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const MIN_W = 360;
const MIN_H = 280;

function clampSize(wPx, hPx) {
  const maxW = window.innerWidth - 24;
  const maxH = window.innerHeight - 24;
  return {
    w: Math.min(maxW, Math.max(MIN_W, wPx)),
    h: Math.min(maxH, Math.max(MIN_H, hPx))};
}

function pctToPx(wPct, hPct) {
  return clampSize((window.innerWidth * wPct) / 100, (window.innerHeight * hPct) / 100);
}

/**
 * Desktop-style workspace window: minimize, size presets, maximize, drag-resize.
 */
export function WorkspaceWindow({ open, onClose, title, subtitle, children }) {
  const { t } = useTranslation('clinical');
  const { t: tc } = useTranslation('common');
  const panelRef = useRef(null);
  const [sizeMode, setSizeMode] = useState('normal');
  const [sizePct, setSizePct] = useState({ w: 75, h: 75 });
  const [pixelSize, setPixelSize] = useState(() => pctToPx(75, 75));

  const resetWindow = useCallback(() => {
    setSizeMode('normal');
    setSizePct({ w: 75, h: 75 });
    setPixelSize(pctToPx(75, 75));
  }, []);

  useEffect(() => {
    if (open) resetWindow();
  }, [open, resetWindow]);

  useEffect(() => {
    if (!open || sizeMode === 'minimized') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, sizeMode]);

  const toggleMaximize = () => {
    if (sizeMode === 'maximized') {
      setSizeMode('normal');
      setSizePct({ w: 75, h: 75 });
      setPixelSize(pctToPx(75, 75));
      return;
    }
    setSizeMode('maximized');
  };

  const startResize = (e) => {
    e.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = panel.offsetWidth;
    const startH = panel.offsetHeight;

    const onMove = (ev) => {
      const next = clampSize(startW + (ev.clientX - startX), startH + (ev.clientY - startY));
      setPixelSize(next);
      setSizePct({
        w: Math.round((next.w / window.innerWidth) * 100),
        h: Math.round((next.h / window.innerHeight) * 100)});
      setSizeMode('custom');
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  if (!open) return null;

  if (sizeMode === 'minimized') {
    return createPortal(
      <div className="fixed bottom-0 right-4 z-[2001] flex h-12 w-[min(20rem,90vw)] items-center gap-2 rounded-t-xl border border-b-0 border-slate-200 bg-white px-3 shadow-xl">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-bold text-ink"
          onClick={() => setSizeMode('normal')}
        >
          <i className="fa fa-file-text-o text-brand" aria-hidden="true" />
          <span className="truncate">{title}</span>
        </button>
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          title={t('cashier.workspace_restore')}
          onClick={() => setSizeMode('normal')}
        >
          <i className="fa fa-window-restore" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
          aria-label={tc('aria.close')}
          onClick={onClose}
        >
          <i className="fa fa-times" aria-hidden="true" />
        </button>
      </div>,
      document.getElementById('hms-modal-root') || document.body
    );
  }

  const isMaximized = sizeMode === 'maximized';
  const panelStyle = isMaximized
    ? { width: '100%', height: '100dvh' }
    : { width: `${pixelSize.w}px`, height: `${pixelSize.h}px` };

  return createPortal(
    <div
      className={`fixed inset-0 z-[2000] flex animate-fade-in ${isMaximized ? 'p-0' : 'items-center justify-center p-3'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hms-workspace-title"
    >
      {!isMaximized ? (
        <button
          type="button"
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
          aria-label={tc('aria.close_dialog')}
          onClick={onClose}
        />
      ) : null}
      <div
        ref={panelRef}
        style={panelStyle}
        className={`relative flex flex-col overflow-hidden bg-white shadow-2xl ${
          isMaximized ? 'rounded-none' : 'rounded-xl ring-1 ring-slate-200/80'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-brand to-brand-dark px-4 py-3 text-white sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 id="hms-workspace-title" className="truncate text-base font-bold tracking-tight sm:text-lg">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 truncate text-xs text-indigo-100 sm:text-sm">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="hms-chrome-btn"
              title={t('cashier.workspace_minimize')}
              onClick={() => setSizeMode('minimized')}
            >
              <i className="fa fa-window-minimize text-xs" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="hms-chrome-btn"
              title={isMaximized ? t('cashier.workspace_restore') : t('cashier.workspace_maximize')}
              onClick={toggleMaximize}
            >
              <i className={`fa ${isMaximized ? 'fa-window-restore' : 'fa-window-maximize'} text-xs`} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="hms-chrome-btn hms-chrome-btn--danger"
              aria-label={tc('aria.close')}
              onClick={onClose}
            >
              <i className="fa fa-times text-sm" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/80 px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>
        {!isMaximized ? (
          <button
            type="button"
            aria-label={t('cashier.workspace_resize')}
            className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-se-resize text-slate-300 hover:text-brand"
            onMouseDown={startResize}
          >
            <svg viewBox="0 0 12 12" className="h-full w-full" fill="currentColor" aria-hidden="true">
              <path d="M12 12H8V10h2V8h2v4zM10 6H8V4h2V6zM6 10H4V8h2v2z" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>,
    document.getElementById('hms-modal-root') || document.body
  );
}
