/** Department service codes shown on slips, receipts, and invoices (LAB / RAD / PHA). */
export const PRINT_SERVICE_CODE_KINDS = ['laboratory', 'radiology', 'pharmacy'];

export function collectPrintServiceCodes(sectionCodes = {}) {
  return PRINT_SERVICE_CODE_KINDS.map((kind) => ({
    kind,
    code: String(sectionCodes[kind] || '').trim()})).filter((entry) => entry.code);
}

export function hasPrintServiceCodes(sectionCodes = {}) {
  return collectPrintServiceCodes(sectionCodes).length > 0;
}

export function hasServiceCodesPanelContent(sectionCodes = {}, prescriptionItems = []) {
  if (hasPrintServiceCodes(sectionCodes)) return true;
  return (prescriptionItems || []).some((it) =>
    PRINT_SERVICE_CODE_KINDS.includes(String(it.item_type || '').toLowerCase())
  );
}

export function formatPrintServiceCodesSummary(sectionCodes = {}) {
  return collectPrintServiceCodes(sectionCodes)
    .map((entry) => entry.code)
    .join(' · ');
}
