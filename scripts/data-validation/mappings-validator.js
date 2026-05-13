/**
 * Mappings validator — guards against silent duplicate-key bugs in
 * config/wikidata-mappings.js. JS object literals dedupe at parse time, so
 * `{ 'Q9585': 'a', 'Q9585': 'b' }` silently keeps only `b`. We scan the source
 * text instead of the parsed object so we catch the duplicates.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MAPPINGS_PATH = path.resolve(__dirname, '../../config/wikidata-mappings.js');

const EXPORT_RE = /export\s+const\s+(\w+)\s*=\s*\{([\s\S]*?)\n\s*\}\s*;/g;
const KEY_RE = /['"]([A-Za-z0-9_]+)['"]\s*:/g;

export function findDuplicateKeys(source) {
  const violations = [];
  for (const match of source.matchAll(EXPORT_RE)) {
    const exportName = match[1];
    const body = match[2];
    const seen = new Map();
    for (const k of body.matchAll(KEY_RE)) {
      const key = k[1];
      if (seen.has(key)) {
        violations.push({ exportName, key, firstAt: seen.get(key), secondAt: k.index });
      } else {
        seen.set(key, k.index);
      }
    }
  }
  return violations;
}

export function validateMappingsFile(filePath = DEFAULT_MAPPINGS_PATH) {
  const source = fs.readFileSync(filePath, 'utf8');
  const violations = findDuplicateKeys(source);
  if (violations.length > 0) {
    const summary = violations
      .map(v => `  ${v.exportName}: duplicate key "${v.key}"`)
      .join('\n');
    throw new Error(`wikidata-mappings.js has duplicate keys:\n${summary}`);
  }
  return true;
}
