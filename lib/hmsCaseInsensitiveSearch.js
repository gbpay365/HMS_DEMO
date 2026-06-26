'use strict';

/** Trim user search text. */
function normalizeSearchTerm(q) {
  return String(q == null ? '' : q).trim();
}

/** SQL wildcard pattern — value is lowercased when used with LOWER(col) LIKE LOWER(?). */
function likePattern(q) {
  const term = normalizeSearchTerm(q);
  return term ? `%${term}%` : '%';
}

/** Repeat the same binding for n placeholders. */
function repeatBinding(value, count) {
  return Array.from({ length: count }, () => value);
}

/**
 * Case-insensitive patient name/code/phone match (MySQL + PostgreSQL).
 * @param {string} [alias] table alias without dot, e.g. "p"
 */
function patientSearchWhere(alias = '') {
  const a = alias ? `${alias}.` : '';
  return `(
    LOWER(${a}first_name) LIKE LOWER(?)
    OR LOWER(${a}last_name) LIKE LOWER(?)
    OR LOWER(CONCAT(COALESCE(${a}first_name, ''), ' ', COALESCE(${a}last_name, ''))) LIKE LOWER(?)
    OR LOWER(CONCAT(COALESCE(${a}last_name, ''), ' ', COALESCE(${a}first_name, ''))) LIKE LOWER(?)
    OR LOWER(COALESCE(${a}phone, '')) LIKE LOWER(?)
    OR CAST(${a}id AS CHAR) LIKE ?
    OR LOWER(COALESCE(${a}patient_code, '')) LIKE LOWER(?)
  )`;
}

/** Bindings for {@link patientSearchWhere} — seven placeholders. */
function patientSearchBindings(q) {
  const like = likePattern(q);
  const idLike = `%${normalizeSearchTerm(q)}%`;
  return [like, like, like, like, like, idLike, like];
}

/**
 * Generic multi-column case-insensitive OR match.
 * @param {string[]} columns SQL column expressions
 */
function columnsSearchWhere(columns) {
  const cols = (columns || []).filter(Boolean);
  if (!cols.length) return '1=1';
  return cols.map((c) => `LOWER(${c}) LIKE LOWER(?)`).join(' OR ');
}

function columnsSearchBindings(q, columnCount) {
  const like = likePattern(q);
  return repeatBinding(like, columnCount);
}

module.exports = {
  normalizeSearchTerm,
  likePattern,
  repeatBinding,
  patientSearchWhere,
  patientSearchBindings,
  columnsSearchWhere,
  columnsSearchBindings,
};
