/**
 * Multer middleware for lab / radiology result attachments (images, PDFs).
 */
const path = require('path');
const fs = require('fs');

let multer;
try {
  multer = require('multer');
} catch (_) {
  multer = null;
}

const EXTERNAL_UPLOAD_ROOT = path.join(__dirname, '..', 'public', 'uploads', 'external-results');
try {
  fs.mkdirSync(EXTERNAL_UPLOAD_ROOT, { recursive: true });
} catch (_) {}

let uploadExternalResult = null;
if (multer) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      const ym = new Date().toISOString().slice(0, 7);
      const dir = path.join(EXTERNAL_UPLOAD_ROOT, ym);
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (_) {}
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const safe = String(file.originalname || 'scan')
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .slice(0, 80);
      const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      cb(null, `${stamp}-${safe}`);
    },
  });
  uploadExternalResult = multer({
    storage,
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ok = /^(image\/(png|jpe?g|webp|heic|gif)|application\/pdf)$/i.test(
        String(file.mimetype || '')
      );
      cb(ok ? null : new Error('Only image or PDF uploads are allowed.'), ok);
    },
  });
}

function externalUploadMw(field) {
  if (uploadExternalResult) return uploadExternalResult.single(field);
  return (_req, res) => {
    res.status(503).json({
      success: false,
      message: 'File uploads are unavailable (multer not installed).',
    });
  };
}

function externalUploadArrayMw(field, maxCount = 8) {
  if (uploadExternalResult) return uploadExternalResult.array(field, maxCount);
  return (_req, res) => {
    res.status(503).json({
      success: false,
      message: 'File uploads are unavailable (multer not installed).',
    });
  };
}

function publicPathFromDisk(absPath) {
  return (
    '/' +
    path
      .relative(path.join(__dirname, '..', 'public'), absPath)
      .split(path.sep)
      .join('/')
  );
}

module.exports = {
  externalUploadMw,
  externalUploadArrayMw,
  publicPathFromDisk,
  EXTERNAL_UPLOAD_ROOT,
};
