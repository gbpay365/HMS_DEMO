'use strict';

/** Translate common MySQL SQL to PostgreSQL for HMS demo / Railway deploy. */
function adaptMysqlSqlToPg(sql) {
  let text = String(sql || '');

  // MySQL conditional comments / hints
  text = text.replace(/\/\*!?\d*\s*/g, '/* ');

  // Backtick identifiers
  text = text.replace(/`([^`]+)`/g, '"$1"');

  // Functions / expressions
  text = text.replace(/\bDATABASE\s*\(\s*\)/gi, 'current_database()');
  text = text.replace(
    /TABLE_SCHEMA\s*=\s*current_database\s*\(\s*\)/gi,
    "table_schema = 'public'"
  );
  text = text.replace(
    /table_schema\s*=\s*current_database\s*\(\s*\)/gi,
    "table_schema = 'public'"
  );
  text = text.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');
  text = text.replace(/\bNOW\s*\(\s*\d+\s*\)/gi, 'NOW()');
  text = text.replace(/\bCURDATE\s*\(\s*\)/gi, 'CURRENT_DATE');
  text = text.replace(/\bCURTIME\s*\(\s*\)/gi, 'CURRENT_TIME');
  text = text.replace(/\bGROUP_CONCAT\s*\(/gi, 'STRING_AGG(');
  text = text.replace(/\bDATE_FORMAT\s*\(/gi, 'TO_CHAR(');
  text = text.replace(/\bUNIX_TIMESTAMP\s*\(/gi, 'EXTRACT(EPOCH FROM ');
  text = text.replace(/\bCAST\s*\(\s*([^)]+?)\s+AS\s+UNSIGNED\s*\)/gi, 'CAST($1 AS INTEGER)');
  text = text.replace(/\bCAST\s*\(\s*([^)]+?)\s+AS\s+SIGNED\s*\)/gi, 'CAST($1 AS INTEGER)');

  // REGEXP (MySQL) -> ~* (PostgreSQL case-insensitive)
  text = text.replace(/\s+REGEXP\s+/gi, ' ~* ');

  // Zero dates from legacy MySQL rows
  text = text.replace(/'0000-00-00 00:00:00'/g, 'NULL');
  text = text.replace(/'0000-00-00'/g, 'NULL');

  // INSERT IGNORE -> ON CONFLICT DO NOTHING (best-effort; needs UNIQUE/PK)
  if (/^\s*INSERT\s+IGNORE\s+/i.test(text)) {
    text = text.replace(/^\s*INSERT\s+IGNORE\s+/i, 'INSERT ');
    if (!/ON\s+CONFLICT/i.test(text)) {
      text = text.replace(/;\s*$/, '') + ' ON CONFLICT DO NOTHING';
    }
  }

  // VALUES(col) in upserts -> EXCLUDED.col
  text = text.replace(/\bVALUES\s*\(\s*([a-zA-Z0-9_."`]+)\s*\)/gi, 'EXCLUDED.$1');

  // ON DUPLICATE KEY UPDATE -> ON CONFLICT DO UPDATE (infer unique columns from first VALUES list)
  const dupMatch = text.match(
    /^(INSERT\s+INTO\s+("?[a-zA-Z0-9_]+"?)\s*\(([^)]+)\)\s*VALUES\s*\([^)]+\)\s*)ON\s+DUPLICATE\s+KEY\s+UPDATE\s+(.+)$/is
  );
  if (dupMatch) {
    const table = dupMatch[2];
    const cols = dupMatch[3]
      .split(',')
      .map((c) => c.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
    const conflictCol = cols[0] || 'id';
    const updates = dupMatch[4].trim().replace(/;\s*$/, '');
    text = `${dupMatch[1]}ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updates}`;
  }

  // SHOW TABLES
  if (/^\s*SHOW\s+TABLES\b/i.test(text)) {
    return "SELECT tablename AS Tables_in_db FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename";
  }

  // SHOW COLUMNS
  const showCols = text.match(/^\s*SHOW\s+COLUMNS\s+FROM\s+("?[a-zA-Z0-9_]+"?)/i);
  if (showCols) {
    const table = showCols[1].replace(/"/g, '');
    return `SELECT column_name AS Field, data_type AS Type, is_nullable AS Null, column_default AS Default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '${table}'
      ORDER BY ordinal_position`;
  }

  // LIMIT offset, count  -> LIMIT count OFFSET offset
  text = text.replace(/\bLIMIT\s+(\?|\$\d+|\d+)\s*,\s*(\?|\$\d+|\d+)/gi, 'LIMIT $2 OFFSET $1');

  // Remove MySQL table options
  text = text.replace(/\)\s*ENGINE\s*=\s*InnoDB[^;]*/gi, ')');
  text = text.replace(/\s+DEFAULT\s+CHARSET\s*=\s*\w+/gi, '');
  text = text.replace(/\s+COLLATE\s*=\s*\w+/gi, '');
  text = text.replace(/\s+AUTO_INCREMENT\s*=\s*\d+/gi, '');
  text = text.replace(/\bAUTO_INCREMENT\b/gi, '');
  text = text.replace(/\bUNSIGNED\b/gi, '');
  text = text.replace(/\bTINYINT\b/gi, 'SMALLINT');
  text = text.replace(/\bMEDIUMINT\b/gi, 'INTEGER');
  text = text.replace(/\bDATETIME\b/gi, 'TIMESTAMP');
  text = text.replace(/\bLONGTEXT\b/gi, 'TEXT');
  text = text.replace(/\bMEDIUMTEXT\b/gi, 'TEXT');
  text = text.replace(/\bTINYTEXT\b/gi, 'TEXT');
  text = text.replace(/\bLONGTEXT\b/gi, 'TEXT');
  text = text.replace(/\bDOUBLE\b/gi, 'DOUBLE PRECISION');

  return text;
}

function toPgPlaceholders(sql, params) {
  const values = Array.isArray(params) ? params : [];
  let index = 0;
  const text = sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
  return { text, values };
}

function adaptQuery(sql, params) {
  const translated = adaptMysqlSqlToPg(sql);
  return toPgPlaceholders(translated, params);
}

function isSelectLike(sql) {
  return /^\s*(WITH\b|SELECT\b|SHOW\b)/i.test(String(sql || '').trim());
}

function isMutating(sql) {
  return /^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|REPLACE)\b/i.test(String(sql || '').trim());
}

function buildInsertReturning(sql) {
  const trimmed = String(sql || '').trim();
  if (!/^\s*INSERT\s+/i.test(trimmed)) return trimmed;
  if (/\bRETURNING\b/i.test(trimmed)) return trimmed;
  if (/^\s*INSERT\s+IGNORE\b/i.test(trimmed)) return trimmed;
  return trimmed.replace(/;\s*$/, '') + ' RETURNING id';
}

function toMysqlStyleResult(sql, pgResult) {
  const header = {
    insertId: 0,
    affectedRows: pgResult.rowCount || 0,
    changedRows: pgResult.rowCount || 0,
  };
  if (pgResult.rows && pgResult.rows.length) {
    const row = pgResult.rows[0];
    if (row && row.id != null) header.insertId = Number(row.id) || 0;
    else if (row && Object.keys(row).length === 1) {
      header.insertId = Number(Object.values(row)[0]) || 0;
    }
  }
  if (isSelectLike(sql)) {
    return [pgResult.rows || [], pgResult.fields || []];
  }
  return [header, undefined];
}

function mapPgError(err) {
  if (!err) return err;
  const mapped = err;
  if (err.code === '23505') {
    mapped.code = 'ER_DUP_ENTRY';
    mapped.errno = 1062;
  }
  if (err.code === '42703') {
    mapped.code = 'ER_BAD_FIELD_ERROR';
  }
  if (err.code === '42P01') {
    mapped.code = 'ER_NO_SUCH_TABLE';
  }
  return mapped;
}

module.exports = {
  adaptMysqlSqlToPg,
  adaptQuery,
  isSelectLike,
  isMutating,
  buildInsertReturning,
  toMysqlStyleResult,
  mapPgError,
};
