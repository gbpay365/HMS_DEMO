'use strict';

function canAccessCashier(userPerms = []) {
  return (
    userPerms.includes('*') ||
    userPerms.includes('cashier.read') ||
    userPerms.includes('cashier.write')
  );
}

/** Lab/rad staff register walk-ins; only cashier roles should land on /cashier. */
function redirectAfterWalkinRegister(res, result, listPath) {
  if (!result?.ok) return null;
  const perms = res.locals.userPerms || [];
  if (canAccessCashier(perms) && result.redirect) return result.redirect;
  const msg = encodeURIComponent('Walk-in registered — patient queued for cashier payment');
  return `${listPath}?msg=${msg}`;
}

module.exports = { canAccessCashier, redirectAfterWalkinRegister };
