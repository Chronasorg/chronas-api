/**
 * Options for expressWinston.errorLogger — see issue #158.
 *
 * Extracted into its own module so the production middleware (config/express.js)
 * and the regression test (server/tests/unit/error-logging.test.js) share one
 * source of truth. Without this, the test could keep passing while the real
 * config silently regressed (e.g. someone drops `requestField: null`).
 *
 * `errorStatus(err)` is exported separately because express-winston evaluates
 * `skip` *before* the final error handler calls `res.status(err.status)`, so at
 * skip-time `res.statusCode` is still the default 200 — only `err.status` is
 * trustworthy here.
 *
 * This line carries the error details for 5xx that went through next(err).
 * The count of all app 5xx is the `http5xx` line (config/http-5xx-log.js).
 */

export function errorStatus(err) {
  return err.status ?? err.statusCode ?? 500;
}

export function buildErrorLoggerOptions(winstonInstance) {
  return {
    winstonInstance,
    // Keep the literal message greppable; method/path/etc. live in structured
    // meta below so there's no duplication for log parsers.
    msg: 'middlewareError',
    metaField: null,
    requestField: null, // keep request headers/body out of logs (no PII/secrets)
    // 4xx are client errors (bad paths, bot scans, validation) — low signal and
    // high volume. Only log server faults; the log groups keep 3 days.
    skip: (req, res, err) => errorStatus(err) < 500,
    exceptionToMeta: err => ({
      msg: err.message,
      stack: err.stack,
      name: err.name,
      status: errorStatus(err),
      code: err.code, // AWS SDK error codes: ThrottlingException, ResourceNotFoundException, ...
      awsRequestId: err.$metadata?.requestId,
      awsRetries: err.$metadata?.attempts
    }),
    dynamicMeta: (req) => ({
      path: req.originalUrl,
      method: req.method,
      // Lambda Web Functions add lambda-web-request-id to every request and
      // return it as a response header (x-amzn-requestid was API Gateway's).
      requestId: req.headers['lambda-web-request-id'] || req.headers['x-request-id'],
      // Client IP is logged deliberately: the 5xx-burst investigation that
      // motivated #158 needs it for abuse/source correlation. It is personal
      // data under GDPR, so it lives only in the error log (3-day retention),
      // never in request-level logging.
      ip: req.ip
    })
  };
}
