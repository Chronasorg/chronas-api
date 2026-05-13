/**
 * Thin Chronas API client used by the validator and applier.
 * Centralised so unit tests can supply a mock with the same shape.
 */

const DIM_INDEX = { ruler: 0, culture: 1, religion: 2, capital: 3, population: 4 };

export class ChronasClient {
  constructor({ apiUrl, token = null, fetchImpl = fetch }) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  setToken(token) { this.token = token; }

  async _req(method, path, body) {
    const headers = { 'Accept': 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await this.fetchImpl(`${this.apiUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null;
    if (text) {
      try { json = JSON.parse(text); } catch { /* keep as text */ }
    }
    return { ok: res.ok, status: res.status, body: json, text };
  }

  async login(email, password) {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const res = await this.fetchImpl(`${this.apiUrl}/v1/auth/login`, {
      method: 'POST',
      headers,
      body: `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
    });
    if (!res.ok) throw new Error(`Login failed: ${res.status}`);
    const data = await res.json();
    this.token = data.token;
    return data.token;
  }

  fetchYear(year) {
    return this._req('GET', `/v1/areas/${year}`);
  }

  /**
   * Look at multiple sample years inside the requested batch, not just the
   * start year (review caught this: 10y batches let mid-window changes slip).
   */
  async findOccupiedSlots(dimension, provinces, startYear, endYear) {
    const dimIndex = DIM_INDEX[dimension];
    if (dimIndex === undefined) throw new Error(`Unknown dimension: ${dimension}`);
    const sampleYears = [startYear];
    if (endYear !== startYear) {
      const mid = Math.floor((startYear + endYear) / 2);
      if (mid !== startYear) sampleYears.push(mid);
      sampleYears.push(endYear);
    }
    const seen = new Map();
    for (const year of sampleYears) {
      const sample = await this.fetchYear(year);
      if (!sample.ok || !sample.body) continue;
      for (const prov of provinces) {
        const arr = sample.body[prov];
        if (Array.isArray(arr) && arr[dimIndex]) {
          const key = `${prov}@${year}`;
          if (!seen.has(key)) {
            seen.set(key, { province: prov, year, [dimension]: arr[dimIndex] });
          }
        }
      }
    }
    return Array.from(seen.values());
  }

  /**
   * Backwards-compat shim — older code paths use this name.
   */
  findOccupiedRulerSlots(provinces, startYear, endYear) {
    return this.findOccupiedSlots('ruler', provinces, startYear, endYear);
  }

  /**
   * Read the parent metadata doc (e.g. _id="ruler"). The applier uses this to
   * check whether a proposed childId already exists, including
   * case-insensitive collisions.
   */
  getMetadataParent(dimension) {
    return this._req('GET', `/v1/metadata/${encodeURIComponent(dimension)}`);
  }

  getMarker(wiki) {
    return this._req('GET', `/v1/markers/${encodeURIComponent(wiki)}`);
  }

  createMetadata(payload) {
    return this._req('POST', '/v1/metadata', payload);
  }

  /**
   * Add a single child (e.g. a new ruler) to a dimension's flat data map.
   * Routes through metadataCtrl.updateSingle on the server.
   */
  updateMetadataSingle(dimension, payload) {
    return this._req('PUT', `/v1/metadata/${encodeURIComponent(dimension)}/single`, payload);
  }

  createMarker(payload) {
    return this._req('POST', '/v1/markers', payload);
  }

  updateAreas(payload) {
    return this._req('PUT', '/v1/areas', payload);
  }

  getRevision(id) {
    return this._req('GET', `/v1/revisions/${id}`);
  }
}

export const _internal = { DIM_INDEX };
