# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chronas API is a Node.js 22 / Express REST API for the Chronas historical timeline application. It runs as an AWS Lambda function (via `@vendia/serverless-express`) behind API Gateway at `api.chronas.org`, backed by AWS DocumentDB. All API routes are under `/v1`. Uses native ESM (`"type": "module"` in package.json).

## Build & Development Commands

```bash
npm start                    # Dev server (node index.js with debug), port 4040
npm run start:debug          # Dev server with --inspect
npm test                     # Mocha tests with mock database
npm run test:watch           # Watch mode
npm run test:coverage        # c8 coverage report
npm run lint                 # ESLint with auto-fix
npm run test:postman         # Newman/Postman tests against local server
npm run test:postman:prod    # Newman tests against production
```

Single test file:
```bash
cross-env NODE_ENV=test mocha --require server/tests/helpers.js server/tests/integration-tests/health.test.js --exit
```

Local dev requires MongoDB on port 27017 and a `.env` file (see `.env` or config/config.js for required vars). Key required env vars: `JWT_SECRET`, `MONGO_HOST`.

## Production Architecture (AWS, eu-west-1, chronas-prod)

- **Lambda**: `ChronasApiLambdaStackV2` — nodejs22.x, handler `lambda-handler.handler`, 512MB, 30s timeout
- **API Gateway**: HTTP API (`ChronasApiGateway`) with custom domain `api.chronas.org`
- **Database**: DocumentDB cluster (`databaseb269d8bb-phnragzw0yth`) with TLS, SCRAM-SHA-1 auth
- **Secrets**: AWS Secrets Manager — `/chronas/docdb/newpassword` (DB creds), `/chronas/secrets` (app config)
- **Infrastructure as Code**: CDK stacks in separate `chronas-cdk` repo
- **Deployment**: `npm run deploy:prod` (runs CDK deploy from `../chronas-cdk`)
- **Frontend**: S3 bucket `chronas-frontend-new`, served at `chronas.org`

### Lambda Entry Point

[lambda-handler.js](lambda-handler.js) uses `@vendia/serverless-express` to wrap the Express app. It initializes via [config/lambda-app.js](config/lambda-app.js) which loads config, connects to DocumentDB (with retry logic), then creates the Express app. Connection and app instance are cached across warm invocations.

### Legacy (not active)

Azure Pipelines (`azure-pipelines.yml`), Travis CI, AWS CodeBuild (`buildspec.yml`), Docker/Kubernetes configs are no longer used.

## Code Architecture

**Config layer** (`config/`):
- [config.js](config/config.js) — Joi-validated env vars. Supports Lambda env (`process.env.chronasConfig` JSON) or local `.env` via dotenv
- [database.js](config/database.js) — Mongoose connection with DocumentDB TLS, connection pooling (1 for Lambda, 10 for local), Secrets Manager integration
- [lambda-config.js](config/lambda-config.js) — Lambda-specific config loading
- [secrets-manager.js](config/secrets-manager.js) — AWS Secrets Manager client (SDK v3)
- [express.js](config/express.js) — Middleware stack: body-parser, CORS, Helmet, Passport, Winston, AWS X-Ray, performance monitoring
- [performance.js](config/performance.js) — Cold/warm start tracking, Lambda metrics

**Request flow**: API Gateway → Lambda handler → `@vendia/serverless-express` → Express middleware → `/v1` routes → controllers → Mongoose models → DocumentDB

**Conventions**:
- Routes, controllers, and models follow 1:1 naming per resource (e.g., `marker.route.js` / `marker.controller.js` / `marker.model.js`)
- Resources: users, markers, areas, metadata, collections, flags, game, revisions, contact, statistics, health, version
- Request validation uses Joi schemas in `config/param-validation.js`
- All async code uses promises (not async/await in older controller code)

**Authentication**:
- JWT tokens contain: id (email), username, privilege (1-5), score, subscription status
- Protected routes use `express-jwt` middleware (decoded token on `req.auth`)
- Authorization in [server/helpers/privileges.js](server/helpers/privileges.js): `checkPrivilege(threshold)`, `checkPrivilegeOrOwnership(threshold)`, `checkPrivilegeForTypes(threshold, typesBlocked)`
- Patreon subscribers bypass privilege checks
- OAuth: Facebook, Google, GitHub active; Twitter commented out during modernization

**Database specifics**:
- User model uses email as `_id`
- Marker model supports geospatial coordinates (`[longitude, latitude]`) and year-based filtering
- Marker types: `'a', 'at', 'e', 'm', 'op', 'p', 'r', 's', 'c', 'ca', 'w'`
- DocumentDB requires `retryWrites: false`, `authMechanism: SCRAM-SHA-1`, TLS with `global-bundle.pem` cert

## Testing

- **Unit/Integration tests**: Mocha + Chai + Supertest with mock database (see `server/tests/helpers/mock-database.js`). Test env auto-configured in `server/tests/helpers.js`.
- **Postman/Newman tests**: Collections in `PostmanTests/` for API-level testing against local, dev, or prod environments.
