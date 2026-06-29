'use strict';

/** Sanitize card audit fields — never accept or store full PAN or CVV. */

function sanitizeCardMeta(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const cardType = String(raw.card_type || raw.cardType || '').trim().slice(0, 32);
  const last4 = String(raw.card_last4 || raw.last4 || '').replace(/\D/g, '').slice(-4);
  const expiry = String(raw.card_expiry || raw.expiry || '').trim().slice(0, 7);
  const holder = String(raw.card_holder || raw.cardHolder || '').trim().slice(0, 80);
  const authCode = String(raw.auth_code || raw.authCode || '').trim().slice(0, 32);
  if (!cardType || last4.length !== 4) return null;
  return {
    card_type: cardType,
    card_last4: last4,
    card_expiry: expiry,
    card_holder: holder,
    auth_code: authCode,
  };
}

function formatCardMetaNote(meta) {
  if (!meta) return '';
  const parts = [`Card ${meta.card_type} •••• ${meta.card_last4}`];
  if (meta.card_expiry) parts.push(`exp ${meta.card_expiry}`);
  if (meta.card_holder) parts.push(meta.card_holder);
  if (meta.auth_code) parts.push(`Auth ${meta.auth_code}`);
  return parts.join(' · ').slice(0, 500);
}

function parseCardMetaFromBody(body) {
  if (!body) return null;
  let raw = body.prepay_card_meta;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (_) {
      raw = null;
    }
  }
  return sanitizeCardMeta(raw);
}

module.exports = {
  sanitizeCardMeta,
  formatCardMetaNote,
  parseCardMetaFromBody,
};
