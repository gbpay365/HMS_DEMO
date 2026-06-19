'use strict';

/** Translate common MySQL SQL to PostgreSQL for HMS demo / Railway deploy. */

function translateJsonFunctions(sql) {
  let text = sql;

  // JSON_UNQUOTE(JSON_EXTRACT(col, '$[n].field'))
  text = text.replace(
    /JSON_UNQUOTE\s*\(\s*JSON_EXTRACT\s*\(\s*([^,]+?)\s*,\s*'\$\[(\d+)\]\.([^']+)'\s*\)\s*\)/gi,
    '($1::json->$2->>\'$3\')'
  );
  // JSON_EXTRACT(col, '$[n].field')
  text = text.replace(
    /JSON_EXTRACT\s*\(\s*([^,]+?)\s*,\s*'\$\[(\d+)\]\.([^']+)'\s*\)/gi,
    '($1::json->$2->>\'$3\')'
  );
  // JSON_UNQUOTE(JSON_EXTRACT(col, '$.field'))
  text = text.replace(
    /JSON_UNQUOTE\s*\(\s*JSON_EXTRACT\s*\(\s*([^,]+?)\s*,\s*'\$\.([^']+)'\s*\)\s*\)/gi,
    '($1::json->>\'$2\')'
  );
  // JSON_EXTRACT(col, '$.field')
  text = text.replace(
    /JSON_EXTRACT\s*\(\s*([^,]+?)\s*,\s*'\$\.([^']+)'\s*\)/gi,
    '($1::json->>\'$2\')'
  );

  return text;
}

function translateCastTypes(sql) {
  let text = String(sql);
  text = text.replace(
    /\bCAST\s*\(\s*((?:\([^()]*\)|[^()])+)\s+AS\s+(?:UNSIGNED|SIGNED|INT)\s*\)/gi,
    'CAST($1 AS INTEGER)'
  );
  // MySQL CAST(x AS CHAR) → TEXT (Postgres CHAR without length is bpchar(1) and truncates role ids)
  text = text.replace(
    /\bCAST\s*\(\s*((?:\([^()]*\)|[^()])+)\s+AS\s+CHAR(?:\(\d+\))?\s*\)/gi,
    'CAST($1 AS TEXT)'
  );
  return text;
}

function convertGroupConcatInner(inner) {
  let body = String(inner || '').trim();
  let distinct = '';
  if (/^DISTINCT\s+/i.test(body)) {
    distinct = 'DISTINCT ';
    body = body.replace(/^DISTINCT\s+/i, '').trim();
  }

  let separator = "','";
  const sepMatch = body.match(/\s+SEPARATOR\s+('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*$/i);
  if (sepMatch) {
    separator = sepMatch[1];
    body = body.slice(0, sepMatch.index).trim();
  }

  let orderBy = '';
  const orderMatch = body.match(/\s+ORDER\s+BY\s+([\s\S]+)$/i);
  let expr = body;
  if (orderMatch) {
    orderBy = orderMatch[1].trim();
    expr = body.slice(0, orderMatch.index).trim();
  }

  return `STRING_AGG(${distinct}${expr}::text, ${separator}${orderBy ? ` ORDER BY ${orderBy}` : ''})`;
}

function translateGroupConcat(sql) {
  let text = String(sql);
  let out = '';
  let idx = 0;
  while (idx < text.length) {
    const slice = text.slice(idx);
    const m = slice.match(/\bGROUP_CONCAT\s*\(/i);
    if (!m || m.index == null) {
      out += text.slice(idx);
      break;
    }
    const start = idx + m.index;
    out += text.slice(idx, start);
    const open = start + m[0].length;
    let depth = 1;
    let i = open;
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') depth -= 1;
      i += 1;
    }
    out += convertGroupConcatInner(text.slice(open, i - 1));
    idx = i;
  }
  return out;
}

function translateMysqlStringLiterals(sql) {
  // MySQL double-quoted strings (HMS legacy SQL) → PostgreSQL single-quoted literals.
  return String(sql).replace(/"([^"]*)"/g, (match, content) => {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(content)) return match;
    return `'${content.replace(/'/g, "''")}'`;
  });
}

function translateIfFunction(sql) {
  let text = String(sql);
  let prev;
  do {
    prev = text;
    text = text.replace(
      /\bIF\s*\(\s*([^,()]+(?:\([^()]*\)[^,()]*)*)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi,
      '(CASE WHEN $1 THEN $2 ELSE $3 END)'
    );
  } while (text !== prev);
  return text;
}

function translateDateDiff(sql) {
  // MySQL DATEDIFF(a, b) → day difference (a − b)
  return String(sql).replace(
    /\bDATEDIFF\s*\(\s*((?:[^()]|\([^()]*\))+)\s*,\s*((?:[^()]|\([^()]*\))+)\s*\)/gi,
    '(($1)::date - ($2)::date)'
  );
}

function translateDateFunction(sql) {
  // MySQL DATE(expr) → date cast (after DATE_FORMAT → TO_CHAR)
  return String(sql).replace(/\bDATE\s*\(\s*([^)]+)\s*\)/gi, '($1)::date');
}

function translateOrderByBooleanCompare(sql) {
  // ORDER BY col = 'value' DESC  →  ORDER BY (col = 'value') DESC
  return sql.replace(
    /\bORDER\s+BY\s+([a-zA-Z0-9_."`]+)\s*=\s*('(?:[^'\\]|\\.)*')\s+(ASC|DESC)\b/gi,
    'ORDER BY ($1 = $2) $3'
  );
}

/** Expand mysql2-style IN (?) when param is an array. */
function expandInArrayParams(sql, params) {
  const outParams = [];
  let result = '';
  let p = 0;
  for (let i = 0; i < sql.length; i += 1) {
    if (sql[i] === '?' && p < params.length) {
      const before = result.replace(/\s+$/, '');
      if (/IN\s*\($/i.test(before) && Array.isArray(params[p])) {
        const arr = params[p++];
        if (!arr.length) {
          result += 'NULL';
        } else {
          result += arr
            .map((v) => {
              outParams.push(v);
              return '?';
            })
            .join(', ');
        }
        continue;
      }
      result += '?';
      outParams.push(params[p++]);
      continue;
    }
    result += sql[i];
  }
  while (p < params.length) outParams.push(params[p++]);
  return { sql: result, params: outParams };
}

function adaptMysqlSqlToPg(sql) {
  let text = String(sql || '');

  // MySQL conditional comments / hints
  text = text.replace(/\/\*!?\d*\s*/g, '/* ');

  // Backtick identifiers
  text = text.replace(/`([^`]+)`/g, '"$1"');

  text = translateJsonFunctions(text);
  text = translateCastTypes(text);
  text = translateMysqlStringLiterals(text);
  text = translateOrderByBooleanCompare(text);
  text = translateGroupConcat(text);

  // Date helpers (after CURDATE translation below is applied — run DATEDIFF before DATE())
  text = text.replace(/\bCURDATE\s*\(\s*\)/gi, 'CURRENT_DATE');
  text = translateDateDiff(text);
  text = translateDateFunction(text);
  text = translateIfFunction(text);

  // Functions / expressions
  text = text.replace(/\bTABLE_SCHEMA\s*=\s*DATABASE\s*\(\s*\)/gi, "table_schema = 'public'");
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
  text = text.replace(/\bCURTIME\s*\(\s*\)/gi, 'CURRENT_TIME');
  text = text.replace(/\bDATE_FORMAT\s*\(/gi, 'TO_CHAR(');
  text = text.replace(/\bUNIX_TIMESTAMP\s*\(\s*\)/gi, 'EXTRACT(EPOCH FROM NOW())');
  text = text.replace(/\bUNIX_TIMESTAMP\s*\(/gi, 'EXTRACT(EPOCH FROM ');
  text = text.replace(/\bYEAR\s*\(\s*([^)]+)\s*\)/gi, 'EXTRACT(YEAR FROM $1)');
  text = text.replace(/\bMONTH\s*\(\s*([^)]+)\s*\)/gi, 'EXTRACT(MONTH FROM $1)');

  // MySQL column DDL fragments (safety net if any CREATE/ALTER slips through)
  text = text.replace(/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, '');

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
  // UNSIGNED only in DDL — stripping globally breaks `CAST(x AS UNSIGNED)` before translation completes.
  if (/^\s*CREATE\s+TABLE/i.test(text)) {
    text = text.replace(/\bUNSIGNED\b/gi, '');
  }
  text = text.replace(/\bTINYINT\b/gi, 'SMALLINT');
  text = text.replace(/\bMEDIUMINT\b/gi, 'INTEGER');
  text = text.replace(/\bDATETIME\b/gi, 'TIMESTAMP');
  text = text.replace(/\bLONGTEXT\b/gi, 'TEXT');
  text = text.replace(/\bMEDIUMTEXT\b/gi, 'TEXT');
  text = text.replace(/\bTINYTEXT\b/gi, 'TEXT');
  text = text.replace(/\bDOUBLE\b/gi, 'DOUBLE PRECISION');

  // UPDATE ... LIMIT n (MySQL) — not valid on PostgreSQL
  text = text.replace(/(\bUPDATE\b[\s\S]+?\bWHERE\b[^;]+?)\s+LIMIT\s+\d+\b/gi, '$1');

  // MySQL GET_LOCK / RELEASE_LOCK → PostgreSQL advisory locks
  text = text.replace(
    /\bSELECT\s+GET_LOCK\s*\(\s*\?\s*,\s*\d+\s*\)\s+AS\s+l\b/gi,
    'SELECT (CASE WHEN pg_try_advisory_lock(hashtext(?::text)) THEN 1 ELSE 0 END) AS l'
  );
  text = text.replace(
    /\bSELECT\s+RELEASE_LOCK\s*\(\s*\?\s*\)/gi,
    'SELECT pg_advisory_unlock(hashtext(?::text))'
  );

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
  const expanded = expandInArrayParams(String(sql || ''), Array.isArray(params) ? params : []);
  const translated = adaptMysqlSqlToPg(expanded.sql);
  return toPgPlaceholders(translated, expanded.params);
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
  expandInArrayParams,
  translateJsonFunctions,
  isSelectLike,
  isMutating,
  buildInsertReturning,
  toMysqlStyleResult,
  mapPgError,
};
