'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');
(async () => {
  const p = createDbPool();
  const [cols] = await p.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='tbl_employee' ORDER BY ordinal_position`
  );
  console.log(cols.map((c) => c.column_name).join(', '));
  await p.end?.();
})();
