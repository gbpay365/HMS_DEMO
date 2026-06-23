'use strict';

require('../lib/loadEnv').loadEnv();
const { createDbPool } = require('../lib/dbPool');
const { retryFailedCoreAccountSync } = require('../lib/coreAccountWebhook');

(async () => {
  const pool = await createDbPool();
  const result = await retryFailedCoreAccountSync(pool, parseInt(process.argv[2], 10) || 50);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
