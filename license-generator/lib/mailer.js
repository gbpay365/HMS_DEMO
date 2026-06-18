'use strict';

let _transporter = null;

function smtpConfigured() {
  return !!(String(process.env.LICENSE_SMTP_HOST || process.env.HMS_SMTP_HOST || '').trim() &&
    String(process.env.LICENSE_SMTP_FROM || process.env.HMS_SMTP_FROM || '').trim());
}

function smtpHost() {
  return String(process.env.LICENSE_SMTP_HOST || process.env.HMS_SMTP_HOST || '').trim();
}

function smtpFrom() {
  return String(process.env.LICENSE_SMTP_FROM || process.env.HMS_SMTP_FROM || '').trim();
}

function getTransporter() {
  if (_transporter) return _transporter;
  if (!smtpConfigured()) return null;
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (_) {
    return null;
  }
  const port = Number(process.env.LICENSE_SMTP_PORT || process.env.HMS_SMTP_PORT || 587);
  const secure =
    String(process.env.LICENSE_SMTP_SECURE || process.env.HMS_SMTP_SECURE || '').toLowerCase() === 'true' ||
    port === 465;
  const user = String(process.env.LICENSE_SMTP_USER || process.env.HMS_SMTP_USER || '').trim();
  const pass =
    process.env.LICENSE_SMTP_PASS != null
      ? String(process.env.LICENSE_SMTP_PASS)
      : process.env.HMS_SMTP_PASS != null
        ? String(process.env.HMS_SMTP_PASS)
        : '';

  _transporter = nodemailer.createTransport({
    host: smtpHost(),
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
  return _transporter;
}

async function sendMail({ to, subject, text, html }) {
  const transport = getTransporter();
  if (!transport) return { sent: false, reason: 'smtp_not_configured' };
  if (!to) return { sent: false, reason: 'missing_recipient' };
  const info = await transport.sendMail({
    from: smtpFrom(),
    to,
    subject: String(subject || '').trim() || 'ZAIZENS License Server',
    text: text || undefined,
    html: html || undefined,
  });
  return { sent: true, messageId: info && info.messageId };
}

function alertRecipients() {
  const raw = String(
    process.env.LICENSE_SERVER_ALERT_EMAIL ||
      process.env.LICENSE_VENDOR_EMAIL ||
      process.env.LICENSE_SERVER_OFFLINE_ALERT_EMAIL ||
      ''
  ).trim();
  if (!raw) return [];
  return raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

async function sendOfflineAlert(installation) {
  const to = alertRecipients();
  if (!to.length) return { sent: false, reason: 'no_alert_recipients' };

  const facility = installation.facility_name || 'Unknown facility';
  const iid = installation.installation_id;
  const lastHb = installation.last_heartbeat_at || 'never';
  const subject = `[ZAIZENS License] Client offline — ${facility}`;
  const text =
    `A licensed HMS client appears to be offline.\n\n` +
    `Facility: ${facility}\n` +
    `Installation ID: ${iid}\n` +
    `Last heartbeat: ${lastHb}\n` +
    `Last IP: ${installation.last_ip || '—'}\n\n` +
    `Check the license server dashboard. Remote revocations will apply when the client comes back online or receives a push webhook.`;

  return sendMail({ to: to.join(', '), subject, text });
}

async function sendOnlineRecoveryAlert(installation) {
  const to = alertRecipients();
  if (!to.length) return { sent: false, reason: 'no_alert_recipients' };

  const facility = installation.facility_name || 'Unknown facility';
  const subject = `[ZAIZENS License] Client back online — ${facility}`;
  const text =
    `The HMS client is syncing again.\n\n` +
    `Facility: ${facility}\n` +
    `Installation ID: ${installation.installation_id}\n` +
    `Last heartbeat: ${installation.last_heartbeat_at || 'just now'}`;

  return sendMail({ to: to.join(', '), subject, text });
}

module.exports = {
  smtpConfigured,
  alertRecipients,
  sendMail,
  sendOfflineAlert,
  sendOnlineRecoveryAlert,
};
