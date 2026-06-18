'use strict';

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[µμ]/g, 'u')
    .replace(/[^a-z0-9.%/+\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeLabel(label) {
  return norm(label)
    .split(' ')
    .filter((t) => t.length > 1);
}

function extractNumber(text) {
  const m = String(text || '').match(/[-+]?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  return m[0].replace(',', '.');
}

function lineScore(lineNorm, tokens) {
  if (!lineNorm || !tokens.length) return 0;
  let hits = 0;
  tokens.forEach((t) => {
    if (lineNorm.includes(t)) hits += 1;
  });
  return hits / tokens.length;
}

function findBestLine(lines, label, unit) {
  const tokens = tokenizeLabel(label);
  const unitNorm = norm(unit);
  let best = { idx: -1, score: 0, line: '' };
  lines.forEach((line, idx) => {
    const ln = norm(line);
    if (!ln) return;
    let score = lineScore(ln, tokens);
    if (unitNorm && ln.includes(unitNorm)) score += 0.15;
    if (score > best.score) best = { idx, score, line };
  });
  return best;
}

function valueFromLine(line, label) {
  const raw = String(line || '');
  const labelNorm = norm(label);
  const parts = raw.split(/[:\t|]/);
  for (let i = 0; i < parts.length; i++) {
    const pNorm = norm(parts[i]);
    if (pNorm && labelNorm && pNorm.includes(labelNorm.split(' ')[0])) {
      for (let j = i + 1; j < parts.length; j++) {
        const num = extractNumber(parts[j]);
        if (num != null) return num;
      }
    }
  }
  const afterColon = raw.split(':').slice(1).join(':');
  const num = extractNumber(afterColon || raw);
  return num != null ? num : afterColon.trim() || raw.trim();
}

function mapToTemplateFields(rawText, template) {
  const fields = Array.isArray(template && template.fields) ? template.fields : [];
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const fullNorm = norm(rawText);
  const mapped = [];

  fields.forEach((f) => {
    const key = f.key;
    const label = f.label || key;
    const type = String(f.type || 'text').toLowerCase();
    let value = '';
    let confidence = 0;

    if (type === 'number') {
      const hit = findBestLine(lines, label, f.unit);
      if (hit.score >= 0.45) {
        value = valueFromLine(hit.line, label);
        confidence = Math.min(0.95, 0.55 + hit.score * 0.35);
      } else if (label && fullNorm.includes(norm(label))) {
        const idx = lines.findIndex((l) => norm(l).includes(norm(label)));
        if (idx >= 0) {
          value = valueFromLine(lines[idx], label);
          if (idx + 1 < lines.length && !value) value = valueFromLine(lines[idx + 1], label);
          confidence = 0.55;
        }
      }
    } else if (type === 'textarea' || type === 'text') {
      const tokens = tokenizeLabel(label);
      const hit = findBestLine(lines, label, '');
      if (hit.score >= 0.5) {
        value = hit.line;
        confidence = Math.min(0.85, 0.45 + hit.score * 0.3);
      } else if (tokens.length && fullNorm.includes(tokens[0])) {
        const idx = lines.findIndex((l) => norm(l).includes(tokens[0]));
        if (idx >= 0) {
          const chunk = lines.slice(idx, Math.min(lines.length, idx + 4)).join('\n');
          value = chunk;
          confidence = 0.5;
        }
      }
    }

    if (value != null && String(value).trim() !== '') {
      mapped.push({ fieldKey: key, value: String(value).trim(), confidence: Number(confidence.toFixed(2)) });
    }
  });

  return mapped;
}

module.exports = {
  mapToTemplateFields,
};
