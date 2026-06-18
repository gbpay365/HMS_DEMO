'use strict';

const ensureDiagTemplateRefSchema = require('./ensureDiagTemplateRefSchema');

function parseNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mergeTemplateFields(template, overrideRows) {
  if (!template) return template;
  const fields = Array.isArray(template.fields) ? template.fields : [];
  if (!fields.length) return template;
  const ovMap = new Map();
  (overrideRows || []).forEach((o) => {
    if (o && o.field_key) ovMap.set(String(o.field_key), o);
  });
  if (!ovMap.size) return template;
  const mergedFields = fields.map((f) => {
    const ov = ovMap.get(f.key);
    if (!ov) return f;
    const out = Object.assign({}, f);
    if (ov.ref_range != null && String(ov.ref_range).trim() !== '') {
      out.refRange = String(ov.ref_range).trim();
    }
    const nMin = parseNum(ov.normal_min);
    const nMax = parseNum(ov.normal_max);
    if (nMin != null) out.normalMin = nMin;
    if (nMax != null) out.normalMax = nMax;
    return out;
  });
  return Object.assign({}, template, { fields: mergedFields });
}

function groupOverridesByTemplate(rows) {
  const map = {};
  (rows || []).forEach((r) => {
    const k = String(r.template_key || '');
    if (!k) return;
    if (!map[k]) map[k] = [];
    map[k].push(r);
  });
  return map;
}

function mergeTemplateBundle(bundle, overrideRows) {
  if (!bundle || typeof bundle !== 'object') return bundle;
  const byTpl = groupOverridesByTemplate(overrideRows);
  const out = {};
  Object.keys(bundle).forEach((cat) => {
    const tests = bundle[cat];
    if (!Array.isArray(tests)) {
      out[cat] = tests;
      return;
    }
    out[cat] = tests.map((t) => mergeTemplateFields(t, byTpl[t.id] || []));
  });
  return out;
}

async function loadOverrides(pool, facilityId, module, templateKey) {
  await ensureDiagTemplateRefSchema(pool);
  const fid = Math.max(1, parseInt(String(facilityId || 1), 10) || 1);
  const mod = module === 'radiology' ? 'radiology' : 'laboratory';
  let sql = `SELECT template_key, field_key, ref_range, normal_min, normal_max, updated_at
               FROM tbl_diag_template_ref_override
              WHERE facility_id = ? AND module = ?`;
  const params = [fid, mod];
  if (templateKey) {
    sql += ' AND template_key = ?';
    params.push(String(templateKey));
  }
  const [rows] = await pool.query(sql, params).catch(() => [[]]);
  return rows || [];
}

async function saveOverrides(pool, facilityId, module, templateKey, fieldRows, userId) {
  await ensureDiagTemplateRefSchema(pool);
  const fid = Math.max(1, parseInt(String(facilityId || 1), 10) || 1);
  const mod = module === 'radiology' ? 'radiology' : 'laboratory';
  const tpl = String(templateKey || '').trim();
  if (!tpl) throw new Error('Template key is required.');
  const uid = parseInt(String(userId || 0), 10) || null;
  const list = Array.isArray(fieldRows) ? fieldRows : [];
  for (const row of list) {
    const fk = String(row.field_key || row.fieldKey || '').trim();
    if (!fk) continue;
    const refRange = row.ref_range != null ? String(row.ref_range).trim() : row.refRange != null ? String(row.refRange).trim() : null;
    const nMin = parseNum(row.normal_min != null ? row.normal_min : row.normalMin);
    const nMax = parseNum(row.normal_max != null ? row.normal_max : row.normalMax);
    const empty = !refRange && nMin == null && nMax == null;
    if (empty) {
      await pool
        .query(
          `DELETE FROM tbl_diag_template_ref_override
            WHERE facility_id = ? AND module = ? AND template_key = ? AND field_key = ?`,
          [fid, mod, tpl, fk]
        )
        .catch(() => {});
      continue;
    }
    await pool.query(
      `INSERT INTO tbl_diag_template_ref_override
         (facility_id, module, template_key, field_key, ref_range, normal_min, normal_max, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ref_range = VALUES(ref_range),
         normal_min = VALUES(normal_min),
         normal_max = VALUES(normal_max),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [fid, mod, tpl, fk, refRange || null, nMin, nMax, uid]
    );
  }
  return loadOverrides(pool, fid, mod, tpl);
}

function refsForEditUi(template, overrideRows) {
  const merged = mergeTemplateFields(template, overrideRows);
  const fields = Array.isArray(merged.fields) ? merged.fields : [];
  return fields
    .filter((f) => f.type === 'number' || f.refRange || f.normalMin != null || f.normalMax != null)
    .map((f) => ({
      field_key: f.key,
      label: f.label || f.key,
      unit: f.unit || '',
      ref_range: f.refRange || '',
      normal_min: f.normalMin != null ? f.normalMin : null,
      normal_max: f.normalMax != null ? f.normalMax : null,
    }));
}

module.exports = {
  mergeTemplateFields,
  mergeTemplateBundle,
  loadOverrides,
  saveOverrides,
  refsForEditUi,
};
