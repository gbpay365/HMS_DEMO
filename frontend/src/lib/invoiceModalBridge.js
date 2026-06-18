let openListener = null;

export function registerInvoiceModalOpener(fn) {
  openListener = fn;
}

export function openHmsInvoiceModal(visitId) {
  const id = parseInt(visitId, 10);
  if (!id) return;
  openListener?.(id);
}

export function mountInvoiceModalBridge() {
  window.openHmsInvoiceModal = openHmsInvoiceModal;
}
