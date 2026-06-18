'use strict';

const path = require('path');
const { normalizeProcurementUom } = require('./procurementUnits');
const { parseQtyWithUom } = require('./procurementQty');

function parsePriceToken(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const digits = raw.replace(/[^\d.,]/g, '').replace(',', '.');
  const n = parseFloat(digits);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseQtyToken(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 1;
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function normHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const PO_HEADER_ALIASES = {
  description: new Set([
    'description',
    'item',
    'product',
    'designation',
    'name',
    'article',
    'medicament',
    'drug',
    'material',
  ]),
  quantity: new Set(['quantity', 'qty', 'qte', 'quantite', 'amount qty']),
  uom: new Set(['uom', 'unit', 'units', 'unite', 'pack', 'packaging', 'measure']),
  unit_price: new Set(['unit price', 'price', 'unit cost', 'cost', 'prix', 'tarif', 'rate']),
};

function mapPoHeaderRow(cells) {
  const map = {};
  cells.forEach((cell, idx) => {
    const key = normHeader(cell);
    if (!key) return;
    for (const [field, aliases] of Object.entries(PO_HEADER_ALIASES)) {
      if (aliases.has(key)) {
        map[field] = idx;
        break;
      }
    }
  });
  return map;
}

function poLineFromCells(cells, colMap) {
  const get = (field, fallbackIdx) => {
    const idx = colMap[field];
    if (idx != null && cells[idx] != null) return String(cells[idx]).trim();
    if (fallbackIdx != null && cells[fallbackIdx] != null) return String(cells[fallbackIdx]).trim();
    return '';
  };

  const description = get('description', 0);
  if (!description || /^total\b/i.test(description)) return null;

  const quantityRaw = get('quantity', colMap.unit_price != null ? 1 : null);
  let quantity = 0;
  let uom = 'unit';
  if (colMap.uom != null && colMap.quantity != null) {
    quantity = parseQtyToken(get('quantity'));
    uom = normalizeProcurementUom(get('uom'));
  } else {
    const parsed = parseQtyWithUom(quantityRaw || get('quantity', 1));
    quantity = parsed.quantity;
    uom = parsed.uom;
  }
  if (!quantity) quantity = 1;
  let unit_price = parsePriceToken(get('unit_price'));

  if (!unit_price && cells.length >= 3) {
    unit_price = parsePriceToken(cells[cells.length - 1]);
  }

  return { description: description.slice(0, 512), quantity, uom, unit_price };
}

function parsePoLinesFromCsvText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);
  const rows = [];
  const warnings = [];
  let colMap = null;

  for (const line of lines) {
    const cells = line.includes('\t')
      ? line.split('\t').map((p) => p.trim())
      : line.includes(';')
        ? line.split(';').map((p) => p.trim())
        : line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));

    if (!colMap) {
      const candidate = mapPoHeaderRow(cells);
      if (candidate.description != null || candidate.quantity != null || candidate.unit_price != null) {
        colMap = candidate;
        continue;
      }
    }

    if (!colMap && cells.length >= 2) {
      colMap = { description: 0, quantity: 1, unit_price: cells.length >= 3 ? 2 : null, uom: null };
    }
    if (!colMap) continue;

    const row = poLineFromCells(cells, colMap);
    if (row) rows.push(row);
  }

  if (!rows.length) warnings.push('No purchase lines found in CSV/text.');
  return { rows, warnings };
}

function parsePoLinesFromExcel(buffer) {
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch (_) {
    throw new Error('Excel support unavailable (xlsx package missing).');
  }
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { rows: [], warnings: ['Workbook has no sheets.'] };

  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false });
  const rows = [];
  const warnings = [];
  let colMap = null;

  for (const rawRow of matrix) {
    const cells = (rawRow || []).map((c) => String(c ?? '').trim());
    if (!cells.some(Boolean)) continue;

    if (!colMap) {
      const candidate = mapPoHeaderRow(cells);
      if (candidate.description != null || candidate.quantity != null || candidate.unit_price != null) {
        colMap = candidate;
        continue;
      }
    }

    if (!colMap && cells.length >= 2) {
      colMap = { description: 0, quantity: 1, unit_price: cells.length >= 3 ? 2 : null, uom: null };
    }
    if (!colMap) continue;

    const row = poLineFromCells(cells, colMap);
    if (row) rows.push(row);
  }

  if (!rows.length) warnings.push('No purchase lines found in spreadsheet.');
  return { rows, warnings };
}

async function extractTextFromPdf(buffer) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return String(data.text || '');
}

async function extractTextFromDocx(buffer) {
  const mammoth = require('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return String(result.value || '');
}

function extOf(filename) {
  return path.extname(String(filename || '')).toLowerCase();
}

/**
 * Parse uploaded procurement file into PO line candidates.
 * @returns {Promise<{rows:Array, warnings:string[]}>}
 */
async function parsePoLinesFromFile(buffer, originalName) {
  const ext = extOf(originalName);
  if (ext === '.csv') {
    return parsePoLinesFromCsvText(buffer.toString('utf8'));
  }
  if (ext === '.xlsx' || ext === '.xls') {
    return parsePoLinesFromExcel(buffer);
  }
  if (ext === '.pdf') {
    const text = await extractTextFromPdf(buffer);
    return parsePoLinesFromCsvText(text);
  }
  if (ext === '.docx' || ext === '.doc') {
    const text = await extractTextFromDocx(buffer);
    return parsePoLinesFromCsvText(text);
  }
  throw new Error('Unsupported file type. Use CSV, Excel, PDF, or Word.');
}

function sumPoLineTotal(lines) {
  return (lines || []).reduce((acc, l) => acc + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0);
}

module.exports = {
  parsePoLinesFromFile,
  parsePoLinesFromCsvText,
  sumPoLineTotal,
};
