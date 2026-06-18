let hostApi = null;

export function registerWalletModalsHost(api) {
  hostApi = api;
}

export function openWalletTopup(payload = {}) {
  hostApi?.openTopup?.(payload);
}

export function openWalletQr(payload = {}) {
  hostApi?.openQr?.(payload);
}

export function openWalletTxn(payload = {}) {
  hostApi?.openTxn?.(payload);
}

export function openWalletCreate(payload = {}) {
  hostApi?.openCreate?.(payload);
}

export function mountWalletModalBridge() {
  window.WltPage = {
    openTopup: (wid, name, bal, phone, ptLabel) =>
      openWalletTopup({ wallet_id: wid, name, balance: bal, phone, pt_label: ptLabel }),
    showQR: (token, name) => openWalletQr({ token, name }),
    loadTxns: (walletId, name) => openWalletTxn({ walletId, name }),
  };
  window.WltTopupPick = (p) => openWalletTopup(p || {});
}
