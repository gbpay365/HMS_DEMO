'use strict';

const { loadEnv } = require('../lib/loadEnv');
loadEnv();
const { createDbPool } = require('../lib/dbPool');
const walletHub = require('../lib/walletHub');

(async () => {
  const pool = createDbPool();
  try {
    await walletHub.ensureWalletTables(pool);
    for (const q of ['', 'a', 'go', 'sou', '675']) {
      try {
        const { withWallet, withoutWallet } = await walletHub.searchPatients(pool, q, 25, 1);
        console.log('q=', JSON.stringify(q), 'with=', withWallet.length, 'without=', withoutWallet.length);
        if (withWallet[0]) console.log('  sample wallet', withWallet[0].first_name, withWallet[0].last_name);
        if (withoutWallet[0]) console.log('  sample no-wallet', withoutWallet[0].name);
      } catch (e) {
        console.error('q=', JSON.stringify(q), 'ERROR', e.message);
      }
    }
  } finally {
    await pool.end();
  }
})();
