'use strict';

const fs = require('fs');
const path = require('path');
const { getFinSetting, setFinSetting } = require('./hmsFinSettings');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'betterpay.json');
const CACHE_MS = 30_000;

let cache = { partner: '', baseUrl: '', webhookSecret: '', statusUrl: '', apiKey: '', loadedAt: 0 };

function readFileConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return {
      partnerIdentifier: String(raw.partner_identifier || raw.partnerIdentifier || '').trim(),
      payBaseUrl: String(raw.pay_base_url || raw.payBaseUrl || '').trim(),
      webhookSecret: String(raw.webhook_secret || raw.webhookSecret || '').trim(),
      statusUrl: String(raw.status_url || raw.statusUrl || '').trim(),
      apiKey: String(raw.api_key || raw.apiKey || '').trim(),
    };
  } catch (e) {
    console.warn('betterpay.json read failed:', e.message);
    return null;
  }
}

function invalidateCache() {
  cache.loadedAt = 0;
}

/**
 * Resolve BetterPay settings (env → config/betterpay.json → database).
 * @param {import('mysql2/promise').Pool} pool
 * @param {boolean} [force]
 */
async function resolve(pool, force = false) {
  const now = Date.now();
  if (!force && cache.partner && now - cache.loadedAt < CACHE_MS) {
    return { ...cache };
  }

  let partner = String(process.env.BETTERPAY_PARTNER_IDENTIFIER || '').trim();
  let baseUrl = String(process.env.BETTERPAY_PAY_BASE_URL || '').trim();
  let webhookSecret = String(process.env.BETTERPAY_WEBHOOK_SECRET || '').trim();
  let statusUrl = String(process.env.BETTERPAY_STATUS_URL || '').trim();
  let apiKey = String(process.env.BETTERPAY_API_KEY || '').trim();

  const fileCfg = readFileConfig();
  if (!partner && fileCfg?.partnerIdentifier) partner = fileCfg.partnerIdentifier;
  if (!baseUrl && fileCfg?.payBaseUrl) baseUrl = fileCfg.payBaseUrl;
  if (!webhookSecret && fileCfg?.webhookSecret) webhookSecret = fileCfg.webhookSecret;
  if (!statusUrl && fileCfg?.statusUrl) statusUrl = fileCfg.statusUrl;
  if (!apiKey && fileCfg?.apiKey) apiKey = fileCfg.apiKey;

  if (pool) {
    try {
      const dbPartner = String(await getFinSetting(pool, 'betterpay.partner_identifier', '')).trim();
      const dbBase = String(await getFinSetting(pool, 'betterpay.pay_base_url', '')).trim();
      const dbHook = String(await getFinSetting(pool, 'betterpay.webhook_secret', '')).trim();
      const dbStatus = String(await getFinSetting(pool, 'betterpay.status_url', '')).trim();
      const dbKey = String(await getFinSetting(pool, 'betterpay.api_key', '')).trim();

      if (dbPartner) partner = dbPartner;
      if (dbBase) baseUrl = dbBase;
      if (dbHook) webhookSecret = dbHook;
      if (dbStatus) statusUrl = dbStatus;
      if (dbKey) apiKey = dbKey;

      // Seed DB from env/file when empty (survives server restarts without .env)
      if (!dbPartner && partner) await setFinSetting(pool, 'betterpay.partner_identifier', partner);
      if (!dbBase && baseUrl) await setFinSetting(pool, 'betterpay.pay_base_url', baseUrl);
      if (!dbHook && webhookSecret) await setFinSetting(pool, 'betterpay.webhook_secret', webhookSecret);
      if (!dbStatus && statusUrl) await setFinSetting(pool, 'betterpay.status_url', statusUrl);
      if (!dbKey && apiKey) await setFinSetting(pool, 'betterpay.api_key', apiKey);
    } catch (e) {
      console.warn('BetterPay DB settings:', e.message);
    }
  }

  cache = {
    partner,
    baseUrl: baseUrl || 'https://pay.betterpay.online/pay',
    webhookSecret,
    statusUrl,
    apiKey,
    loadedAt: now,
  };
  return { ...cache };
}

async function isConfigured(pool) {
  const c = await resolve(pool);
  return !!c.partner;
}

async function saveSettings(pool, settings = {}) {
  const partner = String(settings.partner_identifier || settings.partnerIdentifier || '').trim();
  const baseUrl = String(settings.pay_base_url || settings.payBaseUrl || '').trim();
  const webhookSecret = String(settings.webhook_secret || settings.webhookSecret || '').trim();
  const statusUrl = String(settings.status_url || settings.statusUrl || '').trim();
  const apiKey = String(settings.api_key || settings.apiKey || '').trim();

  await setFinSetting(pool, 'betterpay.partner_identifier', partner);
  if (baseUrl) await setFinSetting(pool, 'betterpay.pay_base_url', baseUrl);
  if (webhookSecret) await setFinSetting(pool, 'betterpay.webhook_secret', webhookSecret);
  if (statusUrl) await setFinSetting(pool, 'betterpay.status_url', statusUrl);
  if (apiKey) await setFinSetting(pool, 'betterpay.api_key', apiKey);

  invalidateCache();
  return resolve(pool, true);
}

async function loadSettings(pool) {
  const c = await resolve(pool, true);
  return {
    partner_identifier: c.partner,
    pay_base_url: c.baseUrl,
    webhook_secret: c.webhookSecret,
    status_url: c.statusUrl,
    api_key: c.apiKey,
    configured: !!c.partner,
  };
}

async function init(pool) {
  await resolve(pool, true);
}

module.exports = {
  CONFIG_PATH,
  invalidateCache,
  resolve,
  isConfigured,
  saveSettings,
  loadSettings,
  init,
};
