/**
 * Async upload moderation worker (Option B: fire-and-forget).
 * After upload, runModeration is invoked in the background; if Vision flags content,
 * the file is deleted, profile/rating references are cleared, and user is notified.
 */

const fs = require('fs');
const path = require('path');
const { checkSafeSearch, isVisionSupportedFormat } = require('./visionModeration');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';

function removeFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (_) {}
}

/**
 * Run moderation for an uploaded file. Call via setImmediate so the upload response
 * is already sent. If the file is unsafe: delete file, clear profiles.avatar_url and
 * ratings.photo_url that reference the URL, and insert a tab_notifications row.
 *
 * @param {Function} rest - PostgREST client (method, path, opts)
 * @param {string} userId - Keycloak sub (user who uploaded)
 * @param {string} filePath - Absolute path to the saved file
 * @param {string} url - Public URL of the upload (baseUrl + /uploads/ + filename)
 */
async function runModeration(rest, userId, filePath, url) {
  if (!rest || typeof rest !== 'function') return;
  try {
    if (!fs.existsSync(filePath)) return;

    const ext = (path.extname(filePath) || '').toLowerCase();
    if (ext === '.heic') {
      return;
    }

    if (!isVisionSupportedFormat(filePath)) {
      return;
    }

    const { safe } = await checkSafeSearch(filePath);
    if (safe) return;

    removeFile(filePath);

    const encodedUrl = encodeURIComponent(url);
    await rest('PATCH', `/profiles?avatar_url=eq.${encodedUrl}`, {
      body: JSON.stringify({ avatar_url: null }),
    });
    await rest('PATCH', `/ratings?photo_url=eq.${encodedUrl}`, {
      body: JSON.stringify({ photo_url: null }),
    });

    await rest('POST', '/tab_notifications', {
      body: JSON.stringify({
        user_id: userId,
        notification_type: 'photo_removed',
        title: 'Photo removed',
        message: "Your photo was removed because it didn't meet our content guidelines.",
        target_type: 'tabs_profile',
        target_id: userId,
      }),
    });
  } catch (err) {
    console.error('Upload moderation error:', { userId, filePath, url, error: err?.message || err });
  }
}

module.exports = {
  runModeration,
};
