import { i18n } from '../i18n';
import { notifySuccess } from './notifyBridge';

/** Remove one-time ?msg= / ?err= flash params so refresh does not replay the toast. */
export function stripQueryMsgErr() {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('msg') && !params.has('err')) return;
    params.delete('msg');
    params.delete('err');
    const next = params.toString();
    const clean = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', clean);
  } catch (_) {
    /* optional */
  }
}

/** Show ?msgKey= flash after language changes, then clean the URL. */
export function consumeQueryFlash() {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    const msgKey = params.get('msgKey');
    if (!msgKey) return;

    const msg =
      i18n.t(msgKey, { ns: 'common' }) ||
      i18n.t(msgKey, { ns: 'errors' });
    if (msg) notifySuccess(msg);

    params.delete('msgKey');
    const next = params.toString();
    const clean = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', clean);
  } catch (_) {
    /* optional */
  }
}
