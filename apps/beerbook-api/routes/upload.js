/**
 * POST /api/upload — multipart image upload (auth required)
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

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
    if (!ALLOWED_EXT.includes(ext)) return cb(new Error('Only jpg, png, webp allowed'));
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
    if (ALLOWED_EXT.includes(ext)) return cb(null, true);
    cb(new Error('Only jpg, png, webp allowed'));
  },
});

module.exports = function (opts) {
  const router = express.Router();

  router.post('/', opts.authMiddleware, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large (max 5MB)' });
        return res.status(400).json({ error: err.message || 'Upload failed' });
      }
      if (!req.file) return res.status(400).json({ error: 'No file uploaded (use field name "file")' });
      const filename = req.file.filename;
      res.status(201).json({ url: `/uploads/${filename}` });
    });
  });

  return router;
};
