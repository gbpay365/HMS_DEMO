'use strict';

require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');
const ensureFinAccountingSchema = require('../lib/ensureFinAccountingSchema');
const { APPLY_TVA_ON_SYNC, journalCodeForSource } = require('../lib/finAccountingConfig');
const { buildReceiptLines, buildExpenseLines, loadTvaRate } = require('../lib/finPostingTemplates');
const { cashLikeAccount, journalPostExtended } = require('../lib/hmsFinJournalPost');
const { fetchLivreJournalRows } = require('../lib/finLivreJournal');

async function main() {
  const pool = createDbPool();
  const driver = pool.driver;
  const host = pool.config?.host || '(unknown)';
  console.log(`\n=== Railway / live DB accounting test ===`);
  console.log(`Driver: ${driver} · Host: ${host}`);
  console.log(`APPLY_TVA_ON_SYNC: ${APPLY_TVA_ON_SYNC}`);

  await pool.query('SELECT 1 AS ok');
  console.log('✓ DB connection OK');

  await ensureFinAccountingSchema(pool);
  console.log('✓ Schema ensured (journal codes, piece seq, etc.)');

  const [[jc]] = await pool.query(
    'SELECT COUNT(*) AS n FROM tbl_fin_journal_code WHERE code IN (\'VTE\',\'ACH\')'
  ).catch(() => [[{ n: 0 }]]);
  console.log(`✓ Journal codes VTE/ACH count: ${jc?.n ?? 0}`);

  const tvaRate = await loadTvaRate(pool, 1);
  const receiptLines = buildReceiptLines(11925, 'Cash', cashLikeAccount, 'default', tvaRate, APPLY_TVA_ON_SYNC);
  const expenseLines = buildExpenseLines(11925, 'Cash', cashLikeAccount, 'medical', tvaRate, APPLY_TVA_ON_SYNC);

  console.log('\n--- TVA receipt template (11,925 TTC) ---');
  for (const ln of receiptLines) {
    console.log(`  ${ln.code} Dr ${ln.debit} Cr ${ln.credit} ${ln.tva_amount ? `(TVA ${ln.tva_amount})` : ''}`);
  }
  const rSum = receiptLines.reduce((s, l) => s + l.debit - l.credit, 0);
  console.log(`  Balanced: ${Math.abs(rSum) < 0.03 ? 'yes' : 'NO (' + rSum + ')'}`);

  console.log('\n--- TVA expense template (11,925 TTC) ---');
  for (const ln of expenseLines) {
    console.log(`  ${ln.code} Dr ${ln.debit} Cr ${ln.credit}`);
  }
  const eSum = expenseLines.reduce((s, l) => s + l.debit - l.credit, 0);
  console.log(`  Balanced: ${Math.abs(eSum) < 0.03 ? 'yes' : 'NO (' + eSum + ')'}`);

  const testSid = Math.floor(Date.now() % 2000000000);
  const today = new Date().toISOString().slice(0, 10);
  const postR = await journalPostExtended(pool, {
    facilityId: 1,
    sourceType: 'manual_import',
    sourceId: testSid,
    reference: 'LIVE-TVA-TEST',
    narration: 'Live Railway TVA template verification (safe to reverse)',
    createdBy: 0,
    lines: receiptLines,
    entryDate: today,
    journalCode: journalCodeForSource('billing_receipt'),
    status: 'posted',
  });

  if (postR.ok && postR.journalId) {
    const [[hdr]] = await pool.query(
      'SELECT journal_code, piece_number, status FROM tbl_fin_journal_header WHERE id = ?',
      [postR.journalId]
    );
    console.log(`\n✓ Posted test journal #${postR.journalId} · ${hdr?.piece_number} · ${hdr?.journal_code} · ${hdr?.status}`);

    const [tvaLines] = await pool.query(
      `SELECT account_code, debit, credit, tva_amount FROM tbl_fin_journal_line WHERE journal_id = ?`,
      [postR.journalId]
    );
    const hasTva = (tvaLines || []).some((l) => String(l.account_code).startsWith('445'));
    console.log(`✓ TVA line present (445xxx): ${hasTva ? 'yes' : 'NO'}`);

    // Roll back test entry on live DB — reverse it immediately
    const { reverseJournal } = require('../lib/finJournalLifecycle');
    const rev = await reverseJournal(pool, 1, postR.journalId, 0, 'Automated live test cleanup');
    console.log(`✓ Test entry reversed: ${rev.ok ? 'yes' : rev.error}`);
  } else {
    console.log(`\n✗ Test post failed: ${postR.code}`);
  }

  const year = new Date().getFullYear();
  const from = `${year}-01-01`;
  const rows = await fetchLivreJournalRows(pool, 1, from, today, 'all');
  console.log(`\n✓ Livre-journal rows YTD: ${rows.length}`);

  const [[posted]] = await pool.query(
    `SELECT COUNT(*) AS n FROM tbl_fin_journal_header WHERE status = 'posted'`
  ).catch(() => [[{ n: 0 }]]);
  console.log(`✓ Posted journals in DB: ${posted?.n ?? 0}`);

  console.log('\n=== Live test complete ===\n');
  await pool.end?.().catch(() => {});
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗ Live test failed:', e.message);
  process.exit(1);
});
