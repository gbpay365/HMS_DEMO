'use strict';

let multer;
try {
  multer = require('multer');
} catch (_) {
  multer = null;
}

const ALLOWED_EXT = new Set(['.xlsx', '.xls', '.csv', '.pdf', '.docx', '.doc']);
const ALLOWED_MIME =
  /^(application\/vnd\.(openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|ms-excel)|application\/pdf|text\/csv)$/i;

let uploadPharmacyCatalog = null;
if (multer) {
  uploadPharmacyCatalog = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const name = String(file.originalname || '');
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
      const ok = ALLOWED_EXT.has(ext) || ALLOWED_MIME.test(String(file.mimetype || ''));
      cb(ok ? null : new Error('Only Excel (.xlsx), PDF, or Word (.docx) files are allowed.'), ok);
    },
  });
}

function pharmacyCatalogUploadMw(field = 'file') {
  if (uploadPharmacyCatalog) return uploadPharmacyCatalog.single(field);
  return (_req, res) => {
    res.redirect(
      '/catalog?err=' + encodeURIComponent('File uploads are unavailable (multer not installed).')
    );
  };
}

/** Generic catalog file upload (Excel, CSV, PDF, Word). */
const catalogUploadMw = pharmacyCatalogUploadMw;

module.exports = {
  pharmacyCatalogUploadMw,
  catalogUploadMw,
};
