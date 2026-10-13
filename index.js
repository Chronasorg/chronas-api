// Entry for the Lambda Web Function runtime, which always loads index.js from
// the package root (keys starting with AWS_LAMBDA_ are reserved, so the entry
// can't be renamed through an environment variable). The Event Function keeps
// using lambda-handler.js.
import './web-server.js';
