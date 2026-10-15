/**
 * Hand an error to the Express error handlers, unless the response has
 * already been sent. Some handlers keep working after they answer (long area
 * updates, link updates, revisions). A second response would throw inside a
 * promise callback, and Express answers a late next(err) by destroying the
 * connection, so a late error is only logged.
 */
export default function passError(req, res, next, error) {
  if (!res.headersSent) return next(error);
  return logLateError(req, error);
}

/** Log an error from work that runs after (or alongside) the response. */
export function logLateError(req, error) {
  console.error({
    msg: 'errorAfterResponse',
    method: req.method,
    path: req.baseUrl + (req.route?.path ?? ''),
    name: error?.name,
    message: error?.message ?? String(error),
    code: error?.code,
    requestId: req.headers?.['lambda-web-request-id']
  });
  return undefined;
}
