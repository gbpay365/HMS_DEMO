'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');
(async () => {
  const p = createDbPool();
  const [[c]] = await p.query('SELECT COUNT(*) AS n FROM tbl_fin_journal_header');
  const [r] = await p.query(
    'SELECT id, reference, narration, source_type, entry_date FROM tbl_fin_journal_header ORDER BY id DESC LIMIT 10'
  );
  const [cols] = await p.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name='tbl_fin_journal_line' AND column_name IN ('debit','credit')`
  );
  const [userTx] = await p.query(
    `SELECT h.id, h.reference, h.narration, h.source_type
       FROM tbl_fin_journal_header h
      WHERE h.reference LIKE 'RCT-2026-0000005%'
         OR h.reference LIKE 'CD-%'
      ORDER BY h.id DESC LIMIT 10`
  );
  console.log(JSON.stringify({ total: c?.n, cols, userTx, recent: r }, null, 2));
  await p.end?.();
})();
