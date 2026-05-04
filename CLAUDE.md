# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chronas API is a Node.js 22 / Express REST API for the Chronas historical timeline application. It runs as an AWS Lambda function (via `@vendia/serverless-express`) behind API Gateway at `api.chronas.org`, backed by **DynamoDB**. All API routes are under `/v1`. Uses native ESM (`"type": "module"` in package.json).

The repo is fully decoupled from CDK as of 2026-05-04. Infrastructure is managed via `aws` CLI; the source of truth lives in [infra/](infra/README.md).

## Build & Development Commands

```bash
npm test                     # Mocha tests against dynalite (in-memory DynamoDB)
npm run test:coverage        # c8 coverage report
npm run lint                 # ESLint with auto-fix
npm run test:postman:dev     # Newman/Postman tests against dev
npm run test:postman:prod    # Newman/Postman tests against production
```

Single test file:
```bash
cross-env NODE_ENV=test mocha --require server/tests/helpers.js server/tests/unit/dynamo-foundation.test.js --exit
```

There is no local-server dev mode. The Lambda is DynamoDB-only; testing is done end-to-end against dev/prod or via dynalite in unit tests. Key required env var: `JWT_SECRET`. Entry point for Lambda is `lambda-handler.js`.

## Production Architecture (AWS, eu-west-1, account 937826731833)

- **Lambda**: `ChronasApiLambdaStackV2-ChronasApiLambdaFunction7C-UhX6kGn4FXqM` — nodejs22.x, **arm64**, handler `lambda-handler.handler`, 512MB, 30s timeout, **NOT in VPC**
- **API Gateway**: HTTP API (`ChronasApiGateway`) with custom domain `api.chronas.org`
- **Database**: DynamoDB (8 in-use tables, `chronas-*` prefix, PAY_PER_REQUEST). PITR backups + deletion protection enabled.
- **Statistics**: Pre-computed JSON in S3 (`s3://chronas-frontend-new/api/statistics.json`)
- **Secrets**: AWS Secrets Manager — `/chronas/secrets` (JWT secret, OAuth keys). The old `/chronas/docdb/*` secrets were unlinked 2026-05-04.
- **CloudFront (API)**: Distribution `E1KTIK2H0W8J2Q` (`d24mkpax7rmotx.cloudfront.net`) caches API responses at edge. DNS `api.chronas.org` → CloudFront → API Gateway origin. Cache policy respects origin `Cache-Control` headers. Invalidated on each deploy via `deploy-prod.yml`.
- **Deployment**: GitHub Actions ([`.github/workflows/deploy-prod.yml`](.github/workflows/deploy-prod.yml)) on push to `master` — tests → zip → `aws lambda update-function-code` → CloudFront invalidation → Postman → auto-rollback on failure. **No CDK in the deploy path.** The workflow only reads the Lambda function name from a CloudFormation stack output.
- **Frontend**: S3 bucket `chronas-frontend-new`, served at `chronas.org` via CloudFront
- **Cost**: ~$5-8/mo (DynamoDB ~$3, CloudFront $0 free tier, API Gateway ~$1, Lambda on ARM64 ~$1, Secrets Manager + Logs ~$1). No NAT Gateway.

### Lambda Entry Point

[lambda-handler.js](lambda-handler.js) uses `@vendia/serverless-express` to wrap the Express app. It initializes via [config/lambda-app.js](config/lambda-app.js) which loads config and creates the Express app — no database connection step (DynamoDB-only). App instance is cached across warm invocations.

### DynamoDB Tables

In use: `chronas-markers`, `chronas-areas`, `chronas-metadata`, `chronas-users`, `chronas-flags`, `chronas-revisions`, `chronas-links`, `chronas-board`.

Unused but not deleted (kept for potential future reactivation): `chronas-collections`, `chronas-games`. The matching `/v1/collections` and `/v1/game` endpoints return **410 Gone**.

Feature flags (`USE_DYNAMODB_*` env vars) remain as local-override switches only. All in-scope flags are ON in production.

### Legacy (disabled/deleted)

- **Mongoose + DocumentDB**: All driver code removed 2026-05-04. Final DocumentDB snapshot: `chronas-docdb-final-snapshot-2026-04-29`.
- **VPC**: Lambda detached from VPC 2026-04-29. VPC ENI IAM permissions removed 2026-05-04.
- **CDK**: `chronas-cdk` sibling repo retired as the infra source 2026-05-04. The stacks still exist in CloudFormation (needed for the `LambdaFunctionName` output the deploy workflow reads) — but **do not run `cdk deploy`** and **do not run `cdk destroy`**. See [infra/README.md](infra/README.md).
- **Application Insights**: Azure telemetry removed 2026-05-04.
- Azure Pipelines, Travis CI, Docker/Kubernetes, CodeBuild — all disabled. GitHub Actions is the sole deployment pipeline.

## Code Architecture

**Config layer** (`config/`):
- [config.js](config/config.js) — Joi-validated env vars. Supports Lambda env (`process.env.chronasConfig` JSON) or local `.env` via dotenv
- [lambda-config.js](config/lambda-config.js) — Lambda-specific config loading
- [lambda-app.js](config/lambda-app.js) — Lambda initialization (config load + Express app — no DB step)
- [secrets-manager.js](config/secrets-manager.js) — AWS Secrets Manager client (SDK v3), used only for application config (`SECRET_CONFIG_NAME`)
- [express.js](config/express.js) — Middleware stack: body-parser, CORS, Helmet, Passport, Winston, AWS X-Ray, performance monitoring. CORS allows any `https://*.chronas.org` subdomain by default via regex; additional origins can be added via `ALLOWED_ORIGINS` env var (comma-separated)
- [performance.js](config/performance.js) — Cold/warm start tracking, Lambda metrics

**Request flow**: API Gateway → Lambda handler → `@vendia/serverless-express` → Express middleware → `/v1` routes → controllers → DynamoDB models (`server/models/dynamo/`)

**Conventions**:
- Routes, controllers, and models follow 1:1 naming per resource (e.g., `marker.route.js` / `marker.controller.js` / `marker.model.js`)
- Active resources: users, markers, areas, metadata, flags, revisions, contact, statistics, health, version, forum
- Retired resources (410 Gone): collections, game
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
- `$in` arrays >100 items are auto-chunked in [dynamo-query.js](server/models/dynamo/dynamo-query.js) to stay under the DynamoDB IN operator limit

## Testing

- **Unit/Integration tests**: Mocha + Chai (224 passing). DynamoDB models tested against dynalite (in-memory emulator). Test env auto-configured in `server/tests/helpers.js`.
- **Postman/Newman tests**: `PostmanTests/chronas-enhanced.postman_collection.json` — 36 requests, 65 assertions. Run via `npm run test:postman:prod` against prod or `npm run test:postman:dev` against dev. Runs automatically in GitHub Actions post-deploy (with auto-rollback on failure).
- **Playwright E2E**: `e2e-tests/dev-smoke.spec.js` — 12 tests covering API + frontend, run against deployed dev env.

## Infrastructure changes

**Never use CDK.** The `chronas-cdk` sibling repo is retired. Infrastructure changes go through the idempotent script at [`infra/apply-lambda-config.sh`](infra/apply-lambda-config.sh), or a direct `aws` CLI command documented in [infra/README.md](infra/README.md). Always snapshot current state into `infra/backups/` before any change (the script does this automatically).
