// Entry for the Lambda Web Function runtime, which loads index.js from the
// package root by default. AWS_LAMBDA_NODEJS_ENTRYPOINT could name another
// file (web-functions-revisions-env-vars.html; not a reserved name), but this
// package doesn't set it, so this file stays the entry.
import './web-server.js';
