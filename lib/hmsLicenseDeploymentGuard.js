'use strict';

const BLOCK_MESSAGE =
  'Hospital deployment is now controlled by solution subscriptions. Open Solution Subscriptions to request and activate modules via the ZAIZENS License Generator.';

function licenseKeysConfigured() {
  return !!(
    String(process.env.LICENSE_ED25519_PUBLIC_KEY_PEM || '').trim() &&
    String(process.env.LICENSE_RSA_PUBLIC_KEY_PEM || '').trim()
  );
}

function isLicenseDeploymentEnabled() {
  if (String(process.env.HMS_LICENSE_DEPLOYMENT || '').trim() === '0') return false;
  if (String(process.env.HMS_LICENSE_DEPLOYMENT || '').trim() === '1') return true;
  return licenseKeysConfigured();
}

function blockManualDeployment(req, res, back) {
  if (!isLicenseDeploymentEnabled()) return false;
  const redirect = back || '/super-admin';
  const err = encodeURIComponent(BLOCK_MESSAGE);
  return res.redirect(redirect + (redirect.includes('?') ? '&' : '?') + 'err=' + err);
}

module.exports = {
  BLOCK_MESSAGE,
  isLicenseDeploymentEnabled,
  blockManualDeployment,
  licenseKeysConfigured,
};
