let hostApi = null;

export function registerDiagTplModalsHost(api) {
  hostApi = api;
}

export function openDiagRefsModal(config = {}) {
  hostApi?.openRefs?.(config);
}

export function openDiagPreviewModal(config = {}) {
  hostApi?.openPreview?.(config);
}

export function closeDiagTplModal(which) {
  hostApi?.close?.(which);
}

export function mountDiagTplModalBridge() {
  window.HmsDiagTpl = {
    openRefs: openDiagRefsModal,
    openPreview: openDiagPreviewModal,
    close: closeDiagTplModal,
  };
}
