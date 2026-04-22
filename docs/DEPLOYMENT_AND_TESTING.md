# Deployment Pipeline & Test Coverage

## Deployment Paths

There are **two deployment mechanisms** configured. Both deploy to the same Lambda function.

### 1. GitHub Actions (PRIMARY — ACTIVE)

**File:** `.github/workflows/deploy-prod.yml`

**Trigger:** Every push to `master` branch

**Pipeline:**
1. Checkout code
2. `npm ci` + `npm test` (Mocha unit tests — **gate: blocks deploy if tests fail**)
3. Generate `build-version.json` with version, commit SHA, build date
4. `npm version patch` (auto-bumps version, commits `[skip ci]`)
5. Create zip (excludes tests, docs, .github)
6. Upload zip to S3 (`s3://chronas-lambda-deployments/deploys/chronas-api-{sha}.zip`)
7. `aws lambda update-function-code` from S3
8. `aws lambda wait function-updated`
9. Push version bump commit back to master

**Credentials:** GitHub Secrets `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` with `--profile chronas-prod`

**Duration:** ~1.5 minutes

**Recent runs:** All succeeding (last 5 runs all green)

### 2. AWS CodeBuild (LEGACY — ALSO ACTIVE)

**Project:** `chronas-api-lambda-deploy-standalone`

**Trigger:** GitHub webhook (push to master). Last triggered: 2026-04-06 (before GitHub Actions was set up as primary).

**Pipeline:**
1. Install Node 22, CDK CLI
2. `npm ci` for chronas-api
3. Clone `chronas-cdk` repo, `npm ci`
4. **Tests are SKIPPED** ("will be enabled after migration scripts are complete")
5. Check if Lambda stack exists → if yes, zip and `aws lambda update-function-code`
6. If stack doesn't exist → CDK deploy from scratch
7. Post-build: runs Postman tests via `node scripts/ci-lambda-postman-tests.js` — but failures don't block (`|| echo "⚠️ Some tests failed but deployment continues"`)

**Runtime:** Amazon Linux 2, Node 22, BUILD_GENERAL1_SMALL

**Issue:** Tests are skipped, Postman failures don't block deployment. This means broken code can deploy via CodeBuild even if GitHub Actions gates on tests.

### Recommendation

**Disable the CodeBuild webhook** to avoid double-deploys and ungated deployments. GitHub Actions is the correct primary pipeline — it runs tests before deploying and blocks on failure.

The CodeBuild project can be kept for manual/emergency deploys or initial CDK stack creation, but should not auto-trigger on push.

---

## Test Infrastructure

### Mocha Unit Tests (`npm test`)

- **Runner:** Mocha + Chai + Supertest
- **Database:** `mongodb-memory-server` (real MongoDB engine in RAM)
- **App:** `server/tests/helpers/test-app.js` (Express without X-Ray/AppInsights)
- **Auth:** JWT tokens generated directly with test secret
- **Fixtures:** `server/tests/integration-tests/fixtures/testData.json`
- **Count:** 142 tests passing

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

## Test Gaps (Issue #35)

### Priority 1 — High traffic, missing query param tests

**GET /v1/markers with filters** (55.8% of all traffic)

Existing test: `GET /v1/markers` returns array — but doesn't test the production query pattern with `types`, `year`, and `count` parameters.

Tests needed:
```
GET /v1/markers?types=a,ar,at,b,c,ca,cp,e,m,op,p,r,s,si&year=714&count=3000
  → Returns array, filtered by type and year
GET /v1/markers?types=cp&year=1195&count=3000
  → Returns only 'cp' type markers
GET /v1/markers?count=1
  → Returns limited results
```

**GET /v1/metadata with filters** (17.9% of all traffic)

Existing test: `GET /v1/metadata` returns array — but doesn't test the production filter pattern.

Tests needed:
```
GET /v1/metadata?type=g&f=provinces,ruler,culture,religion,capital,province,religionGeneral
  → Returns metadata filtered by type 'g' with specified fields
GET /v1/metadata?type=e&end=3000&subtype=ew
  → Returns metadata filtered by type 'e', subtype 'ew'
```

### Priority 2 — Missing unit tests for endpoints with >200 req/month

| Endpoint | Requests/month | Test file exists | Test needed |
|----------|---------------|------------------|-------------|
| `GET /v1/metadata/:id/getLinked` | 390 | metadata.test.js | Add getLinked test |
| `GET /v1/statistics` | 292 | None | Create statistics.test.js |
| `GET /v1/board/forum/.../discussions` | 234 | None | Low priority (forum) |
| `GET /v1/flags` | 217 | None | Create flags.test.js |

### Priority 3 — Missing Postman test

| Endpoint | Requests/month | Status |
|----------|---------------|--------|
| `POST /v1/auth/signup` | 2 | Missing from Postman collection |

### What's already well-covered

- Areas CRUD + updateMany (6 dedicated tests including Issue #10 simulation)
- Users CRUD (full coverage)
- Markers CRUD (basic coverage)
- Metadata CRUD (basic coverage)
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
| `server/tests/integration-tests/fixtures/testData.json` | Test seed data |

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
