let openListener = null;

export function registerAddChargeOpener(fn) {
  openListener = fn;
}

export function openAddChargeModal(options = {}) {
  openListener?.(options);
}

export function mountAddChargeBridge() {
  const opener = (options) => openAddChargeModal(options || {});
  window.openHmsChargeModal = opener;
  window.openIpdChargeModal = opener;
}
