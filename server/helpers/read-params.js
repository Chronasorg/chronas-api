/**
 * Checks and normalizes the query parameters of the public list reads
 * (GET /v1/markers, GET /v1/metadata, GET /v1/metadata/:id/getLinked) before
 * anything reaches DynamoDB.
 *
 * Added 2026-11 after the pentest (F4, F14): malformed values used to reach
 * DynamoDB and come back as 500s (`limit=-1`, `limit=abc`, `year=1e400`,
 * `end` before `year`, `wikis=%ZZ`, duplicate or oversized keys, a parameter
 * given twice, `f=ruler,`). Now a value that can't be right answers 400, and
 * sizes are clamped so one request can't ask for the whole table.
 *
 * Every limit here is above what chronas.org, old.chronas.org and the
 * data-validation scripts send (checked 2026-11-26): markers `limit=10000`
 * (cities; scripts send 50000, which is clamped), metadata `end=10000`.
 */
import httpStatus from 'http-status';

import APIError from './APIError.js';

export const MAX_LIST_LENGTH = 10000;
export const MAX_OFFSET = 100000;
export const MAX_YEAR = 10000;
export const MAX_DELTA = 10000;
export const MAX_KEYS = 500;
// DynamoDB allows 2048 bytes for a partition key; ids are far shorter.
export const MAX_KEY_BYTES = 1024;
export const MAX_SEARCH_LENGTH = 200;

/** Metadata types that exist (scan of chronas-metadata, 2026-11-26). */
export const METADATA_TYPES = ['i', 'ap', 'e', 'g', 'a_ruler', 'a_culture', 'a_religion', 'a_religionGeneral'];

const badRequest = message => new APIError(message, httpStatus.BAD_REQUEST, true);

/** A parameter that may appear once. Repeated parameters arrive as arrays. */
function single(query, name) {
  const value = query[name];
  if (Array.isArray(value)) throw badRequest(`${name} may be given only once`);
  if (value !== undefined && typeof value !== 'string') throw badRequest(`${name} is not valid`);
  return value;
}

/**
 * An integer parameter, or `fallback` when it is absent or empty. Values
 * below `min` are refused; values above `max` are clamped, or refused when
 * `clamp` is false.
 */
export function intParam(query, name, { min, max, fallback, clamp = false }) {
  const raw = single(query, name);
  if (raw === undefined || raw === '') return fallback;
  if (!/^-?\d+$/.test(raw.trim())) throw badRequest(`${name} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min) throw badRequest(`${name} must be at least ${min}`);
  if (value > max) {
    if (clamp) return max;
    throw badRequest(`${name} must be at most ${max}`);
  }
  return value;
}

function stringParam(query, name, { maxLength, pattern }) {
  const value = single(query, name);
  if (value === undefined || value === '') return false;
  if (value.length > maxLength) throw badRequest(`${name} is too long`);
  if (pattern && !pattern.test(value)) throw badRequest(`${name} is not valid`);
  return value;
}

function flag(query, name) {
  const value = single(query, name);
  return value !== undefined && value !== '' && value !== 'false' && value !== '0';
}

/**
 * A comma-separated list (also accepted as a repeated parameter), without
 * empty entries and duplicates. Returns false when there is none.
 */
export function listParam(query, name, { pattern, maxItems = MAX_KEYS, decode = false }) {
  const raw = query[name];
  if (raw === undefined || raw === '') return false;
  const parts = (Array.isArray(raw) ? raw : [raw]).flatMap((part) => {
    if (typeof part !== 'string') throw badRequest(`${name} is not valid`);
    return part.split(',');
  });
  const values = [];
  for (const part of parts) {
    let value = part.trim();
    if (value === '') continue;
    if (decode) {
      try {
        value = decodeURIComponent(value);
      } catch {
        throw badRequest(`${name} contains a malformed escape sequence`);
      }
    }
    if (Buffer.byteLength(value) > MAX_KEY_BYTES) throw badRequest(`${name} contains a value that is too long`);
    if (pattern && !pattern.test(value)) throw badRequest(`${name} contains an invalid value`);
    if (!values.includes(value)) values.push(value);
  }
  if (values.length > maxItems) throw badRequest(`${name} may list at most ${maxItems} values`);
  return values.length ? values : false;
}

function year(query, name) {
  return intParam(query, name, { min: -MAX_YEAR, max: MAX_YEAR, fallback: false });
}

/** Parameters of GET /v1/markers. */
export function markerListParams(query) {
  const limit = intParam(query, 'limit', { min: 1, max: MAX_LIST_LENGTH, clamp: true, fallback: undefined });
  const count = intParam(query, 'count', { min: 1, max: MAX_LIST_LENGTH, clamp: true, fallback: undefined });
  const params = {
    start: intParam(query, 'offset', { min: 0, max: MAX_OFFSET, clamp: true, fallback: 0 }),
    // The frontend sends "limit", legacy clients "count".
    length: limit ?? count ?? 2000,
    sort: stringParam(query, 'sort', { maxLength: 32, pattern: /^[A-Za-z_]+$/ }) || 'name',
    order: stringParam(query, 'order', { maxLength: 4, pattern: /^(asc|desc)$/ }) || 'asc',
    filter: stringParam(query, 'filter', { maxLength: MAX_SEARCH_LENGTH }) || '',
    // types, or legacy type
    typeArray: listParam(query, query.types !== undefined ? 'types' : 'type', { pattern: /^[a-z]{1,4}$/, maxItems: 30 }),
    wikiArray: listParam(query, 'wikis', { decode: true }),
    format: stringParam(query, 'format', { maxLength: 16, pattern: /^[a-z]+$/ }),
    year: year(query, 'year'),
    end: year(query, 'end'),
    delta: intParam(query, 'delta', { min: 0, max: MAX_DELTA, fallback: undefined }),
    includeMarkers: single(query, 'includeMarkers') !== 'false',
    search: stringParam(query, 'search', { maxLength: MAX_SEARCH_LENGTH }),
    both: flag(query, 'both'),
    migration: flag(query, 'migration'),
  };
  if (params.year !== false && params.end !== false && params.end < params.year) {
    throw badRequest('end must not be before year');
  }
  return params;
}

/** Parameters of GET /v1/metadata. */
export function metadataListParams(query) {
  const fList = listParam(query, 'f', { pattern: /^[A-Za-z0-9_-]{1,64}$/, maxItems: 50 });
  const types = listParam(query, 'type', { maxItems: 1 });
  const type = types ? types[0] : false;
  if (type && !METADATA_TYPES.includes(type)) {
    throw badRequest(`type must be one of ${METADATA_TYPES.join(', ')}`);
  }
  const subtypes = listParam(query, 'subtype', { pattern: /^[a-z]{1,16}$/, maxItems: 30 });
  return {
    start: intParam(query, 'start', { min: 0, max: MAX_LIST_LENGTH, clamp: true, fallback: 0 }),
    end: intParam(query, 'end', { min: 1, max: MAX_LIST_LENGTH, clamp: true, fallback: 10 }),
    sort: stringParam(query, 'sort', { maxLength: 32, pattern: /^[A-Za-z_]+$/ }) || 'createdAt',
    order: stringParam(query, 'order', { maxLength: 4, pattern: /^(asc|desc)$/ }) || 'asc',
    filter: stringParam(query, 'filter', { maxLength: MAX_SEARCH_LENGTH }) || '',
    fList: fList ? fList.join(',') : false,
    locale: stringParam(query, 'locale', { maxLength: 10, pattern: /^[a-z]{2,3}([_-][A-Za-z]{2,4})?$/ }),
    type,
    subtype: subtypes ? subtypes.join(',') : false,
    // Year 0 is "no year", as before.
    year: year(query, 'year') || false,
    delta: intParam(query, 'delta', { min: 0, max: MAX_DELTA, fallback: 10 }),
    wiki: stringParam(query, 'wiki', { maxLength: MAX_KEY_BYTES }),
    search: stringParam(query, 'search', { maxLength: MAX_SEARCH_LENGTH }),
    mustGeo: flag(query, 'geo'),
    discover: flag(query, 'discover'),
  };
}

/** The `source` of GET /v1/metadata/:id/getLinked: "0:<markerId>" or "1:<metadataId>". */
export function linkedSourceParam(query) {
  const source = single(query, 'source');
  if (source === undefined || source === '') return false;
  if (Buffer.byteLength(source) > MAX_KEY_BYTES) throw badRequest('source is too long');
  if (!/^[01]:./.test(source)) throw badRequest('source must look like 0:<markerId> or 1:<metadataId>');
  return source;
}
