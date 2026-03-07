#!/usr/bin/env node

/**
 * CI policy check: scan Supabase migration files for forbidden destructive
 * patterns.  Exits non-zero if any violation is found.
 *
 * Usage:
 *   node scripts/check-migration-safety.js
 *
 * Forbidden patterns (case-insensitive):
 *   - TRUNCATE ... CASCADE
 *   - DROP TABLE  (unless IF EXISTS + commented as intentional)
 *   - DELETE FROM without a WHERE clause
 *
 * This script is intended to run as a CI step or pre-commit hook.
 */

const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

const FORBIDDEN_PATTERNS = [
  {
    name: 'TRUNCATE … CASCADE',
    regex: /TRUNCATE\s+(?:TABLE\s+)?[^\n;]*CASCADE/gi,
  },
  {
    name: 'DROP TABLE (unguarded)',
    regex: /DROP\s+TABLE\s+(?!IF\s+EXISTS)[^\n;]+/gi,
  },
  {
    name: 'DELETE FROM without WHERE',
    regex: /DELETE\s+FROM\s+\S+\s*;/gi,
  },
];

function stripComments(sql) {
  return sql
    .replace(/--[^\n]*/g, '')        // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // block comments
}

function scanFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const content = stripComments(raw);
  const violations = [];

  for (const { name, regex } of FORBIDDEN_PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const lineNum = raw.slice(0, match.index).split('\n').length;
      violations.push({ pattern: name, line: lineNum, snippet: match[0].trim().slice(0, 80) });
    }
  }

  return violations;
}

function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('No migrations directory found — nothing to check.');
    process.exit(0);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let totalViolations = 0;

  for (const file of files) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const violations = scanFile(fullPath);
    if (violations.length > 0) {
      totalViolations += violations.length;
      console.error(`\n❌  ${file}`);
      for (const v of violations) {
        console.error(`    line ${v.line}: [${v.pattern}] ${v.snippet}`);
      }
    }
  }

  if (totalViolations > 0) {
    console.error(`\n🚫  ${totalViolations} destructive pattern(s) found in migration files.`);
    console.error('    Move destructive SQL to scripts/ with an environment guard.');
    process.exit(1);
  }

  console.log(`✅  ${files.length} migration file(s) scanned — no destructive patterns found.`);
  process.exit(0);
}

main();
