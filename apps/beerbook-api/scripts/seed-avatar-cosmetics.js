#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Seed avatar cosmetics from a CSV file into public.cosmetics.
 *
 * CSV columns: filename, Avatar Name, Cost (many Cost values may be empty).
 * Pricing: 25–150 tabs. Use CSV Cost when present and in range; otherwise 25 + (index % 126) or tier.
 *
 * Usage:
 *   node scripts/seed-avatar-cosmetics.js [path/to/avatars.csv]
 *   AVATARS_CSV=path/to/avatars.csv node scripts/seed-avatar-cosmetics.js
 *
 * Required env:
 *   SUPABASE_URL or SUPABASE_REST_URL
 *   SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY
 */

const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config();
} catch (_) {
  /* dotenv not installed; rely on process.env */
}

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || process.env.SUPABASE_REST_URL || ''
).replace(/\/$/, '');
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error('SUPABASE_URL or SUPABASE_REST_URL is required.');
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY is required.');
  process.exit(1);
}

/** Parse a single CSV line (handles quoted fields). */
function parseCsvLine(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let end = line.indexOf('"', i + 1);
      const parts = [];
      while (end !== -1 && line[end + 1] === '"') {
        parts.push(line.slice(i + 1, end));
        i = end + 2;
        end = line.indexOf('"', i);
      }
      if (end === -1) {
        out.push(line.slice(i + 1).replace(/""/g, '"'));
        break;
      }
      parts.push(line.slice(i + 1, end).replace(/""/g, '"'));
      out.push(parts.join('"'));
      i = end + 1;
      if (line[i] === ',') i += 1;
    } else {
      const comma = line.indexOf(',', i);
      if (comma === -1) {
        out.push(line.slice(i).trim());
        break;
      }
      out.push(line.slice(i, comma).trim());
      i = comma + 1;
    }
  }
  return out;
}

/** Build unique slug from name; usedKeys tracks duplicates and gets _2, _3, etc. */
function slugFromName(name, usedKeys) {
  let base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (!base) base = 'avatar';
  let key = base;
  let n = 2;
  while (usedKeys.has(key)) {
    key = `${base}_${n}`;
    n += 1;
  }
  usedKeys.add(key);
  return key;
}

/** Rarity from price band: 25–50 common, 51–100 rare, 101–150 epic. */
function rarityFromPrice(price) {
  if (price <= 50) return 'common';
  if (price <= 100) return 'rare';
  return 'epic';
}

function buildAvatarRows(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const filenameIdx = header.findIndex((h) => /filename/i.test(h));
  let nameIdx = header.findIndex((h) => /avatar\s*name/i.test(h));
  if (nameIdx < 0) nameIdx = header.findIndex((h) => /^name$/i.test(h));
  const costIdx = header.findIndex((h) => /cost/i.test(h));

  const usedKeys = new Set();
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const filename = filenameIdx >= 0 ? (cells[filenameIdx] || '').trim() : '';
    const avatarName = nameIdx >= 0 ? (cells[nameIdx] || '').trim() : '';
    if (!filename || !avatarName) continue;

    const costRaw = costIdx >= 0 ? (cells[costIdx] || '').trim() : '';
    let tabPrice = parseInt(costRaw, 10);
    if (!Number.isInteger(tabPrice) || tabPrice < 25 || tabPrice > 150) {
      tabPrice = 25 + (i % 126);
    }

    const key = slugFromName(avatarName, usedKeys);
    const assetUrl = `/images/avatars/${filename}`;

    rows.push({
      key,
      type: 'avatar',
      name: avatarName,
      description: `Avatar: ${avatarName}`,
      rarity: rarityFromPrice(tabPrice),
      asset_url: assetUrl,
      preview_asset_url: assetUrl,
      title_text: null,
      unlock_type: 'purchase',
      achievement_key: null,
      tab_price: tabPrice,
      active: true,
      sort_order: i - 1,
    });
  }
  return rows;
}

async function upsertCosmetics(rows) {
  const url = `${SUPABASE_URL}/cosmetics?on_conflict=key`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = text;
  }

  if (!res.ok) {
    throw new Error(`Upsert failed (${res.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }

  return Array.isArray(body) ? body : [];
}

async function run() {
  const csvPath = process.env.AVATARS_CSV || process.argv[2];
  if (!csvPath) {
    console.error('Usage: node scripts/seed-avatar-cosmetics.js <path-to-avatars.csv>');
    console.error('   or set AVATARS_CSV in the environment.');
    process.exit(1);
  }
  const resolved = path.resolve(csvPath);
  if (!fs.existsSync(resolved)) {
    console.error('File not found:', resolved);
    process.exit(1);
  }

  const rows = buildAvatarRows(resolved);
  if (!rows.length) {
    console.log('No avatar rows parsed from CSV.');
    return;
  }
  const result = await upsertCosmetics(rows);
  console.log(`Seeded avatar cosmetics: ${rows.length} items processed, ${result.length} rows returned.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
