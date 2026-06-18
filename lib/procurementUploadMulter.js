'use strict';

const fs = require('fs');
const path = require('path');

let multer;
try {
  multer = require('multer');
} catch (_) {
  multer = null;
}

const ALLOWED_EXT = new Set(['.xlsx', '.xls', '.csv', '.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg', '.webp']);
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'procurement-po');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

let uploadProcurementPo = null;
if (multer) {
  ensureUploadDir();
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureUploadDir();
      cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(String(file.originalname || '')).toLowerCase() || '.bin';
      const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
      cb(null, safe);
    },
  });
  uploadProcurementPo = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const name = String(file.originalname || '');
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
      cb(ALLOWED_EXT.has(ext) ? null : new Error('File type not allowed for procurement upload.'), ALLOWED_EXT.has(ext));
    },
  });
}

function procurementPoUploadMw(field = 'attachment') {
  if (uploadProcurementPo) return uploadProcurementPo.single(field);
  return (_req, res) => {
    res.redirect('/procurement?err=' + encodeURIComponent('File uploads unavailable (multer not installed).'));
  };
}

module.exports = {
  procurementPoUploadMw,
  PROCUREMENT_PO_UPLOAD_DIR: UPLOAD_DIR,
};
