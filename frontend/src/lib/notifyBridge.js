import { i18n } from '../i18n';

let notifyListener = null;
let alertQueue = Promise.resolve();
const pendingEvents = [];

const ICONS = {
  success: 'fa-check-circle',
  error: 'fa-exclamation-circle',
  warning: 'fa-exclamation-triangle',
  info: 'fa-info-circle'};

function tr(key, defaultValue) {
  if (!i18n.isInitialized) return defaultValue;
  return i18n.t(key, { defaultValue });
}

export function registerNotifyListener(fn) {
  notifyListener = fn;
  if (fn && pendingEvents.length) {
    const batch = pendingEvents.splice(0);
    batch.forEach((evt) => fn(evt));
  }
}

function emit(action, payload) {
  const evt = { action, ...payload };
  if (notifyListener) notifyListener(evt);
  else pendingEvents.push(evt);
}

export function notifyToast({ type = 'info', title = '', message = '', duration = 4200 } = {}) {
  const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  emit('toast', { id, type, title, message, duration, icon: ICONS[type] || ICONS.info });
  return id;
}

export function notifyAlert({
  title = '',
  message = '',
  type = 'info',
  confirmLabel = ''} = {}) {
  const job = alertQueue.then(
    () =>
      new Promise((resolve) => {
        emit('alert', {
          title: title || tr('notify.notice', 'Notice'),
          message,
          type,
          confirmLabel: confirmLabel || tr('actions.ok', 'OK'),
          icon: ICONS[type] || ICONS.info,
          onClose: resolve});
      })
  );
  alertQueue = job.catch(() => {});
  return job;
}

export function notifyError(message, title = '') {
  return notifyAlert({
    title: title || tr('notify.error', 'Error'),
    message,
    type: 'error'});
}

export function notifySuccess(message, title = '') {
  if (message && !title) return notifyToast({ type: 'success', title: message });
  return notifyToast({ type: 'success', title: title || tr('notify.success', 'Success'), message });
}

export function mountNotifyBridge() {
  const nativeAlert = window.alert?.bind(window);

  window.alert = function hmsReactAlert(message) {
    const text = String(message ?? '');
    if (!notifyListener) {
      nativeAlert?.(text);
      return;
    }
    notifyAlert({
      title: tr('notify.notice', 'Notice'),
      message: text,
      type: text.toLowerCase().includes('error') || text.toLowerCase().includes('failed') ? 'error' : 'warning'});
  };

  window.HmsNotify = {
    toast: notifyToast,
    alert: notifyAlert,
    error: notifyError,
    success: notifySuccess};

  if (!window.HMS) window.HMS = {};

  window.HMS.toast = window.HMS.toast || {};
  window.HMS.toast.fire = function fireToast(opts = {}) {
    const icon = opts.icon || 'info';
    const typeMap = { success: 'success', error: 'error', warning: 'warning', info: 'info' };
    notifyToast({
      type: typeMap[icon] || 'info',
      title: opts.title || '',
      message: opts.text || opts.message || '',
      duration: opts.timer ?? 3200});
  };

  window.HMS.alert = function hmsAlert(title, text, icon) {
    const typeMap = { success: 'success', error: 'error', warning: 'warning', info: 'info' };
    return notifyAlert({
      title: title || tr('notify.notice', 'Notice'),
      message: text || '',
      type: typeMap[icon] || 'info'});
  };
}
