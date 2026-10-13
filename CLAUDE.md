# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chronas API is a Node.js / Express REST API for the Chronas historical timeline application. It runs as an AWS Lambda Web Function behind CloudFront at `api.chronas.org`, backed by **DynamoDB**. All API routes are under `/v1`. Uses native ESM (`"type": "module"` in package.json).

The repo is fully decoupled from CDK as of 2026-05-04. Infrastructure is managed via `aws` CLI; the source of truth lives in [infra/](infra/README.md).

## Build & Development Commands

```bash
npm test                     # Unit tests (server/tests/unit) against dynalite
npm run test:integration     # Round-trip tests through real Express + dynalite (server/tests/integration)
npm run test:coverage        # c8 coverage report
npm run lint                 # ESLint with auto-fix
npm run test:postman:dev     # Newman/Postman tests against dev
npm run test:postman:prod    # Newman/Postman tests against production
```

`test:integration` is a separate suite — it spins up the real Express app and
exercises controllers end-to-end. CI runs it on every deploy. If you change
`scripts/data-validation/apply-corrections-core.js`, keep it green — it pins
write-shape contracts (e.g. `metadata.add` must use
`PUT /v1/metadata/:dim/single`, not `POST /v1/metadata` which silently no-ops
on flat dimension docs).

Single test file:
```bash
cross-env NODE_ENV=test mocha --require server/tests/helpers.js server/tests/unit/dynamo-foundation.test.js --exit
```

Local run: `AWS_LAMBDA_HTTP_ENDPOINT=127.0.0.1:3000 JWT_SECRET=dev node index.js` (needs AWS credentials or `DYNAMODB_ENDPOINT` for data). Testing is otherwise via dynalite in unit/integration tests and Postman against production. Key required env var: `JWT_SECRET` (or `SECRET_CONFIG_NAME`). Entry point: `index.js` → `web-server.js`.

## Production Architecture (AWS, eu-west-1, account 937826731833)

Since 2026-10-13: `api.chronas.org` and `d24mkpax7rmotx.cloudfront.net` → CloudFront `E1KTIK2H0W8J2Q` → **Lambda Web Function** `chronas-api`. Runbook and resource list: [docs/WEB_FUNCTION_CUTOVER.md](docs/WEB_FUNCTION_CUTOVER.md).

- **Web Function** (serves all traffic): `chronas-api`, `nodejs24.x`, arm64, entry `index.js` → `web-server.js`. Endpoint `prod`, `IamAuth`: only CloudFront may call it (resource policy scoped to `E1KTIK2H0W8J2Q`, OAC `chronas-api-web-oac`); unsigned direct calls get 403. Routing is pinned (`autoDeploymentMode` Disabled) and moved only by deploys. Role `chronas-api-web-function-role`, code in the versioned bucket `chronas-lambda-web-artifacts` (one immutable key per commit; never delete object versions a revision uses). Logs `/aws/lambda/web/chronas-api` (WARN+, 3 days). Managed with [infra/api-edge/web-function.sh](infra/api-edge/web-function.sh); `aws lambda-web` needs AWS CLI ≥ 2.37.13.
- **CloudFront (API)**: `E1KTIK2H0W8J2Q`. Behaviors `/v1/areas/*`, `/v1/metadata*`, `/v1/markers*` use `ChronasApiPublicV3` (cached only when the origin says `public`); the default uses `ChronasApiDynamicV3`. Both key on `Authorization`; origin request policy AllViewerExceptHostHeader; 5xx are not cached. Managed with [infra/api-edge/](infra/api-edge/README.md).
- **Retired 2026-10-13**: API Gateway (`2g4uy0bdoe`, its `api.chronas.org` custom domain and regional certificate) and the classic Lambda functions with their CloudFormation stacks. There is no second path to roll back to: a bad deploy rolls back to the previous Web Function revision, and CloudFront changes roll back with `infra/api-edge/restore-cloudfront.sh`.
- **Database**: DynamoDB (8 in-use tables, `chronas-*` prefix, PAY_PER_REQUEST). PITR backups + deletion protection enabled.
- **Statistics**: Pre-computed JSON in S3 (`s3://chronas-frontend-new/api/statistics.json`)
- **Secrets**: AWS Secrets Manager `/chronas/secrets`; `config/bootstrap.js` loads `JWT_SECRET` from it before the app is imported. No secrets in Web Function environment variables.
- **Deployment**: GitHub Actions ([`.github/workflows/deploy-prod.yml`](.github/workflows/deploy-prod.yml)) on push to `master`: tests (Node 22 and 24) → zip → new Web Function revision → endpoint moved → CloudFront invalidation → `/v1/version` check → Postman → automatic rollback to the previous revision on failure → classic Lambda updated. **No CDK in the deploy path.**
- **Frontend**: S3 bucket `chronas-frontend-new`, served at `chronas.org` via CloudFront
- **Cost**: September 2026 was $5.56; the Web Function adds an estimated $3–6/mo (memory is billed while environments are up). Logs are kept 3 days. No NAT Gateway, no WAF.

### Lambda Entry Points

[index.js](index.js) → [web-server.js](web-server.js) is the entry for the Lambda Web Function runtime (Node 24; the runtime always loads `index.js`): it listens on `AWS_LAMBDA_HTTP_ENDPOINT` immediately and holds requests until [config/bootstrap.js](config/bootstrap.js) has loaded the secret and imported the Express app. One process serves many concurrent requests, so keep request data out of module-level state.

### DynamoDB Tables

In use: `chronas-markers`, `chronas-areas`, `chronas-metadata`, `chronas-users`, `chronas-flags`, `chronas-revisions`, `chronas-links`.

Unused but not deleted (kept for potential future reactivation): `chronas-collections`, `chronas-games`, `chronas-board`. The matching `/v1/collections`, `/v1/game`, and `/v1/board/forum/*` endpoints return **410 Gone** (as does `/v1/contact`, which had no table). The new frontend has no forum/community functionality, so the board table is no longer read on the request path (retired 2026-05-07 after a CloudWatch RCU spike alarm — every `GET /v1/board/forum/:slug/discussions` was scanning the full 103 MB table for forum metadata).

Feature flags (`USE_DYNAMODB_*` env vars) remain as local-override switches only. All in-scope flags are ON in production.

### Legacy (disabled/deleted)

- **Mongoose + DocumentDB**: All driver code removed 2026-05-04. Final DocumentDB snapshot: `chronas-docdb-final-snapshot-2026-04-29`.
- **VPC**: Lambda detached from VPC 2026-04-29. VPC ENI IAM permissions removed 2026-05-04.
- **CDK**: `chronas-cdk` sibling repo retired as the infra source 2026-05-04. **Never run `cdk deploy` or `cdk destroy`.** The API stacks (`ApiGatewayStack`, `ChronasApiLambdaStack*`, `DnsStack`, `MetaDataLinkStack`, `LambdaDeploymentStack`, `CloudwatchStack`) were deleted 2026-10-13. The remaining stacks (`SecretStack` holds `/chronas/secrets`; frontend, certificate, Amplify, network, CodeBuild and the GitHub user stacks) are not part of the API path; don't delete them without checking what they hold.
- **API Gateway + classic Lambda**: retired 2026-10-13 after the move to the Web Function (see [docs/WEB_FUNCTION_CUTOVER.md](docs/WEB_FUNCTION_CUTOVER.md)).
- **Application Insights**: Azure telemetry removed 2026-05-04.
- Azure Pipelines, Travis CI, Docker/Kubernetes, CodeBuild — all disabled. GitHub Actions is the sole deployment pipeline.

## Code Architecture

**Config layer** (`config/`):
- [config.js](config/config.js) — Joi-validated env vars. Supports Lambda env (`process.env.chronasConfig` JSON) or local `.env` via dotenv
- [bootstrap.js](config/bootstrap.js) — runtime-neutral startup: loads `JWT_SECRET` from Secrets Manager (`SECRET_CONFIG_NAME`) into `process.env`, where it wins over an environment variable, **before** the Express app is imported (`config.js` and every route read it at module load)
- [express.js](config/express.js) — Middleware stack: `no-store` default, body-parser, CORS, Helmet, Winston, performance monitoring. CORS allows any `https://*.chronas.org` subdomain by default via regex; additional origins can be added via `ALLOWED_ORIGINS` env var (comma-separated)
- [performance.js](config/performance.js) — Cold/warm start tracking, Lambda metrics

**Request flow**: CloudFront → Web Function endpoint (OAC) → `web-server.js` → Express middleware → `/v1` routes → controllers → DynamoDB models (`server/models/dynamo/`)

**Conventions**:
- Routes, controllers, and models follow 1:1 naming per resource (e.g., `marker.route.js` / `marker.controller.js` / `marker.model.js`)
- Active resources: users, markers, areas, metadata, flags, revisions, statistics, health, version
- Retired resources (410 Gone): collections, game, board/forum, contact (retired 2026-10-13: no traffic, Mailgun was never configured in prod, and its sanitize-html dependency became ESM-only, which the Lambda `nodejs22.x` runtime cannot `require()`), social logins `/v1/auth/login/{google,facebook,github,twitter}` (retired 2026-10-13: neither frontend could complete them, and the client secrets were revoked)
- Request validation uses Joi schemas in `config/param-validation.js`
- All async code uses promises (not async/await in older controller code)

**Authentication**:
- JWT tokens contain: id (email), username, privilege (1-5), score, subscription status
- Protected routes use `express-jwt` middleware (decoded token on `req.auth`)
- Authorization in [server/helpers/privileges.js](server/helpers/privileges.js): `checkPrivilege(threshold)`, `checkPrivilegeOrOwnership(threshold)`, `checkPrivilegeForTypes(threshold, typesBlocked)`
- Patreon subscribers bypass privilege checks
- Social logins (Google, Facebook, GitHub) were retired 2026-10-13: `/v1/auth/login/{google,facebook,github,twitter}` return 410 Gone. Accounts log in with email and password only.

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

**Never use CDK.** The `chronas-cdk` sibling repo is retired. Infrastructure changes go through the scripts in [`infra/api-edge/`](infra/api-edge/README.md) (Web Function, CloudFront, alarms), described in [infra/README.md](infra/README.md). Each is a dry run unless called with `--apply --confirm "<phrase>"` and snapshots state into the gitignored `infra/backups/` first. `aws lambda-web` needs AWS CLI ≥ 2.37.13.
