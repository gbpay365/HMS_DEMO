'use strict';

const pdfParse = require('pdf-parse');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.heic']);

function extOf(name) {
  const s = String(name || '').toLowerCase();
  const i = s.lastIndexOf('.');
  return i >= 0 ? s.slice(i) : '';
}

function isPdf(mime, name) {
  const m = String(mime || '').toLowerCase();
  return m === 'application/pdf' || extOf(name) === '.pdf';
}

function isImage(mime, name) {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return true;
  return IMAGE_EXTS.has(extOf(name));
}

async function extractTextFromImage(buffer) {
  const Tesseract = require('tesseract.js');
  const { data } = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
  return String(data && data.text ? data.text : '').trim();
}

async function extractTextFromBuffer(buffer, opts = {}) {
  if (!buffer || !buffer.length) return { text: '', source: 'empty' };
  const mime = opts.mime || '';
  const name = opts.originalName || opts.filename || '';
  if (isPdf(mime, name)) {
    const parsed = await pdfParse(buffer);
    return { text: String(parsed.text || '').trim(), source: 'pdf' };
  }
  if (isImage(mime, name)) {
    const text = await extractTextFromImage(buffer);
    return { text, source: 'image' };
  }
  throw new Error('Unsupported file type. Upload a PDF or image (JPG, PNG, WEBP).');
}

module.exports = {
  extractTextFromBuffer,
  isPdf,
  isImage,
};
