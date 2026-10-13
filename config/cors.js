/**
 * CORS options for the API.
 *
 * Any https://*.chronas.org origin is allowed, plus the comma-separated
 * ALLOWED_ORIGINS list. A disallowed origin gets a normal response without
 * Access-Control-Allow-Origin, so the browser blocks it; it is not an error,
 * because a 500 would be cached by CloudFront for the error-caching TTL.
 */

const CHRONAS_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?chronas\.org$/;
const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:5173';

export function isAllowedOrigin(origin, allowedOrigins = process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS) {
  return allowedOrigins.split(',').includes(origin) || CHRONAS_ORIGIN.test(origin);
}

export const corsOptions = {
  origin: (origin, callback) => {
    // Requests without an Origin (server-to-server, curl, mobile apps)
    if (!origin) return callback(null, true);
    return callback(null, isAllowedOrigin(origin));
  },
  credentials: true
};
