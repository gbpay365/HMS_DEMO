-- 031: Point journal lines at GL headers (not legacy tbl_fin_journal)
-- Safe to run once; Node repair runs equivalent logic via ensureFinJournalLineFk.js

-- Drop wrong FK if present (name may vary — check information_schema)
-- ALTER TABLE tbl_fin_journal_line DROP FOREIGN KEY fk_fin_jl_journal;

ALTER TABLE tbl_fin_journal_line
  ADD CONSTRAINT fk_fin_jl_j
  FOREIGN KEY (journal_id) REFERENCES tbl_fin_journal_header (id) ON DELETE CASCADE;
