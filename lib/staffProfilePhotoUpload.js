'use strict';

const fs = require('fs');
const path = require('path');

let multer = null;
try {
  multer = require('multer');
} catch (_) {
  multer = null;
}

const STAFF_PROFILE_UPLOAD_ROOT = path.join(__dirname, '..', 'public', 'uploads', 'staff-profiles');

function ensureStaffProfileUploadRoot() {
  fs.mkdirSync(STAFF_PROFILE_UPLOAD_ROOT, { recursive: true });
}

function safeUploadName(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  const okExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  return stamp + okExt;
}

function uploadedStaffPhotoPath(file) {
  return file && file.filename ? 'staff-profiles/' + file.filename : '';
}

function staffProfilePhotoMiddleware(fieldName = 'profile_photo') {
  if (!multer) {
    return function noUpload(req, res, next) {
      next();
    };
  }
  ensureStaffProfileUploadRoot();
  const storage = multer.diskStorage({
    destination: function destination(req, file, cb) {
      ensureStaffProfileUploadRoot();
      cb(null, STAFF_PROFILE_UPLOAD_ROOT);
    },
    filename: function filename(req, file, cb) {
      cb(null, safeUploadName(file.originalname));
    },
  });
  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function fileFilter(req, file, cb) {
      const mime = String(file.mimetype || '').toLowerCase();
      const ok = /^image\/(jpeg|jpg|png|webp|gif)$/.test(mime);
      cb(ok ? null : new Error('Only JPG, PNG, WEBP, or GIF profile photos are allowed.'), ok);
    },
  }).single(fieldName);
}

module.exports = {
  STAFF_PROFILE_UPLOAD_ROOT,
  ensureStaffProfileUploadRoot,
  staffProfilePhotoMiddleware,
  uploadedStaffPhotoPath,
};
