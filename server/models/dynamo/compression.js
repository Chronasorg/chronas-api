import { gzipSync, gunzipSync } from 'zlib';

/**
 * Compression helpers for the oversized Metadata items that blow past
 * DynamoDB's 400 KB hard item limit (`provinces` = 819 KB, `ruler` = 137 KB).
 *
 * Flow:
 *   write → compressData(obj)   → Uint8Array stored as DynamoDB Binary type
 *   read  → decompressData(buf) → original object
 *
 * Items that carry compressed data set `dataCompressed: true` on the item
 * so the read side knows whether to decompress. Uncompressed metadata docs
 * are untouched.
 */

const MIN_COMPRESS_BYTES = 200 * 1024; // 200 KB — below this, raw JSON is fine

export function shouldCompress(data) {
  if (!data) return false;
  const approxBytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
  return approxBytes >= MIN_COMPRESS_BYTES;
}

export function compressData(data) {
  const json = JSON.stringify(data);
  return gzipSync(Buffer.from(json, 'utf8'));
}

export function decompressData(buf) {
  const unzipped = gunzipSync(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  return JSON.parse(unzipped.toString('utf8'));
}

/**
 * Wrap a metadata item for storage: if its `.data` field is big enough,
 * gzip it into a Binary and set `dataCompressed=true`.
 */
export function prepareForWrite(item) {
  if (!item || typeof item !== 'object') return item;
  if (!shouldCompress(item.data)) return item;
  return {
    ...item,
    data: compressData(item.data),
    dataCompressed: true
  };
}

/**
 * Unwrap a metadata item on read: if it carries `dataCompressed=true`,
 * gunzip the `.data` field back into an object.
 */
export function decodeFromRead(item) {
  if (!item || typeof item !== 'object') return item;
  if (!item.dataCompressed) return item;
  const out = { ...item };
  out.data = decompressData(item.data);
  delete out.dataCompressed;
  return out;
}
