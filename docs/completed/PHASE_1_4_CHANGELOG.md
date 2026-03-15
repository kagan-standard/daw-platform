# Phase 1.4 — Fix Upload Content Validation

**Date:** 2026-03-07
**Issues resolved:** BE-F-01 (High), BE-F-05 (Medium), BE-F-08 (Medium), INT-14 (High)
**Scope:** Backend-only (`beerbook-api`)

---

## Summary

Hardened the upload pipeline to close content-validation bypass vectors. Previously, uploads were accepted if the file extension **or** MIME type matched the allowed list — an attacker could pair a malicious payload with a permissive MIME or extension to bypass the filter. JWT `sub` values were used raw in filenames, allowing path traversal or injection characters. The upload directory was never validated at startup, and served files lacked MIME-sniffing protection headers.

---

## Files Changed

| File | Changes |
|------|---------|
| `apps/beerbook-api/routes/upload.js` | Rewrote `fileFilter` to require extension **AND** MIME match; added extension-to-MIME cross-check map; added post-upload magic-byte verification for JPEG/PNG/WebP/HEIC; added `sanitizeSub()` to restrict JWT `sub` to `[a-zA-Z0-9_-]` (max 128 chars); added `verifyMagicBytes()` and `removeFile()` helpers; upload handler now deletes the file and returns 400 when magic bytes don't match |
| `apps/beerbook-api/server.js` | Added `X-Content-Type-Options: nosniff` header to `/uploads` static serving; non-image extensions receive `Content-Disposition: attachment` (forced download); added startup `UPLOAD_DIR` validation — resolves realpath, checks against approved prefix list, exits on failure; new env var `UPLOAD_DIR_APPROVED_PREFIXES` (optional, comma-separated) |
| `apps/beerbook-api/docs/API_CONTRACT_SCHEMA_AUDIT.md` | Documented upload validation changes: accepted formats, new 400 error shapes, startup validation behavior, and security headers |

---

## What Changed (Detail)

### 1. Extension AND MIME match (was OR)

The `fileFilter` now requires **both** the file extension and the declared MIME type to be in the allowed set, and cross-checks them against `EXT_TO_MIMES` to ensure they correspond (e.g., `.png` must pair with `image/png`).

### 2. Post-upload magic-byte verification

After multer writes the file to disk, the handler reads the first N bytes and verifies known magic signatures:

- **JPEG:** `FF D8 FF` at offset 0
- **PNG:** `89 50 4E 47 0D 0A 1A 0A` at offset 0
- **WebP:** `RIFF` at offset 0 + `WEBP` at offset 8
- **HEIC:** `ftyp` at offset 4

If bytes don't match, the file is deleted and a 400 is returned.

### 3. JWT `sub` sanitization in filenames

`sanitizeSub()` replaces any character outside `[a-zA-Z0-9_-]` with `_` and truncates to 128 characters. This prevents directory traversal, null-byte injection, and other special-character attacks in generated filenames.

### 4. UPLOAD_DIR startup validation

At startup, the server:
1. Creates `UPLOAD_DIR` if it doesn't exist
2. Resolves the real path via `fs.realpathSync` (follows symlinks)
3. Checks that the resolved path is under an approved base prefix
4. Exits with code 1 if validation fails

Approved prefixes default to the app root directory and `/data`. Override with the `UPLOAD_DIR_APPROVED_PREFIXES` env var (comma-separated paths).

### 5. Security headers on static serving

- All files under `/uploads` are served with `X-Content-Type-Options: nosniff`
- Files whose extension is not a known image type receive `Content-Disposition: attachment` to force download rather than inline rendering

---

## New Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UPLOAD_DIR_APPROVED_PREFIXES` | No | `<app root>, /data` | Comma-separated list of approved base paths for `UPLOAD_DIR`. Server exits if `UPLOAD_DIR` realpath is not under one of these prefixes. |

---

## Validation Steps

| # | Test | Expected |
|---|------|----------|
| 1 | Upload file with mismatched extension/MIME (e.g., `.png` file sent with `image/jpeg` MIME) | `400 { error: "File extension does not match content type." }` |
| 2 | Upload file with correct extension/MIME but wrong magic bytes (e.g., a text file renamed to `.jpg` with `image/jpeg` MIME) | `400 { error: "File content does not match declared image type (magic-byte check failed)." }` |
| 3 | Upload valid JPEG/PNG/WebP/HEIC with correct extension, MIME, and magic bytes | `201` with `{ url, filename }` |
| 4 | JWT `sub` contains special characters (e.g., `../../etc/passwd`) | Filename uses sanitized version (`______etc_passwd_...`) |
| 5 | Start server with `UPLOAD_DIR` pointing outside approved prefixes | Server logs error and exits with code 1 |
| 6 | Start server with valid `UPLOAD_DIR` | Server logs `UPLOAD_DIR validated: <resolved path>` and starts normally |
| 7 | Request a file from `/uploads/test.jpg` | Response includes `X-Content-Type-Options: nosniff` header |
| 8 | Request a non-image file from `/uploads/test.txt` | Response includes `Content-Disposition: attachment` header |
| 9 | Normal upload flow (valid image from frontend) | Succeeds without regression |

---

## Contract/Doc Implications

- **API_CONTRACT_SCHEMA_AUDIT.md** updated with:
  - Accepted upload formats and size limit
  - Three new 400 error response shapes
  - UPLOAD_DIR startup validation behavior
  - Security header documentation
- **No breaking changes** for well-formed uploads — only previously-invalid uploads (mismatched ext/MIME, spoofed content) are now rejected
- **Frontend impact:** Verify that the upload flow sends correct `Content-Type` for the file being uploaded. If the frontend already sends the browser's native MIME for the selected file, no changes are needed.
- **Deployment note:** If `UPLOAD_DIR` is a symlink or mapped volume, ensure its resolved path falls under an approved prefix. Set `UPLOAD_DIR_APPROVED_PREFIXES` if the default prefixes don't cover your deployment layout.
