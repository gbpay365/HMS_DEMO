import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { registerNotifyListener } from '../lib/notifyBridge';

function ToastItem({ toast, onDismiss }) {
  const { t } = useTranslation('common');
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!toast.duration) return undefined;
    const t = window.setTimeout(() => {
      setLeaving(true);
      window.setTimeout(() => onDismiss(toast.id), 200);
    }, toast.duration);
    return () => window.clearTimeout(t);
  }, [toast.duration, toast.id, onDismiss]);

  const dismiss = () => {
    setLeaving(true);
    window.setTimeout(() => onDismiss(toast.id), 200);
  };

  return (
    <div
      className={`hms-notify-toast hms-notify-toast--${toast.type}${leaving ? ' is-leaving' : ''}`}
      role="status"
    >
      <div className="hms-notify-toast__icon">
        <i className={`fa ${toast.icon}`} aria-hidden="true" />
      </div>
      <div className="hms-notify-toast__body">
        {toast.title ? <p className="hms-notify-toast__title">{toast.title}</p> : null}
        {toast.message ? <p className="hms-notify-toast__msg">{toast.message}</p> : null}
      </div>
      <button type="button" className="hms-notify-toast__close" aria-label={t('aria.dismiss')} onClick={dismiss}>
        <i className="fa fa-times" aria-hidden="true" />
      </button>
    </div>
  );
}

function AlertDialog({ alert, onClose }) {
  const { t } = useTranslation('common');
  if (!alert) return null;

  const close = () => {
    alert.onClose?.(true);
    onClose();
  };

  return (
    <div
      className="hms-notify-alert-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="hms-notify-alert-title"
    >
      <div className={`hms-notify-alert hms-notify-alert--${alert.type}`}>
        <div className="hms-notify-alert__head">
          <div className="hms-notify-alert__icon">
            <i className={`fa ${alert.icon}`} aria-hidden="true" />
          </div>
          <div className="hms-notify-alert__text">
            <h2 id="hms-notify-alert-title" className="hms-notify-alert__title">
              {alert.title}
            </h2>
            {alert.message ? <p className="hms-notify-alert__msg">{alert.message}</p> : null}
          </div>
        </div>
        <div className="hms-notify-alert__foot">
          <button type="button" className="hms-notify-btn hms-notify-btn--primary" onClick={close}>
            {alert.confirmLabel || t('actions.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotifyHost() {
  const [toasts, setToasts] = useState([]);
  const [alert, setAlert] = useState(null);

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  useLayoutEffect(() => {
    registerNotifyListener((evt) => {
      if (evt.action === 'toast') {
        setToasts((list) => [...list.slice(-4), evt]);
      }
      if (evt.action === 'alert') {
        setAlert(evt);
      }
    });
    return () => registerNotifyListener(null);
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="hms-notify-root" aria-live="polite">
      <div className="hms-notify-toasts">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
        ))}
      </div>
      <AlertDialog alert={alert} onClose={() => setAlert(null)} />
    </div>,
    document.body
  );
}
