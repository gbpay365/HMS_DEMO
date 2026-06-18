'use strict';

let _transporter = null;
let _nodemailer = null;

function smtpConfigured() {
  return !!(String(process.env.HMS_SMTP_HOST || '').trim() && String(process.env.HMS_SMTP_FROM || '').trim());
}

function loadNodemailer() {
  if (_nodemailer) return _nodemailer;
  try {
    _nodemailer = require('nodemailer');
    return _nodemailer;
  } catch (_) {
    return null;
  }
}

function getTransporter() {
  if (_transporter) return _transporter;
  if (!smtpConfigured()) return null;
  const nodemailer = loadNodemailer();
  if (!nodemailer) return null;

  const port = Number(process.env.HMS_SMTP_PORT || 587);
  const secure =
    String(process.env.HMS_SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const user = String(process.env.HMS_SMTP_USER || '').trim();
  const pass = process.env.HMS_SMTP_PASS != null ? String(process.env.HMS_SMTP_PASS) : '';

  _transporter = nodemailer.createTransport({
    host: String(process.env.HMS_SMTP_HOST).trim(),
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
  return _transporter;
}

/**
 * @returns {Promise<{sent:boolean, reason?:string, messageId?:string}>}
 */
async function sendMail({ to, cc, bcc, subject, text, html, replyTo }) {
  const transport = getTransporter();
  if (!transport) {
    return { sent: false, reason: 'smtp_not_configured' };
  }
  if (!to) {
    return { sent: false, reason: 'missing_recipient' };
  }

  const info = await transport.sendMail({
    from: String(process.env.HMS_SMTP_FROM).trim(),
    to,
    cc: cc || undefined,
    bcc: bcc || undefined,
    replyTo: replyTo || undefined,
    subject: String(subject || '').trim() || 'ZAIZENS notification',
    text: text || undefined,
    html: html || undefined,
  });

  return { sent: true, messageId: info && info.messageId };
}

/**
 * Email vendor (and optionally hospital contact) with a new subscription request code.
 */
async function sendSubscriptionRequestEmail({
  vendorEmail,
  hospitalEmail,
  solutionLabel,
  facilityName,
  installationId,
  requestCode,
  requestExpiresAt,
}) {
  const vendor = String(vendorEmail || process.env.LICENSE_VENDOR_EMAIL || '').trim();
  if (!vendor) {
    return { sent: false, reason: 'vendor_email_missing' };
  }

  const expiresText = requestExpiresAt
    ? new Date(requestExpiresAt).toLocaleString()
    : '7 days';
  const subject = `ZAIZENS subscription request: ${solutionLabel} — ${facilityName}`;
  const text = [
    'A hospital has requested a ZAIZENS solution subscription.',
    '',
    `Facility: ${facilityName}`,
    `Solution: ${solutionLabel}`,
    `Installation ID: ${installationId}`,
    hospitalEmail ? `Hospital contact: ${hospitalEmail}` : null,
    `Request code expires: ${expiresText}`,
    '',
    'Request code (paste into ZAIZENS License Generator):',
    requestCode,
    '',
    '— ZAIZENS HMS',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family:Inter,Segoe UI,sans-serif;color:#0f172a;line-height:1.5">
      <p>A hospital has requested a <strong>ZAIZENS</strong> solution subscription.</p>
      <table style="border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Facility</td><td><strong>${escapeHtml(facilityName)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Solution</td><td><strong>${escapeHtml(solutionLabel)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Installation ID</td><td><code>${escapeHtml(installationId)}</code></td></tr>
        ${hospitalEmail ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Hospital contact</td><td>${escapeHtml(hospitalEmail)}</td></tr>` : ''}
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Code expires</td><td>${escapeHtml(expiresText)}</td></tr>
      </table>
      <p style="margin:16px 0 6px;font-weight:600">Request code</p>
      <pre style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;white-space:pre-wrap;word-break:break-all;font-size:12px">${escapeHtml(requestCode)}</pre>
      <p style="color:#64748b;font-size:13px">Paste this code into the ZAIZENS License Generator to issue a one-year serial number.</p>
    </div>`;

  const cc = hospitalEmail && hospitalEmail !== vendor ? hospitalEmail : undefined;

  return sendMail({
    to: vendor,
    cc,
    replyTo: hospitalEmail || undefined,
    subject,
    text,
    html,
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  smtpConfigured,
  sendMail,
  sendSubscriptionRequestEmail,
};
