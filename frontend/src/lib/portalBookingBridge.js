let openListener = null;

export function registerPortalBookingOpener(fn) {
  openListener = fn;
}

export function openPortalBookingWizard(rescheduleData) {
  openListener?.(rescheduleData || null);
}

export function mountPortalBookingBridge() {
  window.openPortalBookingWizard = openPortalBookingWizard;
  // Legacy alias used by portal-booking.js
  window.openObkWizard = openPortalBookingWizard;
}
