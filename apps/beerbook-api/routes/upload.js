/**
 * POST /api/upload and POST /api/upload/photo — multipart image upload (auth required)
 *
 * Phase 1.4 hardening:
 *  - Extension AND MIME must both match (not OR)
 *  - Post-upload magic-byte verification
 *  - JWT sub sanitized to [a-zA-Z0-9_-] in filenames
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

const EXT_TO_MIMES = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.heic': ['image/heic'],
};

// Magic-byte signatures for post-upload verification.
// Each entry: { offset, bytes } — checked at the given file offset.
const MAGIC_SIGNATURES = {
  'image/jpeg': [{ offset: 0, bytes: Buffer.from([0xFF, 0xD8, 0xFF]) }],
  'image/png': [{ offset: 0, bytes: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) }],
  'image/webp': [
    { offset: 0, bytes: Buffer.from('RIFF', 'ascii') },
    { offset: 8, bytes: Buffer.from('WEBP', 'ascii') },
  ],
  'image/heic': [{ offset: 4, bytes: Buffer.from('ftyp', 'ascii') }],
};

function sanitizeSub(sub) {
  return String(sub || 'anon').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

/**
 * Read the first `length` bytes of a file and verify magic-byte signatures.
 * Returns true if all signature fragments match.
 */
function verifyMagicBytes(filePath, mime) {
  const sigs = MAGIC_SIGNATURES[mime];
  if (!sigs || !sigs.length) return true; // no signature defined — pass
  const maxNeeded = Math.max(...sigs.map((s) => s.offset + s.bytes.length));
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(maxNeeded);
    const bytesRead = fs.readSync(fd, buf, 0, maxNeeded, 0);
    if (bytesRead < maxNeeded) return false;
    return sigs.every((sig) => {
      const slice = buf.subarray(sig.offset, sig.offset + sig.bytes.length);
      return slice.equals(sig.bytes);
    });
  } catch (_) {
    return false;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {}
  }
}

function removeFile(filePath) {
  try { fs.unlinkSync(filePath); } catch (_) {}
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDir(UPLOAD_DIR);
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    if (!ALLOWED_EXT.includes(ext)) return cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed.'));
    const uid = sanitizeSub(req.claims && req.claims.sub);
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
    if (!ALLOWED_EXT.includes(ext) || !ALLOWED_MIMES.includes(mime)) {
      return cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed.'));
    }
    const validMimesForExt = EXT_TO_MIMES[ext];
    if (!validMimesForExt || !validMimesForExt.includes(mime)) {
      return cb(new Error('File extension does not match content type.'));
    }
    cb(null, true);
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
        if (err.message && (err.message.includes('Invalid file type') || err.message.includes('does not match'))) {
          return res.status(400).json({ error: err.message });
        }
        return next(err);
      }
      const selectedFile = req.files?.file?.[0] || req.files?.photo?.[0] || null;
      if (!selectedFile) {
        return res.status(400).json({ error: 'No file uploaded (use field name "file" or "photo")' });
      }

      const mime = (selectedFile.mimetype || '').toLowerCase();
      if (!verifyMagicBytes(selectedFile.path, mime)) {
        removeFile(selectedFile.path);
        return res.status(400).json({ error: 'File content does not match declared image type (magic-byte check failed).' });
      }

      uploadResponse(selectedFile, res);
    });
  }

  router.post('/', opts.authMiddleware, handleUpload);
  router.post('/photo', opts.authMiddleware, handleUpload);

  return router;
};
