/**
 * Small in-process LRU cache with a TTL and limits on entry count and
 * approximate size. In-repo on purpose, so it adds no dependency (#193).
 *
 * The size of a value is its JSON length, measured once when it is stored.
 * That undercounts the heap it occupies, so keep `maxBytes` well below the
 * memory you can spare. A value larger than `maxEntryBytes` isn't stored.
 *
 * Each entry records when its data was read (`dataAt`, the time it was
 * stored unless the option says otherwise), and `onHit` sees every entry a
 * get() returns, which server/helpers/edge-cache.js uses to limit how long
 * the edge keeps a response built from it.
 */
export default class BoundedCache {
  constructor({ maxEntries, maxBytes, maxEntryBytes = maxBytes, ttlMs, now = Date.now, dataAt = now, onHit = null }) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.maxEntryBytes = maxEntryBytes;
    this.ttlMs = ttlMs;
    this.now = now;
    this.dataAt = dataAt;
    this.onHit = onHit;
    this.entries = new Map();
    this.bytes = 0;
  }

  get size() {
    return this.entries.size;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.delete(key);
      return undefined;
    }
    // Re-insert so the Map's insertion order doubles as recency order.
    this.entries.delete(key);
    this.entries.set(key, entry);
    if (this.onHit) this.onHit(entry);
    return entry.value;
  }

  set(key, value) {
    const size = (JSON.stringify(value) || '').length;
    this.delete(key);
    if (size > this.maxEntryBytes) return false;

    this.entries.set(key, { value, size, expiresAt: this.now() + this.ttlMs, dataAt: this.dataAt() });
    this.bytes += size;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      this.delete(this.entries.keys().next().value);
    }
    return true;
  }

  delete(key) {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.bytes -= entry.size;
    return true;
  }

  deleteWhere(predicate) {
    for (const key of [...this.entries.keys()]) {
      if (predicate(key)) this.delete(key);
    }
  }

  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}
