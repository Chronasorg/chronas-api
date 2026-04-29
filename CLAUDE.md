# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chronas API is a Node.js 22 / Express REST API for the Chronas historical timeline application. It runs as an AWS Lambda function (via `@vendia/serverless-express`) behind API Gateway at `api.chronas.org`, backed by **DynamoDB** (migrated from DocumentDB in April 2026). All API routes are under `/v1`. Uses native ESM (`"type": "module"` in package.json).

## Build & Development Commands

```bash
npm start                    # Dev server (scripts/start-test-server.js) with in-memory MongoDB, port 3001
npm run start:debug          # Dev server with --inspect
npm test                     # Mocha tests with mock database (160 tests)
npm run test:coverage        # c8 coverage report
npm run lint                 # ESLint with auto-fix
npm run test:postman         # Newman/Postman tests against local server
npm run test:postman:prod    # Newman tests against production
```

Single test file:
```bash
cross-env NODE_ENV=test mocha --require server/tests/helpers.js server/tests/integration-tests/health.test.js --exit
```

The dev server uses `mongodb-memory-server` (no external MongoDB needed). Key required env vars: `JWT_SECRET`. Entry point for Lambda is `lambda-handler.js` (the legacy `index.js` was removed 2025-10-02 during the Lambda migration).

## Production Architecture (AWS, eu-west-1, account 937826731833)

- **Lambda**: `ChronasApiLambdaStackV2` — nodejs22.x, handler `lambda-handler.handler`, 512MB, 30s timeout, **NOT in VPC**
- **API Gateway**: HTTP API (`ChronasApiGateway`) with custom domain `api.chronas.org`
- **Database**: DynamoDB (10 tables, `chronas-*` prefix, PAY_PER_REQUEST). PITR backups + deletion protection enabled.
- **Statistics**: Pre-computed JSON in S3 (`s3://chronas-frontend-new/api/statistics.json`)
- **Secrets**: AWS Secrets Manager — `/chronas/secrets` (JWT secret, OAuth keys)
- **Deployment**: GitHub Actions (`deploy-prod.yml`) on push to `master` — tests → deploy → Postman → auto-rollback on failure
- **Frontend**: S3 bucket `chronas-frontend-new`, served at `chronas.org` via CloudFront
- **Cost**: ~$8-10/mo (DynamoDB ~$5, API Gateway ~$1.50, other ~$2)

### Lambda Entry Point

[lambda-handler.js](lambda-handler.js) uses `@vendia/serverless-express` to wrap the Express app. It initializes via [config/lambda-app.js](config/lambda-app.js) which loads config, skips DocumentDB (all DynamoDB flags ON via `allDynamoFlagsOn()`), then creates the Express app. App instance is cached across warm invocations.

### DynamoDB Tables (10)

`chronas-markers`, `chronas-areas`, `chronas-metadata`, `chronas-users`, `chronas-flags`, `chronas-revisions`, `chronas-links`, `chronas-board`, `chronas-collections`, `chronas-games`

Feature flags (`USE_DYNAMODB_*` env vars) route each model to DynamoDB. All in-scope flags are ON in production. Models live in `server/models/dynamo/`.

### Legacy (disabled/deleted)

- **DocumentDB**: Deleted 2026-04-29. Final snapshot: `chronas-docdb-final-snapshot-2026-04-29`.
- **VPC**: Lambda removed from VPC. No VPC endpoints remain.
- Azure Pipelines, Travis CI, Docker/Kubernetes, CodeBuild — all disabled. GitHub Actions is the sole deployment pipeline.

## Code Architecture

**Config layer** (`config/`):
- [config.js](config/config.js) — Joi-validated env vars. Supports Lambda env (`process.env.chronasConfig` JSON) or local `.env` via dotenv
- [database.js](config/database.js) — Mongoose connection with DocumentDB TLS, connection pooling (1 for Lambda, 10 for local), Secrets Manager integration
- [lambda-config.js](config/lambda-config.js) — Lambda-specific config loading
- [secrets-manager.js](config/secrets-manager.js) — AWS Secrets Manager client (SDK v3)
- [express.js](config/express.js) — Middleware stack: body-parser, CORS, Helmet, Passport, Winston, AWS X-Ray, performance monitoring. CORS allows any `https://*.chronas.org` subdomain by default via regex; additional origins can be added via `ALLOWED_ORIGINS` env var (comma-separated)
- [performance.js](config/performance.js) — Cold/warm start tracking, Lambda metrics

**Request flow**: API Gateway → Lambda handler → `@vendia/serverless-express` → Express middleware → `/v1` routes → controllers → DynamoDB models (`server/models/dynamo/`)

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

**Database (DynamoDB)**:
- User model uses email (lowercased) as `_id`
- Marker model: GSI-TypeYear for the hot query path (year + type filter), GSI-PartOf for area lookups
- Marker types: `'a', 'at', 'e', 'm', 'op', 'p', 'r', 's', 'c', 'ca', 'w'`
- Links: normalized per-entity items in `chronas-links` table (decomposed from monolithic doc)
- Large metadata items (provinces, ruler) are gzip-compressed transparently via `compression.js`
- Areas: `null` values in province arrays are restored to `""` on read for frontend compatibility

## Testing

- **Unit/Integration tests**: Mocha + Chai + Supertest (314 passing). DynamoDB models tested against dynalite (in-memory emulator). Test env auto-configured in `server/tests/helpers.js`.
- **Postman/Newman tests**: `PostmanTests/chronas-enhanced.postman_collection.json` — 37 requests, 76 assertions. Run via `npm run test:postman:prod` or automatically in GitHub Actions post-deploy (with auto-rollback on failure).
- **Playwright E2E**: `e2e-tests/dev-smoke.spec.js` — 12 tests covering API + frontend.

## CDK Stacks (chronas-cdk repo)

The `chronas-cdk` repo manages infrastructure but has known drift. **Do NOT run `cdk deploy`**.

| Stack | Status | Manages |
|---|---|---|
| `ChronasApiLambdaStackV2` | Active | Lambda function, IAM role, SQS DLQ, CloudWatch alarms |
| `ChronasFrontendS3Stack` | Active | S3 bucket, CloudFront distribution, cache policies |
| `ChronasApiLambdaStack` (V1) | Orphaned | Old Lambda — safe to delete |
| `BuildChronasAPi` | Orphaned | CodeBuild (disabled) + ECR repos — safe to delete |

Note: DynamoDB tables, VPC endpoints, and IAM inline policies were created via CLI scripts (not CDK). API Gateway was created by CDK but routing is stable.
