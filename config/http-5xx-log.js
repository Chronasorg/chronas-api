/**
 * One log line for every 5xx response the app sends, whichever code path
 * sent it. Not every handler goes through next(err), so the error logger in
 * config/express.js doesn't see them all.
 *
 * HTTPResponseStatusClass5XX also counts 5xx that Lambda returned before a
 * request reached the app, so the metric minus these lines is the number of
 * platform 5xx, except for the 503s web-server.js sends while startup fails
 * (they never reach Express; each startup attempt logs one "Startup failed"
 * line instead). Count them in Logs Insights with
 *   filter message.msg = "http5xx" | stats count()
 *
 * The line is an object, which Lambda writes as queryable JSON. It holds the
 * route template, never the raw path (it can contain an email), and no IP,
 * headers or body.
 */

/**
 * The Express route template of a request, e.g. /v1/users/:userId, or null
 * if no route matched. next(err) leaves the routers and resets req.baseUrl;
 * every router is mounted on a static path, so the base is the request path
 * minus as many trailing segments as the route path has.
 */
export function routeTemplate(req) {
  if (!req.route) return null;
  const routePath = String(req.route.path);
  const routeSuffix = routePath === '/' ? '' : routePath;
  if (req.baseUrl) return `${req.baseUrl}${routeSuffix}` || '/';
  const parts = req.originalUrl.split('?')[0].split('/').filter(Boolean);
  const routeParts = routePath.split('/').filter(Boolean).length;
  return `/${parts.slice(0, parts.length - routeParts).join('/')}${routeSuffix}`.replace(/^\/\//, '/');
}

export function log5xxResponses() {
  return (req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      if (res.statusCode < 500) return;
      console.error({
        msg: 'http5xx',
        method: req.method,
        route: routeTemplate(req),
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        requestId: req.headers['lambda-web-request-id']
      });
    });
    next();
  };
}
