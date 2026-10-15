# Chronas API Infrastructure

**This directory is the source of truth for the chronas-api AWS infrastructure.** No CDK. Every resource is created either by the GitHub Actions pipeline (code) or by the scripts in [`api-edge/`](api-edge/README.md) (configuration). The `chronas-cdk` sibling repo is legacy and must not be deployed.

Since 2026-10-13 the API runs as a **Lambda Web Function behind CloudFront**. API Gateway and the classic Lambda function were retired the same day. History: [docs/WEB_FUNCTION_CUTOVER.md](../docs/WEB_FUNCTION_CUTOVER.md).

## Current production state (account `937826731833`, `eu-west-1`)

```text
chronas.org (frontend) ──► d24mkpax7rmotx.cloudfront.net ─┐
api.chronas.org (legacy site, third parties) ── alias ────┤  CloudFront E1KTIK2H0W8J2Q
                                                           ▼  OAC (SigV4, always-amz-auth)
                                       Lambda Web Function "chronas-api", endpoint "prod"
                                                           ▼
                                       DynamoDB · S3 (statistics) · Secrets Manager
```

| Resource | Setting |
| --- | --- |
| Web Function | `chronas-api`, `nodejs24.x`, arm64, entry `index.js` → `web-server.js`; 2 vCPU / 2 GB per environment |
| Endpoint | `prod`: `HomeRegion`, `IamAuth` (only CloudFront `E1KTIK2H0W8J2Q` may call it; unsigned calls get 403), routing `Disabled` (moved by deploys), `maxEnvironments` 2 (the smallest value allowed), `rateLimit` 100 req/s |
| Revision settings | timeout 25 s, 64 concurrent requests per environment, `NODE_OPTIONS=--max-old-space-size=384` (live revision `rev-omgkb`; the next deploy adds `--max-semi-space-size=4`, see below), environment variables without secrets ([`api-edge/web-function.sh`](api-edge/web-function.sh) `revision_json`) |
| Execution role | `chronas-api-web-function-role`: policy in [`api-edge/web-function-role-policy.json`](api-edge/web-function-role-policy.json) |
| Code artifacts | `s3://chronas-lambda-web-artifacts/web/chronas-api-<commit>.zip`: versioned, private, TLS only, readable only by the function's revisions. **Never delete an object version a revision uses**, because that revision would fail permanently |
| CloudFront | `E1KTIK2H0W8J2Q`: `/v1/areas/*`, `/v1/metadata*`, `/v1/markers*` on `ChronasApiPublicV3` (cached only when the origin says `public`, at most 1 day), default on `ChronasApiDynamicV3`; both key on `Authorization` and the public one also on `Origin`; origin request policy AllViewerExceptHostHeader; 500/502/503/504 not cached |
| DNS | `api.chronas.org` A → alias of `d24mkpax7rmotx.cloudfront.net` (zone `Z005461139KF8GDMY491N`) |
| Secrets | Secrets Manager `/chronas/secrets`; the app loads `JWT_SECRET` from it at startup ([config/bootstrap.js](../config/bootstrap.js)) |
| Logs | `/aws/lambda/web/chronas-api` and `.local`: warnings and errors only, 3 days; Lambda writes every event to both. The runtime captures stdout and stderr and filters them by `applicationLogLevel`; raw lines carry no level and were not delivered at WARN in our test (hence `forceConsole` in `config/winston.js`). Every app 5xx logs one `http5xx` line, so `HTTPResponseStatusClass5XX` minus those lines counts the 5xx Lambda returned itself (apart from the startup-failure 503s of `web-server.js`, logged as `Startup failed`) |
| Alarms | `chronas-api-web-{5xx,throttled,capacity,memory}` → SNS `CloudWatch_Alarm_aumannjoachim` ([`api-edge/web-function-alarms.sh`](api-edge/web-function-alarms.sh); since 2026-10-15: 5xx ≥ 10 in 5 min, rate throttles ≥ 10 in two 5-min periods in a row, capacity throttles ≥ 10 in 15 min, environment memory ≥ 768 MB), plus the DynamoDB RCU and throttle alarms (none on `chronas-users`). `CloudFront-5xx-Rate-High` (5xx rate > 5 % for 10 min) is in us-east-1 and notifies the us-east-1 topic of the same name, which needs its own email subscription. Throttles that no alarm sees: `Platform.EndpointConcurrentInitThrottle` 429s (too many environments starting at once) increment no throttle metric, only `HTTPResponseStatusClass4XX` |

### Data layer

All persistent state lives in **DynamoDB** (PAY_PER_REQUEST, PITR enabled, deletion protection on). Pre-computed statistics JSON is in S3.

| Table | Purpose |
| --- | --- |
| `chronas-markers` | Markers (GSI-TypeYear, GSI-PartOf) |
| `chronas-areas` | Province/area snapshots per year |
| `chronas-metadata` | Entity metadata (provinces, ruler, religion, culture); large items gzip-compressed |
| `chronas-users` | User accounts (PK = lowercased email) |
| `chronas-flags` | Crowdsourced correction flags |
| `chronas-revisions` | Edit history (GSI-EntityTimestamp) |
| `chronas-links` | Normalized per-entity links |
| `chronas-rate-limits` | Per-IP rate-limit counters for `/auth/*` (TTL on `expires_at`) |
| `chronas-board` | Forum posts (unused: `/v1/board/forum/*` returns 410) |
| `chronas-collections` | (unused: `/v1/collections` retired, returns 410) |
| `chronas-games` | (unused: `/v1/game` retired, returns 410) |

The bucket `chronas-frontend-new` hosts both the frontend (`chronas.org`) and the pre-computed statistics JSON at `api/statistics.json`. The API may only read, write and list that one key.

## Deployment

GitHub Actions, [`.github/workflows/deploy-prod.yml`](../.github/workflows/deploy-prod.yml), on every push to `master`:

1. Tests on Node 24, including a load with Lambda's module flags.
2. `npm ci --omit=dev` and `zip`.
3. `web-function.sh deploy`: upload, new revision with the full configuration, wait for Active, move the `prod` endpoint, wait.
4. CloudFront invalidation of `/v1/*` (waits).
5. `/v1/version` must report the new commit.
6. Postman smoke tests against `https://api.chronas.org`.
7. If 3–6 fail: the endpoint goes back to the previous revision automatically.

Lambda cleans up revisions beyond about 50, oldest first among those no endpoint routes to; keep the rollback target in mind before deleting or after many deploys.

## Changing infrastructure

Everything goes through [`api-edge/`](api-edge/README.md), never the console. Every script checks the account, is a dry run unless called with `--apply --confirm "<phrase>"`, and snapshots into the gitignored `backups/`.

- Web Function: `api-edge/web-function.sh` (`status`, `deploy`, `rollback <revision>`, distribution access). It needs AWS CLI ≥ 2.37.13 for `aws lambda-web`; set `AWS_WEB_CLI` if your `aws` is older. Endpoint settings such as `maxEnvironments` and `rateLimit`: `aws lambda-web update-web-function-endpoint`.
- CloudFront: `api-edge/apply-cloudfront.sh` (render, validate, diff, apply with the ETag), and `restore-cloudfront.sh <snapshot>` to undo.
- Checks against any base URL: `api-edge/verify.mjs`, or the `API edge` workflow's `smoke` action (adds the full Postman suite).

## Cost

September 2026: $5.56 (DynamoDB $2.04, Route 53 $0.74, Secrets Manager $0.42, CloudWatch $0.31, S3 $0.22, tax $0.89). API Gateway (≈ $0.85) is gone. No NAT Gateway, no WAF.

The Web Function, measured in Cost Explorer for 2026-10-14: $0.332/day gross, about $10.1/month before tax (≈ $12 with tax): memory 81%, vCPU 15%, requests 4%. Account credits offset it for now (net $0 while they last). Memory is billed as consumed for each environment's whole lifetime, idle time included: 0.405 GB per environment-second on average, and about 7,200 environment-seconds per hour (2.0 environments) since `maxEnvironments` went to 2. Billed GB-seconds were within about 3% of the time-weighted `EnvironmentMaxMemoryUsage`; whether billing uses peak or current memory is not documented.

Why two environments run almost all the time, and what can lower it:
- The docs have no minimum or reserved-environment setting and say an endpoint scales to zero without traffic, but Lambda keeps spare environments ("headroom") ahead of demand, up to `maxEnvironments` ([scaling](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-scaling.html)). Origin traffic is continuous in about 84% of minutes, so the endpoint sits at 2.
- Measured: it scaled to zero after about 5–6 idle minutes at least 6 times between 2026-10-13 and 10-15 (no idle period is documented), and Lambda replaced environments without any idle gap too (about 22 fresh starts in 35 h). A fresh environment uses about 150 MB and grows to about 430 MB over hours.
- `maxEnvironments` can't go below 2. The levers are memory per environment (`NODE_OPTIONS`, cache sizes), fewer origin requests (edge cache hit ratio), and longer idle gaps, which a site with visitors around the clock rarely has.
