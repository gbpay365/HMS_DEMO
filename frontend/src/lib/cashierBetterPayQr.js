/** Draw BetterPay checkout QR into a host element (canvas or fallback image). */
export function renderQrToCanvas(host, url) {
  if (!host || !url) return;
  host.innerHTML = '';
  if (typeof window.QRCode !== 'undefined') {
    window.QRCode.toCanvas(host, url, { width: 168, margin: 1 }, () => {});
    return;
  }
  const img = document.createElement('img');
  img.alt = 'QR';
  img.width = 168;
  img.height = 168;
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${encodeURIComponent(url)}`;
  host.appendChild(img);
}

/** Load qrcode.min.js once, then invoke draw(). */
export function ensureBetterPayQrScript(draw) {
  if (typeof window.QRCode !== 'undefined') {
    draw();
    return undefined;
  }
  const scriptId = 'hms-qrcode-vendor';
  let el = document.getElementById(scriptId);
  if (!el) {
    el = document.createElement('script');
    el.id = scriptId;
    el.src = '/vendor/qrcode/qrcode.min.js';
    el.async = true;
    el.onload = draw;
    el.onerror = draw;
    document.head.appendChild(el);
  } else {
    draw();
  }
  return undefined;
}
