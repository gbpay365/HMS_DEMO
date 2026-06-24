'use strict';
const { Client } = require('pg');

(async () => {
  const c = new Client({
    connectionString:
      'postgresql://postgres:GbnRfwwHDYclnXQEBWtOpADxpzHLejcE@reseau.proxy.rlwy.net:52717/railway',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const hms = await c.query(`SELECT COUNT(*)::int AS n FROM "JournalEntries" WHERE "SourceSystem" = 'HMS'`);
  const total = await c.query('SELECT COUNT(*)::int AS n FROM "JournalEntries"');
  const recent = await c.query(
    `SELECT "Reference", "EntryDate", "Validated" FROM "JournalEntries" WHERE "SourceSystem" = 'HMS' ORDER BY "CreatedAt" DESC LIMIT 5`
  );
  console.log({ hmsJournals: hms.rows[0].n, totalJournals: total.rows[0].n, recent: recent.rows });
  await c.end();
})();
