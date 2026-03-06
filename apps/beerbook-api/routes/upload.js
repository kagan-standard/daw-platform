/**
 * POST /api/upload and POST /api/upload/photo — multipart image upload (auth required)
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDir(UPLOAD_DIR);
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    if (!ALLOWED_EXT.includes(ext)) return cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed.'));
    const uid = (req.claims && req.claims.sub) || 'anon';
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    cb(null, `${uid}_${ts}_${rand}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (ALLOWED_EXT.includes(ext) || ALLOWED_MIMES.includes(mime)) return cb(null, true);
    cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed.'));
  },
});

function uploadResponse(file, res) {
  const baseUrl = (process.env.API_BASE_URL || 'https://api.beerbook.drinksafterwork.net').replace(/\/$/, '');
  const url = `${baseUrl}/uploads/${file.filename}`;
  res.status(201).json({ url, filename: file.filename });
}

module.exports = function (opts) {
  const router = express.Router();

  function handleUpload(req, res, next) {
    upload.fields([
      { name: 'file', maxCount: 1 },
      { name: 'photo', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
          return res.status(400).json({ error: err.message || 'Upload failed' });
        }
        if (err.message && err.message.includes('Invalid file type')) return res.status(400).json({ error: err.message });
        return next(err);
      }
      const selectedFile = req.files?.file?.[0] || req.files?.photo?.[0] || null;
      if (!selectedFile) {
        return res.status(400).json({ error: 'No file uploaded (use field name "file" or "photo")' });
      }
      uploadResponse(selectedFile, res);
    });
  }

  router.post('/', opts.authMiddleware, handleUpload);
  router.post('/photo', opts.authMiddleware, handleUpload);

  return router;
};
