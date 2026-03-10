/**
 * Google Cloud Vision Safe Search moderation for uploaded images.
 * Used by upload moderation (async) to flag adult, violence, racy content.
 * When disabled (no credentials or MODERATION_ENABLED=false), returns { safe: true }.
 */

const fs = require('fs');
const path = require('path');

const LIKELY = 4;
const VERY_LIKELY = 5;
const UNSAFE_LEVELS = new Set([LIKELY, VERY_LIKELY, 'LIKELY', 'VERY_LIKELY']);

function isUnsafeLikelihood(value) {
  if (value == null) return false;
  if (UNSAFE_LEVELS.has(value)) return true;
  const n = Number(value);
  return Number.isFinite(n) && UNSAFE_LEVELS.has(n);
}

/**
 * Check image for safe search (adult, violence, racy). Only runs for JPEG, PNG, WebP.
 * HEIC is not supported by Vision; callers should skip and treat as safe in v1.
 *
 * @param {string} filePath - Absolute path to image file
 * @returns {Promise<{ safe: boolean }>}
 */
async function checkSafeSearch(filePath) {
  const modEnabled = process.env.MODERATION_ENABLED !== 'false';
  const hasCreds = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!hasCreds || !modEnabled) {
    return { safe: true };
  }

  let client;
  try {
    const vision = require('@google-cloud/vision');
    client = new vision.ImageAnnotatorClient();
  } catch (err) {
    console.error('Vision client init failed (moderation disabled):', err?.message || err);
    return { safe: true };
  }

  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (err) {
    console.error('Vision moderation: could not read file:', filePath, err?.message || err);
    return { safe: true };
  }

  try {
    const [result] = await client.safeSearchDetection(buffer);
    const annotation = result?.safeSearchAnnotation;
    if (!annotation) return { safe: true };

    const adult = annotation.adult;
    const violence = annotation.violence;
    const racy = annotation.racy;
    const unsafe =
      isUnsafeLikelihood(adult) || isUnsafeLikelihood(violence) || isUnsafeLikelihood(racy);
    return { safe: !unsafe };
  } catch (err) {
    console.error('Vision Safe Search error:', err?.message || err);
    return { safe: true };
  }
}

/**
 * Returns true if the file extension is one we run Vision on (JPEG, PNG, WebP).
 * HEIC is not supported; caller should skip Vision and treat as safe.
 */
function isVisionSupportedFormat(filePath) {
  const ext = (path.extname(filePath) || '').toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
}

module.exports = {
  checkSafeSearch,
  isVisionSupportedFormat,
};
