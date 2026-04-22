# Deployment Pipeline & Test Coverage

## Deployment Pipeline

### GitHub Actions (SOLE ACTIVE PIPELINE)

**File:** `.github/workflows/deploy-prod.yml`

**Trigger:** Every push to `master` branch

**Pipeline:**
1. Checkout code
2. `npm ci` + `npm test` (Mocha unit tests — **gate: blocks deploy if tests fail**)
3. Generate `build-version.json` with version, commit SHA, build date
4. `npm version patch` (auto-bumps version, commits `[skip ci]`)
5. Create zip (excludes tests, docs, .github)
6. Save previous S3 deployment key (for rollback)
7. Upload zip to S3 (`s3://chronas-lambda-deployments/deploys/chronas-api-{sha}.zip`)
8. `aws lambda update-function-code` from S3
9. `aws lambda wait function-updated`
10. **Post-deploy Postman smoke tests** against `https://api.chronas.org`
11. If Postman tests **fail** → automatic Lambda rollback to previous S3 deployment
12. If Postman tests **pass** → push version bump commit back to master

**Credentials:** GitHub Secrets `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` with `--profile chronas-prod`

**Duration:** ~2-3 minutes (including Postman tests)

**Rollback:** Automatic. If post-deploy Postman tests fail, the pipeline rolls back the Lambda function to the previous deployed zip from S3 and fails the workflow. No manual intervention needed.

### AWS CodeBuild (DISABLED)

**Project:** `chronas-api-lambda-deploy-standalone`

**Status:** Webhook DISABLED as of 2026-04-22. No longer auto-triggers on push to master.

The CodeBuild project remains available in AWS for emergency/manual deploys or initial CDK stack creation, but the GitHub webhook has been disabled to prevent double-deploys and ungated deployments. GitHub Actions is the sole deployment pipeline — it runs unit tests before deploying and Postman tests after deploying, with automatic rollback on failure.

---

## Test Infrastructure

### Mocha Unit Tests (`npm test`)

- **Runner:** Mocha + Chai + Supertest
- **Database:** `mongodb-memory-server` (real MongoDB engine in RAM)
- **App:** `server/tests/helpers/test-app.js` (Express without X-Ray/AppInsights)
- **Auth:** JWT tokens generated directly with test secret
- **Fixtures:**
  - `server/tests/integration-tests/fixtures/testData.json` — legacy test data
  - `server/tests/integration-tests/fixtures/testData-modern.json` — modernized format
  - `server/tests/integration-tests/fixtures/productionData.json` — **real production data** from `api.chronas.org` for issue #35 endpoint tests
- **Count:** 150+ tests passing

### Postman/Newman Tests (`npm run test:postman`)

- **Collection:** `PostmanTests/chronas-enhanced.postman_collection.json` (primary)
- **Environments:**
  - `chronas-local.postman_environment.json` → `http://localhost:3001`
  - `chronas-dev.postman_environment.json` → `https://9c3213bzri.execute-api.eu-west-1.amazonaws.com`
  - `chronas-api.postman_environment.json` → `https://api.chronas.org` (production)
- **Local server:** `scripts/start-test-server.js` starts Express + in-memory MongoDB on port 3001
- **Runner:** `scripts/run-postman-tests.js` (programmatic Newman, handles server lifecycle)

### npm Test Commands

```bash
npm test                    # Mocha unit tests (142 tests)
npm run test:postman        # Postman enhanced against local server (auto-starts)
npm run test:postman:prod   # Postman enhanced against production
npm run test:postman:basic  # Postman basic against local
```

---

## Production Traffic (Last Month — April 2026)

**Total: ~84,000 requests**

| Rank | Requests | % | Method | Endpoint | Unit Test | Postman |
|------|----------|---|--------|----------|-----------|---------|
| 1 | 46,807 | 55.8% | GET | `/v1/markers?types=...&year=...&count=...` | **PARTIAL** | ✅ |
| 2 | 15,409 | 18.4% | PUT | `/v1/areas` (updateMany) | ✅ 6 tests | ✅ |
| 3 | 15,031 | 17.9% | GET | `/v1/metadata?type=g&f=...` | **PARTIAL** | ✅ |
| 4 | 3,391 | 4.0% | GET | `/v1/areas/:year` | ✅ | ✅ |
| 5 | 1,082 | 1.3% | GET | `/v1/health` | ✅ | ✅ |
| 6 | 957 | 1.1% | GET | `/v1/version` | ✅ | ✅ |
| 7 | 390 | 0.5% | GET | `/v1/metadata/links/getLinked` | ❌ | ✅ |
| 8 | 292 | 0.3% | GET | `/v1/statistics` | ❌ | ✅ |
| 9 | 234 | 0.3% | GET | `/v1/board/forum/questions/discussions` | ❌ | ✅ |
| 10 | 217 | 0.3% | GET | `/v1/flags` | ❌ | ✅ |

**"PARTIAL"** means the endpoint has a basic test but not with the query parameters used in production.

### Error Rate
- 200 OK: 243,952 (83%)
- 304 Not Modified: 49,739 (17%)
- 404: 154
- 500: 53
- 401: 19

---

## Test Coverage for Issue #35 Endpoints

All high-traffic production endpoints from issue #35 are now covered by `production-endpoints.test.js` using **real production data** (not mocks).

### Covered Endpoints

| Endpoint | Traffic | Test | Data Source |
|----------|---------|------|-------------|
| `GET /v1/markers?types=...&year=714&count=3000` | 55.8% | ✅ production-endpoints.test.js | Real markers from api.chronas.org |
| `GET /v1/markers?types=cp&year=1195&count=3000` | — | ✅ production-endpoints.test.js | Real markers from api.chronas.org |
| `GET /v1/markers?count=1` | — | ✅ production-endpoints.test.js | Real markers from api.chronas.org |
| `GET /v1/metadata?type=g&f=...` | 17.9% | ✅ production-endpoints.test.js | Real metadata from api.chronas.org |
| `GET /v1/metadata?type=e&subtype=ew` | — | ✅ production-endpoints.test.js | Real war/battle data from api.chronas.org |
| `GET /v1/metadata/:id/getLinked` | 0.5% | ✅ production-endpoints.test.js | Real linked data from api.chronas.org |
| `GET /v1/board/forum/.../discussions` | 0.3% | ✅ production-endpoints.test.js | Stub endpoint verification |
| `GET /v1/version/welcome` | 1.1% | ✅ production-endpoints.test.js | Live version endpoint |
| `GET /v1/areas/:year` | 4.0% | ✅ production-endpoints.test.js | Real area data from api.chronas.org |

### Remaining Gaps (lower priority)

| Endpoint | Requests/month | Status |
|----------|---------------|--------|
| `GET /v1/statistics` | 292 | Missing unit test |
| `GET /v1/flags` | 217 | Missing unit test |
| `POST /v1/auth/signup` | 2 | Missing from Postman collection |

### Already well-covered

- Areas CRUD + updateMany (6 dedicated tests including Issue #10 simulation)
- Users CRUD (full coverage)
- Markers CRUD (basic coverage + production query patterns)
- Metadata CRUD (basic + production filter patterns)
- Health + Version
- Authentication (login, JWT validation)

---

## Files Reference

| File | Purpose |
|------|---------|
| `.github/workflows/deploy-prod.yml` | GitHub Actions deploy pipeline |
| `scripts/start-test-server.js` | Local test server with in-memory MongoDB |
| `scripts/run-postman-tests.js` | Newman runner with server lifecycle |
| `scripts/run-all-tests.js` | Runs both Mocha and Postman tests |
| `PostmanTests/chronas-enhanced.postman_collection.json` | Primary Postman collection |
| `PostmanTests/chronas-local.postman_environment.json` | Local environment |
| `PostmanTests/chronas-api.postman_environment.json` | Production environment |
| `server/tests/helpers/test-app.js` | Express app for tests |
| `server/tests/helpers/mongodb-memory.js` | In-memory MongoDB setup |
| `server/tests/integration-tests/fixtures/testData.json` | Legacy test seed data |
| `server/tests/integration-tests/fixtures/productionData.json` | Real production data for issue #35 tests |
| `server/tests/integration-tests/production-endpoints.test.js` | Issue #35 endpoint tests with production data |

## AWS Resources

| Resource | Value |
|----------|-------|
| Lambda function | `ChronasApiLambdaStackV2-ChronasApiLambdaFunction7C-UhX6kGn4FXqM` |
| API Gateway | `2g4uy0bdoe` (ChronasApiGateway) |
| Custom domain | `api.chronas.org` |
| S3 deployments | `s3://chronas-lambda-deployments` |
| CloudWatch logs (Lambda) | `/aws/lambda/ChronasApiLambdaStackV2-ChronasApiLambdaFunction7C-UhX6kGn4FXqM` |
| CloudWatch logs (API GW) | `ApiGatewayStack-ChronasApiGatewayAPIGWAccessLogsA52DB10A-iojowSf05IEk` |
| CodeBuild (legacy) | `chronas-api-lambda-deploy-standalone` |
| CDK repo | `Chronasorg/chronas-cdk` (separate repo) |
