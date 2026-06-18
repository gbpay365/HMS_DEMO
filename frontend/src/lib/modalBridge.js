import { createElement } from 'react';

let modalListener = null;

export function registerModalListener(fn) {
  modalListener = fn;
}

export function openModal(config) {
  modalListener?.({ ...config, open: true });
}

export function closeModal() {
  modalListener?.({ open: false });
}

export function confirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary'}) {
  return new Promise((resolve) => {
    openModal({
      title: title || 'Confirm',
      size: 'sm',
      body: createElement('p', { className: 'text-sm leading-relaxed text-slate-600' }, message),
      footer: createElement(
        'div',
        { className: 'flex flex-wrap items-center justify-end gap-3 w-full' },
        createElement(
          'button',
          {
            type: 'button',
            className: 'hms-btn-secondary',
            onClick: () => {
              closeModal();
              resolve(false);
            }},
          cancelLabel
        ),
        createElement(
          'button',
          {
            type: 'button',
            className:
              tone === 'danger' ? 'hms-btn hms-btn-danger' : 'hms-btn hms-btn-primary',
            onClick: () => {
              closeModal();
              resolve(true);
            }},
          confirmLabel
        )
      )});
  });
}

/** Text input dialog — resolves entered string, or null if cancelled. */
export function promptModal({
  title,
  message = '',
  defaultValue = '',
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  placeholder = '',
  multiline = false}) {
  const state = { value: defaultValue };
  return new Promise((resolve) => {
    const input = multiline
      ? createElement('textarea', {
          className: 'hms-input min-h-[88px] w-full',
          defaultValue,
          placeholder,
          rows: 3,
          onInput: (e) => {
            state.value = e.target.value;
          }})
      : createElement('input', {
          type: 'text',
          className: 'hms-input w-full',
          defaultValue,
          placeholder,
          onInput: (e) => {
            state.value = e.target.value;
          }});

    openModal({
      title: title || 'Enter value',
      size: 'sm',
      closeOnBackdrop: false,
      body: createElement(
        'div',
        { className: 'space-y-3' },
        message
          ? createElement('p', { className: 'text-sm leading-relaxed text-slate-600' }, message)
          : null,
        input
      ),
      footer: createElement(
        'div',
        { className: 'flex flex-wrap items-center justify-end gap-3 w-full' },
        createElement(
          'button',
          {
            type: 'button',
            className: 'hms-btn-secondary',
            onClick: () => {
              closeModal();
              resolve(null);
            }},
          cancelLabel
        ),
        createElement(
          'button',
          {
            type: 'button',
            className: 'hms-btn-primary',
            onClick: () => {
              closeModal();
              resolve(state.value);
            }},
          confirmLabel
        )
      )});
  });
}

/** Confirm then submit the form (supports formAction buttons). */
export async function confirmFormSubmit(ev, options) {
  ev.preventDefault();
  const ok = await confirmModal(options);
  if (!ok) return;
  const submitter = ev.currentTarget;
  const form = submitter?.form || submitter?.closest?.('form');
  if (form) form.requestSubmit(submitter);
}

export function mountModalBridge() {
  window.HmsModal = {
    open: openModal,
    close: closeModal,
    confirm: confirmModal,
    prompt: promptModal};

  if (window.HMS) {
    window.HMS.confirm = function hmsConfirm(title, text, icon, btnText, color) {
      const tone =
        icon === 'error' || String(color || '').includes('dc2626') || String(color || '').includes('dc3545')
          ? 'danger'
          : 'primary';
      return confirmModal({
        title: title || 'Are you sure?',
        message: text || '',
        confirmLabel: btnText || 'Yes, proceed',
        tone}).then((ok) => ({ isConfirmed: ok }));
    };
  }
}
