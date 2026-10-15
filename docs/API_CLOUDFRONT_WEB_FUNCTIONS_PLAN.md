# api.chronas.org on CloudFront, with a Lambda Web Function origin

**Status:** revision 2, executed in compressed form. On 2026-10-13 the maintainer decided to go straight to the Web Function with CloudFront in front, directly in production (a short disruption is acceptable; no dev-account trial and no multi-day soaks). The runbook is [WEB_FUNCTION_CUTOVER.md](WEB_FUNCTION_CUTOVER.md). Also decided: login through CloudFront is not a goal in itself, no extra logs (3-day retention), no WAF.
**Supersedes:** revision 1 of this plan (2026-10-13) and the 2026-09-23 hard-cutover plan (never executed, deleted 2026-10-13).
**Implements:** issue #197 (Lambda Web Functions as a CloudFront origin). Tracking issue: #198.
**Prepared:** 2026-10-13, from read-only inspection of account `937826731833`, AWS documentation current on that date, and a code audit of `chronas-api` and `chronas-frontend`. Revision 2 adds the changes from an external review of revision 1, re-checked against the docs, the code and the account (§16).
**Prerequisite:** the maintainer's security work package, tracked separately. Its emergency part shipped on 2026-10-13 (v1.3.64); the rest must be finished before Phase P4.
**Status of the design items (2026-10-15).** Built as planned: the bootstrap and `web-server.js` (APP-3), the deploy pipeline without dual run (APP-4), the §6 CloudFront config, and the four alarms. **Not built:** the `smoke` endpoint and smoke distribution (D4, INF-2 #6), the EMF `LatencyMs` metric and its alarm (APP-3, INF-2 #7; the code was removed again), CloudFront standard logging (§6 Logging), 14-day log retention (the log groups keep 3 days), and the D9 10-minute 5xx watch. In their place (2026-10-15, branch `fix/web-function-24h-review`): one `http5xx` log line per app 5xx, and a `slowRequest` warning above 5 s. Measured cost, scaling and alarm behaviour after the first 40 hours are in §11 and the register; the figures in §4–§5 are the 2026-10-13 snapshot.

---

## 0. Ground rules: read before doing anything

**Lambda Web Functions and CloudFront's Lambda Web Function origin launched on 2026-10-12.** They are brand new. Whoever executes this plan, person or AI, must assume they know **nothing** about them from memory or training data.

1. **Make no assumptions.**
   - Every statement about Lambda Web Functions, CloudFront OAC for Lambda Web Functions, and the other recent features this plan uses must be checked against the **current official AWS documentation** before you act on it. Those recent features are CloudFront standard logging v2, cache-tag invalidation, origin mTLS, flat-rate pricing plans and Route 53 HTTPS records.
   - Use `docs.aws.amazon.com`, the AWS *What's New* posts and the AWS News Blog. With an AI agent, use the AWS documentation search and read tools. **Don't** rely on model knowledge, third-party blog posts or forum answers.
2. **Treat §5 and §6 as a dated snapshot.** They were checked against the docs on 2026-10-13. Re-read the linked pages (§15) at the start of each phase that depends on them; new services change quickly.
3. **When the docs and this plan disagree, the docs win.** Stop, update the plan and the verification register below, then continue.
4. **"Not documented" means unknown, not "probably works".** Don't build on it. Prove it with an experiment in the dev account (P6) or on the throwaway test distribution (P3), and record the result.
5. **Inferences are labelled.** Anything in this plan marked as an inference, estimate or "confirm in P6" is a hypothesis until it has been tested.
6. **Re-check live state before every phase** with read-only commands (§4.4 is a snapshot). Reject drift instead of working around it.
7. **Record evidence.** For every claim you rely on, put the doc URL and the date read, or the command and its output, in the PR description, and update the register.

### Verification register

Each line is something the design depends on that is new, undocumented or inferred. A phase may not start until the lines it depends on are ✅.

| # | Claim the plan relies on | Status on 2026-10-13 | How to prove it | Needed before |
| --- | --- | --- | --- | --- |
| V1 | Web Functions are GA in eu-west-1 | Documented (launch post, What's New) | Re-read the region list | P6 |
| V2 | Runtime is `nodejs24.x` on arm64 only | Documented | Re-read the runtime page | P6 |
| V3 | Whether `require(esm)` / module-loading flags apply on the Web Functions runtime | **Not documented** | Run the packaged zip in the dev account, with and without the Lambda module flags | P6 |
| V4 | Server must listen within 10 s; a custom `NODE_OPTIONS` replaces the default heap flag (and then Lambda doesn't set `--max-semi-space-size` either) | Documented | Measure startup and log `v8.getHeapStatistics().heap_size_limit` in the dev account | P6 |
| V5 | The real client IP is the second-to-last `X-Forwarded-For` entry behind CloudFront + OAC | Documented in two halves: Lambda appends the connecting address last, which is a CloudFront address when CloudFront is in front, and earlier entries are not validated | Log the XFF header for requests from a known IP | P6 (before relying on rate limits) |
| V6 | OAC with `always-amz-auth` passes the viewer's `Authorization: Bearer` unchanged, and POST/PUT/PATCH work without `x-amz-content-sha256` | ✅ Resolved 2026-10-15: web-functions-endpoint-access-control.html says "Lambda removes any `Authorization` value that is itself an AWS signature (a value that starts with `AWS4-`)", so the JWT reaches the app; the HTTP page's "removes the `Authorization` header" refers to the signature. Every production deploy's Postman run (login, authenticated GETs, writes) passes through CloudFront | — | P6 |
| V7 | `Authorization` must be in the cache policy of behaviors that need it on GET/HEAD | Documented (Web Functions OAC page) | Authenticated GET through the dev distribution | P6 |
| V8 | CloudFront accepts a cache policy with TTL 0/0/1 and headers in the key (`ChronasApiDynamicV3`) | **Assumption** | `create-cache-policy` succeeds, then P3 tests show no hits on dynamic paths | P3 |
| V9 | Whether CloudFront forwards `Authorization` on GET when it is only in the origin request policy | **Docs contradict each other** | The design avoids relying on it; P3 proves forwarding with `Authorization` in the key | P3 |
| V10 | `AllViewerExceptHostHeader` forwards CORS preflight headers and `Content-Type` | Documented ("all viewer headers except Host") | P3 preflight test returns `Access-Control-Allow-Headers` | P3 |
| V11 | Continuous deployment is unusable with HTTP/3 enabled | Documented | Re-read; if it changed, P3 could use a staging distribution | P3 |
| V12 | Web Function memory is billed on memory *consumed*, for the environment's whole lifetime including time between requests; idle lifetime and headroom environments | Billed on consumed memory (pricing page). Measured 2026-10-14: billed GB-s within about 3% of the time-weighted `EnvironmentMaxMemoryUsage`; whether billing uses peak or current memory is **still undetermined**. Idle lifetime **not documented** ("no guaranteed lifetime"); in prod the endpoint scaled to zero after about 5–6 idle minutes, at least 6 times in 35 h, and Lambda also replaced environments without idle gaps. Headroom: the docs say Lambda keeps spare environments ahead of demand, with no minimum setting; under continuous traffic that is `maxEnvironments` | Keep reading the daily cost; compare with `EnvironmentMaxMemoryUsage` after the `NODE_OPTIONS` change | P6 go/no-go |
| V13 | eu-west-1 prices (vCPU-s, GB-s, requests) | ✅ The Price List API unit prices match Cost Explorer to the cent (2026-10-14). The pricing page shows only US East (N. Virginia) | — | P6 |
| V14 | Endpoint `rateLimit` / `maxEnvironments` allowed values and 429 behavior | ✅ Confirmed by the CLI model and the scaling page: `maxEnvironments` 2–10,000 (optional); `rateLimit` 0 (503 `Platform.EndpointDisabled`), or 100–1,000 in steps of 100, then steps of 1,000 up to 10,000. 429 error types: `Platform.EndpointRequestThrottle` (rate), `Platform.EndpointMaxEnvThrottle` (capacity), and `Platform.EndpointConcurrentInitThrottle` (too many environments starting), which increments no throttle metric. Observed: rate-limit 429s also at under 1 request/s just after a burst (2026-10-15 00:41–00:45); the docs only say the limit is measured per second | Ask AWS Support about the low-rate throttles if they recur | P7 |
| V15 | Deploys need a **versioned** S3 bucket plus a bucket policy for `lambda.amazonaws.com` scoped to revision ARNs; deleting the object version, or the grant, moves the revision to `Failed` permanently | Documented | `create-web-function-revision` succeeds in the dev account | P7 |
| V16 | `aws lambda-web` CLI version | ✅ Documented in the CLI changelog: added in 2.37.8, removed again in 2.37.10, back in 2.37.13 | Pin **2.37.13 or later** in CI and fail fast on `aws lambda-web help` | P7 |
| V17 | Metrics in `AWS/Lambda/Web` (no latency metric, no revision dimension); no X-Ray segments | ✅ Metric list confirmed with `list-metrics` in prod. `HTTPResponseStatusClass5XX` also counts 5xx that Lambda returned before a request reached an environment. `EnvironmentConcurrentRequests` reads 1–2 even in minutes without requests, so it doesn't measure in-flight requests or the dynamic per-environment limit | — | P6 |
| V18 | Shutdown: `SIGTERM` with about 1 s to drain | Documented | Shift a revision under light load in the dev account | P7 |
| V19 | CloudFront logging v2 fields (`origin-fbl`, `origin-lbl`) and cost | ✅ Fields documented. Set up through the CloudWatch Logs API in us-east-1; a log group name may only contain `[\w-]`. Cost not yet measured | Enable in P2; check the fields and the first day's cost | P2 |
| V20 | Route 53 alias to CloudFront answers with TTL 60 | Observed with `dig`, TTL not documented | Re-check with `dig` | P5 |
| V21 | A custom error response with `ErrorCachingMinTTL` 0 stops CloudFront caching that 5xx code for custom origins | Documented ("doesn't apply to other types of origins" refers to the 1 s floor for S3) | P3: `/v1/statistics` returns 503 today; request it twice and expect no `Hit` | P3 |
| V22 | A revision being `Active` doesn't mean the server listens or is healthy | Documented ("Lambda does not verify that your server starts listening") | The pipeline checks `/v1/version` on the smoke distribution | P7 |
| V23 | Which reserved environment variables a Web Function receives | Only `AWS_LAMBDA_HTTP_ENDPOINT`, `AWS_LAMBDA_FUNCTION_MEMORY_SIZE`, `AWS_LAMBDA_METADATA_API` and `AWS_LAMBDA_METADATA_TOKEN` are documented. `AWS_LAMBDA_FUNCTION_NAME` and `LAMBDA_TASK_ROOT` are **not documented** | The app keys on `AWS_LAMBDA_HTTP_ENDPOINT`; P6 logs the variable **names** present at startup | P6 |
| V24 | Code from S3 is copied when the revision is created, not read per request | Documented ("Pending … includes downloading your code") | — | P7 |
| V25 | Keep-alive between the Web Function front end and the app's HTTP server (Node's default `keepAliveTimeout` is 5 s) | **Not documented.** No evidence of keep-alive races in the first 40 h (no `Runtime.*` failures in the WARN system logs) | Keep watching for intermittent 502/`Runtime.*` errors; tune only on evidence | P6 |
| V26 | `AWS_LAMBDA_HTTP_ENDPOINT` is `host:port` | ✅ Documented (runtimes page) | `web-server.js` integration test | P6 |

---

## 1. End state

```text
chronas.org (new frontend) ─┐
old.chronas.org (legacy) ───┤
third-party clients ────────┤
                            ▼
api.chronas.org ── Route 53 A alias ──► CloudFront E1KTIK2H0W8J2Q   (also reachable as d24mkpax7rmotx.cloudfront.net)
                                          default *        → no caching, Authorization in key
                                          /v1/areas/*      → public cache
                                          /v1/metadata*    → public cache
                                          /v1/markers*     → public cache
                                            │ OAC (SigV4, always-amz-auth)
                                            ▼
                        Lambda Web Function "chronas-api", endpoint "prod"
                        (eu-west-1, nodejs24.x, arm64, IamAuth: unsigned requests get 403)
                                            ▼
                        DynamoDB · S3 (statistics) · Secrets Manager
```

- **Traffic:** every client goes through CloudFront. The origin rejects unsigned requests. It is still reachable on the internet and accepts requests signed by any IAM principal that policies allow to call `lambda:InvokeWebFunctionEndpoint`; for a same-account identity, an identity-based policy is enough (§5, P9).
- **Caching:** public map data is cached at the edge. Authenticated and dynamic responses are never shared between viewers, and 5xx responses are not cached (D7).
- **Retired:** API Gateway (`2g4uy0bdoe`), its `api.chronas.org` custom domain, and the classic Lambda Event Function, after a rollback window.
- **Application:** one Express app, with no `@vendia/serverless-express` adapter in the end state. The JWT secret comes from Secrets Manager, not from environment variables (D8).

## 2. Key decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | **Move DNS first, then move the origin.** | Each step changes one thing and can be rolled back in about 5 minutes. A Web Function endpoint can't hold a custom domain, so `api.chronas.org` must already resolve to CloudFront before the origin can change for every client. Once it does, an origin change is invisible to clients. |
| D2 | **Make the CloudFront policies OAC-compatible from day one.** `Authorization` goes into the cache key on every behavior. | The behaviors are reworked only once, and switching origin is just a `TargetOriginId` change. This also settles an ambiguity in the docs about forwarding `Authorization` (§4.2). |
| D3 | **Migrate the origin one path pattern at a time on the live distribution.** | CloudFront continuous deployment is not supported on distributions with HTTP/3 enabled (ours has it) and may route everything to the primary during peaks. Moving path by path gives per-path rollback. |
| D4 | **Blue/green Web Function deploys.** A `smoke` endpoint follows the newest revision and sits behind a small smoke distribution. Postman runs there **before** the `prod` endpoint is moved. **Not built.** | Today's pipeline deploys first and rolls back after Postman fails, so users see the bad build until the rollback. |
| D5 | **Dual-run until retirement.** Every deploy updates both the Event Function and the Web Function from the same commit, in the order and with the failure handling in APP-4. | Every rollback target stays current. |
| D6 | **The Web Function trial happens in the dev account** (`704516356990`) and runs in parallel with Phases P1–P5. | The service launched on 2026-10-12. Node 24 and its runtime behavior must be proven before production. |
| D7 | **Don't cache 5xx.** The distribution gets custom error responses with `ErrorCachingMinTTL` 0 for 500, 502, 503 and 504. 404, 410, 414 and 501 keep the default, because CloudFront honors the origin's `no-store` on those and the app sends it on every error (APP-1). | CloudFront caches 500/502/503/504 for the error-caching minimum TTL (default 10 s) and **ignores** `no-store`, `no-cache` and `private` on them; only `CachingDisabled` or a per-code TTL of 0 prevents it. Custom error responses are per distribution, not per behavior. A cached 5xx would be served for 10 s to everyone sharing the cache key and would make the P5 trigger "`/v1/version` fails 3 times" unreliable. At about 0.3 req/s of origin traffic, the origin doesn't need the protection. No cross-user leak exists either way, because `Authorization` is in every key. |
| D8 | **The JWT secret comes from Secrets Manager, loaded before the app is imported.** A shared bootstrap reads `/chronas/secrets` with short timeouts, sets `process.env.JWT_SECRET` (the Secrets Manager value wins), and only then imports the Express app. The Web Function listens first and holds requests on a ready promise. Once the Event Function runs this way in production, its environment carries no secrets. | `config/config.js` reads `JWT_SECRET` at import time and every route captures `config.jwtSecret` at module load, so the secret must be in `process.env` before the first import. Web Function environment variables are fixed per revision and the docs say not to keep secrets in them; passing them through CI on every revision would route the secret through CI. Rotation then means updating one secret and recycling environments (APP-3). |
| D9 | **No traffic-percentage canary.** The Web Function is gated by Postman on the smoke distribution, then promoted 100/0, then checked by Postman on `prod` and a 10-minute watch of 5xx tagged with the new version, with automatic rollback. **Not built** (no smoke distribution, no version-tagged metric, no 10-minute watch). | At about 0.3 req/s of origin traffic, a 10% canary for 10 minutes sees about 18 requests, which proves nothing. AWS metrics have no revision dimension, so the app tags its own metric and logs with `APP_VERSION`. |

## 3. How it failed before

| Date | What happened |
| --- | --- |
| 2026-05-03 | Distribution `E1KTIK2H0W8J2Q` was created with alias `api.chronas.org`. Commit `96cc03d` says "DNS updated in Route 53 to route through CF". Six minutes later, frontend commit `2067405` pointed the frontend at `d24…` instead ("This avoids DNS changes"). The record still targets API Gateway today. CloudTrail keeps 90 days, so we can't tell whether it was changed and reverted. **Likely cause:** the CORS failure described in §4.1. |
| 2026-09-23 | A Kiro review declared the cutover a no-go and produced the earlier plan. Nothing was implemented: in the last 90 days there was no `UpdateDistribution` and no Route 53 change. |

## 4. Verified current state and problems this plan fixes

### 4.1 Browser login and authenticated calls fail through CloudFront today

- **Symptom:**
  - In a browser on `https://chronas.org`, a `POST` to `d24…/v1/auth/login` fails with *"Request header field content-type is not allowed by Access-Control-Allow-Headers in preflight response"*.
  - A GET carrying `Authorization` fails the same way.
  - Sent directly to `api.chronas.org`, both requests reach the app.
  - Reproduced with `curl`: on `d24…` the preflight returns no `Access-Control-Allow-Headers`; on `api.chronas.org` it returns `content-type,authorization`.
- **Cause:** `ChronasApiOriginRequestPolicy` forwards only `Authorization` and `Origin`. `Access-Control-Request-Headers` and `-Method` never reach Express, so `cors()` can't reflect them.
- **Impact:**
  - Login, signup and every authenticated action from chronas.org fail.
  - The frontend attaches `Authorization` to every request once a user is logged in (`chronas-frontend/src/api/client.ts:76-81`), so a browser with a stored token fails on public map requests too.
  - In 14 days, the API Gateway logs show only a handful of logins: the Postman smoke tests, plus 3 browser logins sent directly to `api.chronas.org` (probably the legacy site). None came through `d24…`.
- **Don't fix this alone.** Adding the CORS headers to the current policy would send authenticated GETs into a cache whose key doesn't contain `Authorization`. The fix is the full behavior split in §6 (Phase P4).

### 4.2 Forwarding `Authorization` without a cache key is ambiguous, so the design doesn't rely on it

- **What the docs say:**
  - The request-header table for custom origins says CloudFront removes `Authorization` on GET/HEAD.
  - The "add custom headers" page says listing it in an origin request policy forwards it, and warns: *"CloudFront can serve the same cached response to both authorized and unauthorized viewers"*.
  - The Lambda Web Function guide states plainly that `Authorization` must be in the cache policy for GET/HEAD.
- **Design consequence:** with `Authorization` in the cache key everywhere (D2), it is always forwarded, and one identity's response can't be served to another.
- **Exposure so far:** in the retained 14 days, CloudFront forwarded no authenticated user-profile GETs, and browsers can't send authenticated requests through `d24…` at all (§4.1). The risk is latent; it hasn't happened.

### 4.3 Memory: recurring timeouts

- **Timeouts:** 2026-10-03, 10-06 and 10-09, at 509–511 MB of 512 MB. Each matched a day when one client swept all ~3,942 `/v1/areas/:year` URLs directly against API Gateway:

  | Date | User-Agent | Requests |
  | --- | --- | ---: |
  | 2026-10-03 | Chrome | 3,044 |
  | 2026-10-06 | `Python-urllib/3.14` | 4,002 |
  | 2026-10-09 | `ourLife-map importer (Laravel)` | 3,999 |

- **Cause:**
  - `AreaDynamo.get()` caches every year for 24 h with no size limit (`server/models/dynamo/area.dynamo.js:14,54`).
  - The metadata caches use 7-day TTLs, and their keys come from the query string (`metadata.dynamo.js:15,162,231,235,415`).
- **Aggravating:** `NODE_OPTIONS=--max-old-space-size=900` on a 512 MB function. V8 believes it has 900 MB and doesn't collect aggressively before Lambda kills the sandbox.
- **CloudFront doesn't solve this.** Every new year is a cache miss; CloudFront already forwards 2,000–3,000 distinct area paths a day.
- **Web Functions doesn't remove the need either.** Its 2 GB environment raises the ceiling, but one environment serves up to 64 concurrent requests, so an OOM kills all of them. The caches must be bounded.

### 4.4 Inventory (2026-10-13)

| Item | Value |
| --- | --- |
| Route 53 `api.chronas.org` A (zone `Z005461139KF8GDMY491N`) | alias → `d-hghcknax0i.execute-api.eu-west-1.amazonaws.com`, zone `ZLY8HYME6SFDD`, `EvaluateTargetHealth=true`, TTL 60. No AAAA or HTTPS record. |
| CloudFront `E1KTIK2H0W8J2Q` (`d24mkpax7rmotx.cloudfront.net`) | Alias `api.chronas.org` (approved). ACM us-east-1 certificate for `chronas.org` and `*.chronas.org`, valid until 2027-02-26. PriceClass_100, HTTP/2+3, IPv6 on. **No ordered behaviors**, no custom error responses, logging off, no WAF. Last modified 2026-05-03. |
| Current policies | Cache: `88c889a3-…` (query strings all, `Origin` in key, TTL 0/**3600**/604800). Origin request: `5611f46d-…` (`Authorization` and `Origin` only). Because DefaultTTL is 3600, responses **without** `Cache-Control` are edge-cached for an hour today. |
| Frontend distributions | `E2ZHTJ5XV3DHIV` (`chronas.org`, `*.chronas.org`) and `E3V9JG5DMH4162` (`old.chronas.org`). Overlapping aliases are fine: the more specific `api.chronas.org` wins. |
| HTTP API `2g4uy0bdoe` | `$default` stage, throttle **10 req/s with burst 20 for the whole stage**. Execute-api endpoint enabled. Integration timeout 30 s, payload v2. No API Gateway CORS configuration (Express handles CORS). |
| Lambda | nodejs22.x, arm64, 512 MB, 30 s. No function URL. Configuration comes from environment variables plus `/chronas/secrets` (D8 changes how the two combine). |
| Lambda execution role | DynamoDB on `chronas-*`, Secrets Manager on `/chronas/secrets`, and `s3:GetObject`, `s3:PutObject` and `s3:ListBucket` on the **whole** `chronas-frontend-new` bucket, which is the frontend's own bucket. Only `api/statistics.json` is needed. |
| Traffic, 30 days | CloudFront: 1.77 M requests, 50 GB. API Gateway: 752 k requests. Lambda: 19 errors, 0 throttles. |
| Traffic, 14 days | At origin: 290.7 k via CloudFront and 32.7 k direct. Cache hit ratio ≈ 65% (from the API Gateway access logs, CloudFront traffic only). Peak 587 requests/min (≈ 9.8 req/s), peak 21 in one second. Only 11 HTTP 429s, all direct traffic on 2026-09-30. *Re-checked 2026-10-15:* daily CloudFront `Requests` against API Gateway `Count` for 10-06 to 10-12 give 40–68% at the origin, but that count includes the direct traffic (api.chronas.org pointed at API Gateway until 2026-10-13 15:56:59 UTC), so it overstates the origin share. After the cutover, with every client on CloudFront and the V3 policies (Authorization in the key, MaxTTL 1 day instead of 7) and `no-store` by default, the hit ratio was 31% on 10-14 (41% without the 02:30 area sweep). |
| Deployment bucket `chronas-lambda-deployments` | **Versioning off.** Web Functions require a versioned bucket. |
| GitHub `production` environment | No protection rules and no required reviewers. |
| Social logins | Retired on 2026-10-13 (v1.3.65, #199): `/v1/auth/login/{google,facebook,github,twitter}` return 410. Frontend #58 removed all four buttons. No OAuth session or cookies are used. |
| AWS CLI | The maintainer's local CLI 2.34.16 has no `lambda-web` command (V16). |
| Side findings | `/v1/statistics` has returned 503 for ≥14 days (`s3://chronas-frontend-new/api/statistics.json` is missing). A legacy Azure Application Insights availability test still polls the API (2,690 requests in 14 days; most of the 616 `GET /` 404s through CloudFront). |

### 4.5 Origin path mix (API Gateway access logs, 14 days to 2026-10-13)

Requests that reached the origin, by path family. "Via CloudFront" counts only cache misses.

| Path | Via CloudFront | Direct |
| --- | ---: | ---: |
| `GET /v1/markers` | 208,384 | 5,042 |
| `GET /v1/areas/:year` | 82,524 | 17,064 |
| `GET /v1/metadata` | 1,939 | 5,871 |
| `GET /v1/metadata/:id/getLinked` | 525 | 922 |
| `GET /` (404) | 616 | 111 |
| `GET /v1/metadata/:id` | — | 830 |
| everything else | < 30 each | < 800 each |

**Consequence for APP-1:** the paths that APP-1 turns from "cached by the default TTL" into `no-store` carry almost no traffic. getLinked is the only one worth caching, and it becomes an explicit public read.

## 5. Lambda Web Functions facts that shape the design

**A snapshot of the documentation read on 2026-10-13.** Re-verify every row against the current docs before relying on it (§0, register V1–V24). Sources are in §15. Prices come from the AWS Price List API for eu-west-1.

| Area | Fact | Design consequence |
| --- | --- | --- |
| Availability | GA 2026-10-12. Available in eu-west-1. | — |
| Runtime | `nodejs24.x` only, arm64 only. The runtime is patched automatically and can't be pinned. Whether `require(esm)` is allowed is **not documented** for Web Functions. | Run CI on Node 24, with and without Lambda's module flags. The dev trial (P6) must load the packaged zip. |
| Environment | Fixed 2 vCPU / 2 GB; V8 heap defaults to 1 GB. A custom `NODE_OPTIONS` *replaces* the default. `maxConcurrencyPerEnvironment` 1–128 (default 64), an upper bound on a limit Lambda manages. | If `NODE_OPTIONS` is set, include `--max-old-space-size`. Bounded caches are mandatory (§4.3). |
| Startup | The server must listen on `AWS_LAMBDA_HTTP_ENDPOINT` within **10 s**. Lambda routes requests to an environment as soon as it listens and **doesn't check** that a revision's server listens when it activates the revision. The docs recommend listening first and making handlers await a shared ready promise for deferred initialization. Entry file is `index.js`, or whatever `AWS_LAMBDA_NODEJS_ENTRYPOINT` names; `package.json` `main` is ignored. | `web-server.js` listens immediately and gates requests on the bootstrap promise (APP-3). The pipeline checks `/v1/version` before Postman (APP-4). |
| Environment variables | Set per revision and immutable; a new revision copies nothing. The docs say not to put secrets in them. Web Functions don't receive every standard Lambda variable; `AWS_LAMBDA_FUNCTION_NAME` and `LAMBDA_TASK_ROOT` are not documented as present. | Secrets come from Secrets Manager (D8). Runtime detection keys on `AWS_LAMBDA_HTTP_ENDPOINT` (APP-3). Revision variables are non-secret only. |
| Requests | HTTP/1.1 only. Timeout 3–900 s (504 when exceeded). Lambda appends the connecting address as the **last** `X-Forwarded-For` entry; behind CloudFront that is a CloudFront address, and earlier entries are not validated. The app sees `Host` as the endpoint domain. | Behind OAC the viewer IP is the second-to-last XFF entry, but only for requests that really came through CloudFront (P9). Use timeout 25 s with the CloudFront origin read timeout at 30 s. |
| Endpoint | Can't be disabled except with `rateLimit` 0, made private, or given a custom domain. With `IamAuth` plus CloudFront OAC (`lambda`, `sigv4`, `always-amz-auth`), unsigned callers get 403. **The endpoint stays reachable on the internet and accepts signed requests from any principal your policies allow**; for a same-account principal, `lambda:InvokeWebFunctionEndpoint` in its identity policy is enough (the managed policy `AWSLambdaInvokeWebFunctionEndpointAccess` grants it on every endpoint). The viewer's `Authorization: Bearer` passes through unchanged. POST/PUT/PATCH are signed `UNSIGNED-PAYLOAD`, so clients don't hash bodies. | OAC is the lock-down against the internet, not against our own IAM principals: keep CI and admin identities from holding `lambda:InvokeWebFunctionEndpoint` (P9). Smoke tests go through CloudFront (D4). |
| CloudFront requirements | `Authorization` must be in the cache policy of every behavior that needs it. The origin request policy must exclude `Host` (`AllViewerExceptHostHeader`). Lambda@Edge origin triggers are rejected (we have none). | §6 policies. |
| Deploy | Zip in a **versioned** S3 bucket → immutable revision → endpoint weights (at most 2 revisions). Lambda copies the code when the revision is created and keeps checking access to the object version. Deleting that version, or removing the bucket-policy grant, moves the revision to **`Failed` permanently**; requests routed to it get 409 `Platform.RevisionNotActive`, and Lambda doesn't shift traffic away. Endpoint updates (`revisionWeights`, `autoDeploymentMode`) are **asynchronous**: wait for `updateStatus` `Successful`. Waiters: `web-function-active`, `-deleted`, `-endpoint-active`, `-endpoint-deleted`, `-endpoint-updated`, `-revision-active`. Lambda cleans up to about 50 revisions, oldest first among those not routed to, which can include rollback targets. CLI: `aws lambda-web …` from CLI 2.37.13. | APP-4 passes the full non-secret config on every revision and waits after every endpoint change. INF-2 creates a versioned artifact bucket with one immutable key per commit and no lifecycle expiry. Pin AWS CLI ≥ 2.37.13. |
| Scaling | Scales to zero; no provisioned option. `maxEnvironments` 2–10,000 (may be exceeded briefly during weight changes). `rateLimit` per endpoint: 0, or 100–1,000 in steps of 100, then up to 10,000 in steps of 1,000 (429 `Platform.EndpointRequestThrottle` when exceeded; brief bursts may pass). | `prod`: `maxEnvironments` 3 at cutover, 2 since 2026-10-13 19:36 UTC; `rateLimit` 100. The smallest limit is 10× today's 10 req/s API Gateway throttle, so this is a cost and runaway cap, **not** a replacement for that throttle (§12). |
| Observability | Logs go to `/aws/lambda/web/<fn>` in the home Region and `/aws/lambda/web/<fn>.local` in every Region where requests run. The execution role needs both, the `.local` group with a Region wildcard. Metrics in `AWS/Lambda/Web`: `ExecutedRequests`, `HTTPResponseStatusClass4XX/5XX` (by function and endpoint), `EnvironmentMaxMemoryUsage`, `EnvironmentCPUTime`, … (by function); throttles in `AWS/Lambda/Web/Usage`. **No latency metric, no revision dimension.** The docs suggest an `APP_VERSION` variable in logs or as an EMF dimension. Lambda creates no X-Ray segments. | One app latency metric via EMF with dimensions `Runtime` and `Version` only (APP-3). Turn off the `aws-xray-sdk` middleware on the Web Function. |
| Price (eu-west-1) | $0.0000291572 per vCPU-second of active CPU, $0.0000038603 per GB-second of memory consumed for the **whole environment lifetime, including idle time between requests**, $0.30 per million requests. No Web Functions free tier is documented; the pricing examples "exclude the free tier". | Estimated about $3–6/month at today's origin volume. **Measured: $10.1/month gross** before tax (2026-10-14, §11). |

## 6. Target CloudFront configuration

### Origins

| Id | Domain | Access |
| --- | --- | --- |
| `ApiGatewayOrigin` (existing) | `2g4uy0bdoe.execute-api.eu-west-1.amazonaws.com` | none (kept until P9) |
| `WebFunctionOrigin` (new, P8) | `<prod endpoint>.lambda-web.eu-west-1.on.aws` | OAC `chronas-api-web-oac` (`lambda` / `sigv4` / `always-amz-auth`) |

Both use https-only, TLSv1.2, origin read timeout 30 s and 3 connection attempts.

### Cache policies (new; created once and used by both origins)

| Policy | TTL min / default / max | Cache key | Purpose |
| --- | --- | --- | --- |
| `ChronasApiDynamicV3` | 0 / 0 / 1 | `Authorization`, all query strings, gzip and brotli | Default behavior. The encodings normalize and forward `Accept-Encoding`, so the app compresses dynamic responses too (verified in P3). Nothing is effectively cached, because the origin sends `no-store` (APP-1). `Authorization` is forwarded on every method. Request collapsing is avoided (MinTTL 0 plus `no-store`). MaxTTL 1 instead of 0 because `CachingDisabled` can't carry headers. |
| `ChronasApiPublicV3` | 0 / **0** / 86400 | `Origin`, `Authorization`, all query strings, gzip and brotli | Public data. DefaultTTL 0 means only responses with an explicit `public` `Cache-Control` are cached (the handlers in APP-1). Anonymous requests share one entry; logged-in requests are keyed per token (APP-7 removes that). |

- **Origin request policy:** Managed-AllViewerExceptHostHeader (`b689b0a8-53d0-40ab-baf2-68738e2966ac`) on every behavior. It forwards CORS preflight headers, `Content-Type` and cookies, and sets `Host` to the origin's own domain, which both API Gateway and Web Function endpoints require.
- **Lookup rule:** scripts find policies by exact name and type and assert their contents.

### Behaviors

| Order | Path | Cache policy | Origin by phase: P4–P7 → P8 |
| --- | --- | --- | --- |
| t1, t2 (temporary, P8a) | `/v1/health`, `/v1/version` | Dynamic | — → WebFunction |
| 0 | `/v1/areas/*` | Public | ApiGateway → WebFunction (P8b) |
| 1 | `/v1/metadata*` | Public | ApiGateway → WebFunction (P8b) |
| 2 | `/v1/markers*` | Public | ApiGateway → WebFunction (P8b) |
| default | `*` | Dynamic | ApiGateway → WebFunction (P8c) |

All behaviors allow all 7 methods, cache only GET/HEAD, use redirect-to-https, and compress.

### Error caching (D7, distribution-wide)

| Status | Error caching minimum TTL | Why |
| --- | ---: | --- |
| 500, 502, 503, 504 | **0** | CloudFront ignores `no-store` on these, so only a TTL of 0 keeps them out of the cache. |
| 404, 410, 414, 501 | default (10 s) | CloudFront honors the origin's `no-store`, which the app sends on every error. |
| 400, 403, 405, 412, 415 | default | Cached only when the response carries `max-age` or `s-maxage`, which error responses never do. |

No custom error pages: `ResponseCode` and `ResponsePagePath` stay empty, so clients get the origin's body. The docs disagree on whether 410 is in the default cached set (one page lists it, another doesn't); the `no-store` rule covers both readings.

When an expired object is in cache and the origin returns 5xx, CloudFront serves the stale object instead. That keeps public map data available during an origin incident and doesn't depend on error caching.

### Unchanged settings

Aliases, certificate, TLS minimum (`TLSv1.2_2021`), price class, HTTP/2+3 and the IPv6 flag.

### Logging

**Not built** (2026-10-13 decision: no extra logs). Planned: standard logging v2 to CloudWatch Logs log group `chronas-api-cloudfront-access` in us-east-1 (the API for CloudFront logging runs there; names may only contain `[\w-]`), 14-day retention, about $0.5/month. Fields: no cookies and no `Authorization`; `c-ip` as in the existing API Gateway logs. It records path mix, hit ratio and origin latency (`origin-fbl` / `origin-lbl`), which also gives per-route latency without custom metrics.

## 7. Application work packages (`chronas-api`)

Each WP is a separate PR, tested the way production runs: the packaged zip served through `lambda-handler.handler` behind an API Gateway v2 adapter on seeded dynalite, with the full Postman suite, on Node 22.11 and the current 22.x, plus Node 24 from APP-3 onward.

### APP-1: edge-safe responses

- **Default no-store.** Middleware before everything else sets `Cache-Control: no-store`, so it also covers CORS preflights. The error handler sets it again explicitly, as do the Lambda handler's own responses.
- **Public opt-in.** Only these handlers set `public`: `area.controller.js` `get` (line 35), `marker.controller.js` `list` (191), and `metadata.controller.js` `get` (101), `list` (471, 473, 475) and `getLinked`. getLinked is new: it is identity-free, expensive for high-fan-out entities (#149), and already cached today by the distribution's DefaultTTL (§4.5). It gets `public, max-age=0, s-maxage=3600`, so browsers revalidate and an editor sees link changes once the edge entry is invalidated (APP-5).
- **Auth and user routes** are covered by the default. The retired social logins answer 410 with `no-store`.
- **CORS:** a disallowed origin gets a normal response without CORS headers (`callback(null, false)`) instead of a 500, which CloudFront would cache. The CORS options move to `config/cors.js`, so the unit test exercises the production rules.
- **Tests:**
  - New integration test `server/tests/integration/cache-control.test.js` on the real Express app: `no-store` on 2xx, 4xx (400, 401, 404, 410), 5xx and preflights; `public` on the public reads.
  - A guard: each public read returns 200 with a garbage `Authorization` (so no JWT middleware sits in front of it), and a source scan fails if a `public` header appears anywhere not on the allowlist.
  - A preflight with `Access-Control-Request-Headers` reflects them back.
  - PR CI also runs the integration suite.

### APP-2: memory and freshness

- Remove the per-year area cache; each edge miss becomes one DynamoDB `GetItem`.
- Replace the metadata caches with a small **in-repo** bounded LRU: limits on entries and approximate bytes, TTL ≤ 1 h. `f` lists are cached only when every id is one of the known init dictionaries; other parameter combinations still work but aren't cached. No new npm dependency (see ESM incident #193).
- Lower the area `s-maxage` from 604800 to 86400.
- Set the Event Function's `NODE_OPTIONS=--enable-source-maps --max-old-space-size=384` through `infra/apply-lambda-config.sh` (the script gains a non-secret "set" list).
- **Tests** (`server/tests/unit/cache-bounds.test.js`):
  - 5,000 distinct area reads add no cache entries.
  - A high-cardinality metadata sweep stays within the bound.
  - A local sweep of all years against the packaged handler stays under 400 MB RSS.

### APP-3: runtime-neutral bootstrap and Web Function entry

- **`config/bootstrap.js`** (D8), shared by both entries:
  - reads `SECRET_CONFIG_NAME` from Secrets Manager with a 1 s connection timeout, a 2 s request timeout, 2 SDK attempts and no further app-level retries (worst case about 6 s, inside the 10 s listen window even if it ran before `listen`);
  - writes `JWT_SECRET` into `process.env` (the Secrets Manager value wins over an environment variable);
  - then dynamically imports `config/express.js`, so `config.js` and every route see the secret at module load.
  - On the Event Function, a failed read falls back to the environment variable while it still exists, and logs a warning. On the Web Function there is no fallback.
- **`web-server.js`**, set through `AWS_LAMBDA_NODEJS_ENTRYPOINT`. It listens on the host and port from `AWS_LAMBDA_HTTP_ENDPOINT` **immediately**, and every request awaits the bootstrap promise. If bootstrap failed, requests get 503 with `no-store` and the next request retries it (at most once every 5 s). On `SIGTERM` it calls `server.close()` within 1 s. `lambda-handler.js` stays as is for the Event Function.
- **Runtime detection:** `isLambdaEnvironment()` in `lambda-config.js` also returns true when `AWS_LAMBDA_HTTP_ENDPOINT` is set, because `AWS_LAMBDA_FUNCTION_NAME` and `LAMBDA_TASK_ROOT` aren't documented for Web Functions (V23). On the Web Function (keyed on `AWS_LAMBDA_HTTP_ENDPOINT`):
  - turn off the `aws-xray-sdk` Express middleware;
  - turn off the Lambda-only cold-start and `X-Lambda-*` headers;
  - **don't** add the `Connection: close` middleware from `lambda-app.js:61`. It is meant for the adapter; on a real HTTP server it would make the platform reconnect for every request. P6 confirms keep-alive works;
  - keep `trust proxy` at 2, which is already right behind CloudFront plus either API Gateway or a Web Function (confirmed with V5 in P6).
- **Latency metric (not built; the code was removed):** one EMF log line per request, namespace `Chronas/Api`, metric `LatencyMs`, dimension set `[Runtime, Version]` only, where `Version` is `APP_VERSION` (the short commit). `Route` (the Express route template, never the raw path, which has 3,942 area years) and `Status` are properties, not dimensions, so they are queryable in Logs Insights without becoming metrics. Every log line carries `APP_VERSION`. Alarm on p99. Per-route latency comes from Logs Insights and the CloudFront logs.
- **Secret rotation** (runbook in `infra/README.md`): update `/chronas/secrets`; Event Function: `update-function-configuration` with an unchanged environment plus a bumped non-secret `CONFIG_EPOCH`, which recycles environments; Web Function: create a revision from the same artifact and promote it 100/0. Old tokens stop working at that moment, as with any rotation.
- **CI:** `pr-ci.yml` and `deploy-prod.yml` gain a Node 24 job that runs tests and loads the app with and without Lambda module flags.

### APP-4: deploy pipeline

- **Concurrency:** group `chronas-api-production`, `cancel-in-progress: false`, shared with `api-edge-prod.yml`. Cancelling a deploy between the code update and the rollback step would leave an untested build live.
- **Build once.** One zip contains both entries. Upload it to `deploys/chronas-api-<sha>.zip` (Event Function) and to the versioned artifact bucket under an immutable per-commit key (INF-2); record the S3 `VersionId`.
- **Event Function** (from P1; until P9):
  0. Record the rollback target: the zip of the commit `/v1/version` reports **before** the deploy. Not the newest zip in `deploys/`: after a failed deploy was rolled back, that is the failed build.
  1. `update-function-code`, then `wait function-updated`.
  2. Invalidate `/v1/*` and **wait** for `invalidation-completed`.
  3. Check that `/v1/version` on `api.chronas.org` returns the new commit (retry for up to 2 minutes).
  4. Postman.
  5. On failure: roll back, invalidate again and wait, and check that `/v1/version` returns the previous commit.
- **Web Function** (from P7). Order and failure handling:
  1. `lambda-web create-web-function-revision` with the **full non-secret** configuration every time: environment (including `APP_VERSION`, never `JWT_SECRET`), role, `timeoutSeconds 25`, `maxConcurrencyPerEnvironment 64`, entrypoint, artifact `VersionId`.
  2. `wait web-function-revision-active`. The `smoke` endpoint (LatestRevision) picks it up; `wait web-function-endpoint-updated` on `smoke`.
  3. Check that `/v1/version` on the smoke distribution returns the new commit (Active doesn't mean healthy, V22). Then run Postman against the smoke distribution. **If either fails, stop:** nothing that serves users has changed; the smoke endpoint keeps the bad revision until the next deploy.
  4. Run the Event Function steps above. **If they fail**, the Event Function rolls back and the Web Function `prod` endpoint is **not** promoted, so both runtimes stay on the previous commit.
  5. On `prod`: weights 100/0 to the new revision, then `wait web-function-endpoint-updated`.
  6. Invalidate and wait. Check `/v1/version` through the distribution, run Postman on `api.chronas.org`, then watch for 10 minutes: roll back if the new `Version` logs ≥ 3 5xx or `HTTPResponseStatusClass5XX` rises above baseline (D9).
  7. On failure in steps 5–6: weights back to the previous revision, `wait web-function-endpoint-updated`, invalidate and wait. The Event Function keeps the new commit, which passed its own Postman run; the two runtimes then differ until the next green deploy. That is acceptable because every deploy is backward compatible (workspace rule) and both builds passed Postman. The run is marked failed.
- **CLI:** install a pinned AWS CLI ≥ 2.37.13 and fail fast if `aws lambda-web help` doesn't work.
- **Secrets:** CI never handles `JWT_SECRET` (D8).
- **Lint:** check-only (no `--fix`) in CI.

### APP-5: targeted invalidation on writes

- After a successful area, metadata, marker or revision-revert write, invalidate the matching family (`/v1/areas/*`, `/v1/metadata*`, `/v1/markers*`).
- **Await** the `CreateInvalidation` call with a 2 s timeout before the response is sent. A debounce or a timer after the response doesn't work on the Event Function: callbacks still pending when the handler returns only resume if the environment is reused. Log failures without failing the write; MaxTTL of 1 day is the fallback.
- **Cost:** a wildcard counts as one path, and the first 1,000 paths a month are free.
- **IAM:** `cloudfront:CreateInvalidation` on `E1KTIK2H0W8J2Q` only, for both execution roles.

### APP-6: tests that would otherwise read edge caches

- **Postman:**
  - Add a cache-buster (`?_cb={{$guid}}`) to every read-after-write check, and to the reads they are compared against. Not `{{$timestamp}}`: CI sends requests 500 ms apart, so two reads in the same second would share an edge key.
  - Add an "anonymous re-read" step: the authenticated `GET /v1/users/…` URL requested without a token must return 401, never `x-cache: Hit`.
  - Assert the APP-1 headers: `no-store` on `/v1/version`, `/v1/health`, a 404 and a 410; `public` on `/v1/areas/:year`.
  - After P5, assert that `via` contains `CloudFront`.
- **Data validation:** `scripts/data-validation/chronas-client.js` adds a cache-buster to every GET, because the validator and applier decide on what they read before and after their own writes. Keep `npm run test:integration` green.

### APP-7: frontend (`chronas-frontend`, separate PRs)

- Attach `Authorization` only to requests that need it: non-GET, `/users/*`, `/revisions/*` and `/auth/*`. Public GETs then share one edge entry.
- ~~OAuth start and callback, Twitter button~~: done. Social logins were retired instead (API #199, frontend #58 removed all four buttons).
- Keep `VITE_API_BASE_URL=https://d24mkpax7rmotx.cloudfront.net/v1` until P5. After P5, switching to `https://api.chronas.org/v1` is optional, because both names reach the same distribution.

## 8. Infrastructure work packages (CLI scripts in `infra/`, never CDK)

### INF-0: execution role scope (P1)

- Scope the Event Function role's S3 access to the statistics object: `s3:GetObject` and `s3:PutObject` on `arn:aws:s3:::chronas-frontend-new/api/statistics.json` only. Keep `s3:ListBucket` on the bucket, so a missing object stays a 404 (`NoSuchKey`) instead of a 403 that the statistics controller would misreport.
- The policy moves into the repo next to `infra/iam-inline-policy.json` and is applied by `apply-lambda-config.sh`.

### INF-1: edge tooling (`infra/api-edge/`) and `.github/workflows/api-edge-prod.yml`

| File | Purpose |
| --- | --- |
| `constants.sh` | Account, region, hosted zone, distribution, API ID, CloudFront alias zone `Z2FDTNDATAQYW2`, original API Gateway alias (`d-hghcknax0i…`, `ZLY8HYME6SFDD`, `EvaluateTargetHealth=true`). |
| `snapshot.sh` | Distribution config and ETag, policies, Route 53 record, API Gateway domain and stage. No Lambda environment, no secrets. |
| `render-config.mjs` | Builds the target config from the live one plus §6, including the custom error responses. Has an origin-assignment parameter per behavior. |
| `validate-config.mjs` | Asserts §6 invariants. Runs in PR CI against a fixture. |
| `apply-cloudfront.sh` | Applies the config with the captured ETag and waits for `Deployed`. |
| `test-distribution.sh` | Creates and deletes the P3 throwaway distribution. |
| `route53.sh` | Forward and exact-restore DNS changes; waits for `INSYNC`. |
| `verify.sh` | §9 checks against any base URL; writes a JSON summary. |

**Rules for every script:**
- `set -euo pipefail`; read-only unless run with `--apply` and an exact confirmation phrase.
- Check `sts get-caller-identity` first, and reject drift.
- Never print tokens, `Location` query strings or Lambda environment values.

**Workflow `api-edge-prod.yml`:**
- `workflow_dispatch` with action `plan | logging | test-dist | behaviors | cutover | origin | verify | rollback`.
- Runs in the new GitHub environment `production-edge`, with a required reviewer.
- Shares concurrency group `chronas-api-production`, uses `permissions: contents: read`, has a job timeout, and keeps snapshots as artifacts and in `s3://chronas-lambda-deployments/infra-backups/api-edge/<run-id>/`.

**The `logging` action:**
- CloudFront logging v2.
- API Gateway access-log format with `$context.domainName`, `routeKey`, `integration.status`, `integrationErrorMessage` and `responseLatency`.
- Alarms for Event Function timeouts and OOMs.

### INF-2: Web Function resources (`infra/web-function/`)

1. **Artifact bucket** `chronas-lambda-web-artifacts`:
   - versioning on;
   - one immutable key per commit (`web/chronas-api-<sha>.zip`), never overwritten, so no noncurrent versions arise;
   - **no lifecycle expiration.** A cleanup script may delete an object only when no revision returned by `list-web-function-revisions` references its version, and never the versions of the revisions currently routed on any endpoint or the previous one. Deleting a referenced version fails that revision permanently (V15);
   - bucket policy grants `lambda.amazonaws.com` `s3:GetObject` and `s3:GetObjectVersion` with `ArnLike aws:SourceArn arn:aws:lambda:eu-west-1:937826731833:web-function/chronas-api/revision/*`. Removing this grant also fails revisions, so changes to it go through review;
   - SSE-S3 (no KMS key to grant).
2. **Execution role** `chronas-api-web-function-role`, with permissions copied from the current role and scoped:
   - the `chronas-*` DynamoDB tables in use, including `chronas-rate-limits`;
   - the S3 statistics object (as INF-0);
   - `secretsmanager:GetSecretValue` on `/chronas/secrets`;
   - logs (`CreateLogGroup`, `CreateLogStream`, `PutLogEvents`) on `arn:aws:logs:eu-west-1:937826731833:log-group:/aws/lambda/web/chronas-api:*` and `arn:aws:logs:*:937826731833:log-group:/aws/lambda/web/chronas-api.local:*`;
   - `cloudfront:CreateInvalidation` on the distribution.
3. **Web Function** `chronas-api` with two endpoints:

   | Endpoint | Type / auth | Deployment | `maxEnvironments` | `rateLimit` |
   | --- | --- | --- | ---: | ---: |
   | `prod` | HomeRegion eu-west-1, IamAuth | `autoDeploymentMode Disabled` | 3 | 100 |
   | `smoke` | HomeRegion eu-west-1, IamAuth | `LatestRevision` | 2 | 100 |

4. **Resource policy** (`put-resource-policy` on the function ARN):
   - `prod` endpoint: allow `cloudfront.amazonaws.com` `lambda:InvokeWebFunctionEndpoint` with `aws:SourceArn` = `E1KTIK2H0W8J2Q`.
   - `smoke` endpoint: the same, with the smoke distribution's ARN.
5. **OAC** `chronas-api-web-oac`.
6. **Smoke distribution** `chronas-api-smoke` (permanent, no alias; **not built**):
   - default behavior → `smoke` endpoint, with the §6 policies and error caching;
   - its hostname is Postman's `baseUrl` during deploys. About $0, inside the CloudFront free tier.
7. **Monitoring:**
   - log retention of 14 days on `/aws/lambda/web/chronas-api` and `.local` (**built as 3 days**);
   - alarms on `AWS/Lambda/Web` `HTTPResponseStatusClass5XX`, `EnvironmentMaxMemoryUsage` > 1.5 GB, `EndpointRequestThrottles` in `AWS/Lambda/Web/Usage`, and EMF `LatencyMs` p99 (**built:** the first three plus `EndpointActiveEnvironmentThrottles`; no `LatencyMs`).

## 9. Phases and gates

On top of the gates below, a phase may only start when its lines in the §0 verification register are ✅ (re-checked against the current docs or proven by experiment). That covers P2 (V19), P3 (V8–V11, V21), P5 (V20), P6 (V1–V7, V12, V13, V17, V23, V25, V26) and P7 (V14–V16, V18, V22, V24).

| Phase | Action | Gate to proceed |
| --- | --- | --- |
| **P0 Prerequisites** | GitHub environment `production-edge` with a reviewer. CI IAM permissions confirmed (§12). Maintainer's security package complete **before P4**. | All done before the phase that needs them. |
| **P1 App hardening** | APP-1, APP-2, APP-6, INF-0, and the concurrency, wait, version-check and rollback-invalidation parts of APP-4, deployed to the Event Function by the normal pipeline. | Postman green. Direct checks: `/v1/version` and `/v1/health` → `no-store`; 404 and 410 (for example `/v1/auth/login/google`) → `no-store`; `/v1/areas/1500` → `public, …, s-maxage=86400`; getLinked → `public, max-age=0, s-maxage=3600`; preflight reflects headers; a disallowed origin gets no CORS headers and no 500. Memory p95 at baseline. |
| **P2 Observability** | `logging` action. No behavior change. | **48 h baseline** of path mix, hit ratio, origin req/s per minute, 429s. |
| **P3 Test distribution** | Throwaway distribution (no alias) with §6 policies, behaviors and error caching, all pointing at `ApiGatewayOrigin`. Run `verify.sh` and the **full Postman suite** with `baseUrl` set to its hostname. Then delete it. | (1) authenticated `GET /v1/users/postman@aui.de` → 200, anonymous re-read → 401; (2) writes on public paths with a token succeed; (3) preflight returns `Access-Control-Allow-Headers`; (4) a unique area URL misses, then hits; (5) `/v1/version`, `/v1/health` and a 410 (`/v1/auth/login/google`) are never hits; (6) a disallowed origin gets no `Access-Control-Allow-Origin`; (7) bodies match the direct API; (8) `/v1/statistics` (503) requested twice is never a hit (V21). |
| **P4 Live behaviors** | `behaviors` action on `E1KTIK2H0W8J2Q`: snapshot, apply §6 (behaviors, policies, error caching) with the ETag, wait for `Deployed`, invalidate and wait. **This fixes §4.1 for chronas.org.** | P3 checks pass via `d24…` and via `curl --connect-to api.chronas.org:443:d24mkpax7rmotx.cloudfront.net:443`. Browser login on chronas.org works. **24 h soak**: CloudFront 5xx, Lambda errors, timeouts and OOMs at baseline; API Gateway 429s not above baseline. |
| **P5 DNS cutover** | `cutover` action. Re-check identity, certificates, `Deployed` and the live record, then snapshot. One `UPSERT`: `api.chronas.org` A → `{HostedZoneId: Z2FDTNDATAQYW2, DNSName: d24mkpax7rmotx.cloudfront.net., EvaluateTargetHealth: false}`. Wait for `INSYNC`, poll resolvers until `via: CloudFront` appears, then run `verify.sh` and Postman on `https://api.chronas.org`. | Green, then 30 min observation, including a CORS sample from `old.chronas.org`. **Automatic DNS rollback** on: TLS, DNS or CORS failure; an authenticated response served as a hit; Postman failure; `/v1/version` failing 3 times (meaningful because 5xx aren't cached, D7); a new timeout or OOM; CloudFront 5xx > 1% for 5 min. No AAAA records; ACM CNAMEs untouched. |
| **P6 Web Function trial (dev account, parallel with P1–P5)** | Deploy the packaged zip as a Web Function behind a dev distribution with OAC and §6 policies. Run the full Postman suite and an all-years area sweep. Leave a smoke-style endpoint idle for the cost measurement. | Node 24 clean, with and without module flags. No intermittent 502s under bursty load (V25). Listens in < 3 s; requests during bootstrap wait instead of failing. `Authorization` reaches the app on GET and on writes. Unsigned direct calls → 403. Viewer IP position in XFF confirmed. Reserved variable names logged (V23). Keep-alive from the platform works without `Connection: close`. EMF metric visible with `Runtime` and `Version` only. Memory under sweep < 1 GB. Measured cost ≤ $10/month extrapolated, including the idle endpoint. AWS CLI ≥ 2.37.13 supports `lambda-web`. No open AWS issues. **Otherwise stop after P5 and use the fallback in §10.** |
| **P7 Prod Web Function** | INF-2 provisioning. APP-3 and the dual-run APP-4 merged. Every deploy now also creates a revision and runs Postman through `chronas-api-smoke`. | At least 3 consecutive deploys green on smoke and on the Event Function. No 5xx on smoke. |
| **P8 Origin migration** | `origin` action, one step at a time; each step is apply → `Deployed` → verify → soak. **P8a:** temporary behaviors `/v1/health` and `/v1/version` → Web Function (24 h). **P8b:** `/v1/markers*`, then `/v1/metadata*`, then `/v1/areas/*` (24 h each). **P8c:** default `*` (48 h). Then remove the temporary behaviors. | Per step: Postman via `api.chronas.org` green; Web Function 5xx and EMF p99 at or below the Event Function baseline; memory < 1.5 GB. **Rollback per step:** set `TargetOriginId` back to `ApiGatewayOrigin` (about 5 min). |
| **P9 Lock-down and retirement** | After ≥ 14 days with everything on the Web Function: block the old path (remove the API Gateway invoke permission from the Event Function; reversible). Audit identity policies in the account: no CI, deploy or human identity keeps `lambda:InvokeWebFunctionEndpoint` (directly, through `lambda:*`, `*`, or `AWSLambdaInvokeWebFunctionEndpointAccess`) unless it is meant to call the origin. Then switch rate-limit keys to the viewer IP (second-to-last XFF entry). This is trustworthy only for requests that came through CloudFront, so it is safe only to the degree that audit holds. After another ≥ 14 days: drop dual-run from the pipeline, remove `@vendia/serverless-express` and `lambda-handler.js`, and decide how to remove API Gateway, its custom domain and certificate, and the Event Function (§12). Correct `CLAUDE.md`, `README.md` and `infra/README.md`. | No traffic on API Gateway for 14 days. IAM audit recorded. Docs match reality. |

## 10. Rollback matrix

| Phase | Rollback | Time |
| --- | --- | --- |
| P1 | Lambda rollback in `deploy-prod.yml`, now followed by invalidate and wait and a `/v1/version` check. | about 5 min |
| P4 | Restore the snapshot distribution config with the current ETag. **Emergency only:** this brings back the §4.1 CORS failure and the §4.2 risk. | about 5–10 min |
| P5 | `route53.sh --rollback --apply`: exact restore to `d-hghcknax0i…` / `ZLY8HYME6SFDD` / `EvaluateTargetHealth=true`. Keep the API Gateway custom domain, regional certificate and mapping for ≥ 7 days. | about 1–2 min (TTL 60) |
| P7 | Endpoint weights back to the previous revision, then `wait web-function-endpoint-updated`. The Event Function remains the live origin until P8. | about 1 min |
| P8 | `TargetOriginId` back to `ApiGatewayOrigin` for the affected behavior or behaviors. | about 5 min |
| P9 | Re-add the API Gateway invoke permission, re-enable dual-run. | about 5 min |

A rollback target only works while its revision is `Active`: never delete the artifact version of the current or previous revision (INF-2).

**Fallback if P6 fails** (Web Functions not ready): stay on the Event Function and lock the origin with a CloudFront origin custom header carrying a secret that the app checks. Run it report-only first, then enforce. Re-evaluate Web Functions in about 3 months.

## 11. Cost (monthly, at current traffic)

| Item | Today | After P5 | During P7–P8 (dual-run) | After P9 |
| --- | ---: | ---: | ---: | ---: |
| CloudFront requests and transfer | $0 (free tier: 10 M requests, 1 TB) | $0 | $0 | $0 |
| CloudFront logs v2 | $0 | about $0.5 | about $0.5 | about $0.5 |
| API Gateway HTTP API | about $0.75 | about $0.75 | ≤ $0.75 | $0 |
| Lambda Event Function | about $0 (free tier) | about $0 | about $0 | $0 |
| Lambda Web Function, `prod` (≈ 700 k origin requests, ≈ 30 ms CPU each, ≈ 250 MB, 1–2 environments alive) | — | — | about $3–6 | about $3–6; **measured $10.1 gross** (see below) |
| Lambda Web Function, `smoke` (idle between deploys) | — | — | **unknown** until P6 (V12); bounded by `maxEnvironments` 2 | same |
| CloudWatch alarms (≈ 6 standard alarms, $0.10 each) | $0 | about $0.3 | about $0.6 | about $0.6 |
| EMF custom metric `LatencyMs` ($0.30 per metric-month, prorated hourly; 2 `Runtime` × 1 live `Version`, plus short overlaps at deploys) | — | — | about $0.6–1 | about $0.3–0.5 |
| **Total delta vs today** | — | **+$0.8** | **+$5–8.5, plus smoke idle** | **+$4–7, plus smoke idle** |

- Web Function memory is billed for the environment's whole lifetime, idle time included. `maxEnvironments` 3 capped the worst case for `prod` at the cutover; it is 2 since 2026-10-13 19:36 UTC.
- **Measured (Cost Explorer, 2026-10-14):** $0.332/day gross, about $10.1/month before tax (≈ $12 with tax): memory 81%, vCPU 15%, requests 4%; offset by account credits while they last. The estimate assumed about 250 MB and 1–2 environments; reality is about 405 MB per environment × 2 environments × 24 h, because Lambda keeps headroom environments up to `maxEnvironments` while traffic is continuous. The cutover also doubled DynamoDB reads (about 300–390 k to 595–598 k read units per day, ≈ +$0.9/month), mostly `chronas-areas`.
- The EMF and smoke rows were never built, so they cost nothing.
- With `Route` as a dimension (revision 1), `LatencyMs` alone would have been about 80 metrics, $24/month; that is why it's a property now.

## 12. Open decisions for the maintainer

1. **CI IAM.** Confirm or grant that the CI user can do the following (inspection was blocked in this session; prefer a scoped policy, and leave OIDC for a later change):
   - CloudFront: create/update/delete distributions; create policies and OACs; create invalidations; get invalidations (for the waiter).
   - Route 53: change records in `Z005461139KF8GDMY491N`.
   - API Gateway: update the stage.
   - CloudWatch: put alarms and metric filters.
   - Lambda Web Functions (IAM prefix `lambda:`; `lambda-web` is only the CLI namespace), on `arn:aws:lambda:eu-west-1:937826731833:web-function/chronas-api*`: `lambda:CreateWebFunctionRevision`, `lambda:GetWebFunctionRevision`, `lambda:ListWebFunctionRevisions`, `lambda:UpdateWebFunctionEndpoint`, `lambda:GetWebFunctionEndpoint`, `lambda:GetWebFunction`. Provisioning (INF-2) additionally needs `lambda:CreateWebFunction`, `lambda:CreateWebFunctionEndpoint` and `lambda:PutResourcePolicy`, preferably run by the maintainer rather than CI.
   - `iam:PassRole` on `chronas-api-web-function-role` only.
   - S3: `s3:PutObject`, `s3:GetObject` and `s3:GetObjectVersion` on the artifact bucket; the backup prefix.
   - **Not** `lambda:InvokeWebFunctionEndpoint` (P9).
2. **GitHub:** create environment `production-edge` and choose its reviewer.
3. **Throttle:** keep the 10 req/s API Gateway throttle until P8 (recommended). After P8 there is no equivalent, because the endpoint `rateLimit` floor is 100 req/s. **Decided: no WAF.** Abuse control after P8 is the app's per-IP limits on the auth routes, plus `rateLimit` 100 and `maxEnvironments` 3 as a cost cap.
4. **Error caching (D7):** decided as "don't cache 5xx". The alternative is to accept 10 s of cached 5xx; then the P5 rollback triggers need cache-busters.
5. **Retirement:** remove API Gateway and the Event Function out-of-band (they belong to CloudFormation stacks the deploy workflow still reads, so this creates drift), or leave them in place, blocked. Recommended: leave them in place and blocked until a dedicated cleanup.
6. **Bulk importers:** publish a downloadable dataset (CC BY-SA) so bulk importers stop crawling 3,942 URLs. Three sweeps happened in two weeks.
7. **Side issues:** restore `api/statistics.json` (`POST /v1/statistics/refresh`) and delete the legacy Azure availability test.

## 13. Effort

| Work | Estimate |
| --- | ---: |
| APP-1 headers and CORS | 2–3 h |
| APP-2 caches, TTLs, heap | 3–4 h |
| APP-3 bootstrap, Web Function entry, EMF, Node 24 CI | 5–7 h |
| APP-4 pipeline (dual-run, blue/green) | 5–7 h |
| APP-5 targeted invalidation | 2–3 h |
| APP-6 tests | 1–2 h |
| APP-7 frontend | 1–2 h |
| INF-0 role scope | 0.5 h |
| INF-1 edge tooling and workflow | 4–6 h |
| INF-2 Web Function resources | 3–4 h |
| P6 trial | about 0.5 day, plus about 3 days of cost observation |

| Calendar | Duration |
| --- | --- |
| P1–P5 | about 4 days (48 h baseline + 24 h soak) |
| P7–P8 | about 7–8 days of soaks |
| P9 | ≥ 28 days of waiting |

Engineering is roughly 4–6 working days in total.

## 14. What changed compared with the 2026-09-23 plan

| Earlier plan | This plan | Reason |
| --- | --- | --- |
| Origin lock-down as a vague follow-up (new API Gateway domain plus secret header) | Lambda Web Function behind OAC (P7–P9); secret header only as fallback | New AWS feature (#197). |
| "Approved production environment" | New `production-edge` environment | The assumed protection does not exist. |
| Mutate the live distribution first | Throwaway test distribution first; continuous deployment ruled out | HTTP/3 is enabled, and the live distribution serves the frontend. |
| Default `CachingDisabled` | `ChronasApiDynamicV3` with `Authorization` in the key | Required by Web Function OAC; settles the forwarding ambiguity. |
| Edge-cache `/v1/statistics` | Uncached | It returns 503 and gets about 21 requests per 14 days. |
| Error caching set to 0 | 0 for 500/502/503/504 only (D7) | Revision 1 kept the defaults on the wrong assumption that `no-store` prevents error caching; it doesn't for those codes. |
| New smoke secrets | Existing Postman login | It already covers authenticated GETs and writes. |
| Deploy, then roll back on failure | Blue/green via the smoke endpoint | Web Function endpoint weights allow it. |
| 30-minute in-workflow observation | 24 h soak after P4, 30 min after P5, plus per-step soaks in P8 | The risky changes are the behavior split and the origin swap, not the DNS flip. |

## 15. Sources

- **Lambda Web Functions:**
  - https://aws.amazon.com/blogs/aws/announcing-aws-lambda-web-functions-for-fast-consistent-web-app-performance-anywhere/
  - https://aws.amazon.com/about-aws/whats-new/2026/10/aws-lambda-web-functions/
  - https://aws.amazon.com/about-aws/whats-new/2026/10/cloudfront-lambda-web-functions-origin/
  - https://docs.aws.amazon.com/lambda/latest/dg/web-functions.html and its pages: `-runtimes`, `-http`, `-env-lifecycle`, `-how-it-works`, `-scaling`, `-endpoints`, `-endpoint-access-control`, `-permissions`, `-revisions`, `-revisions-env-vars`, `-deployment`, `-code-s3`, `-logging`, `-monitoring-metrics`, `-emf`, `-troubleshooting`
  - https://docs.aws.amazon.com/lambda/latest/lambda-web/API_Operations.html
  - https://docs.aws.amazon.com/cli/latest/reference/lambda-web/wait/index.html
  - https://raw.githubusercontent.com/aws/aws-cli/v2/CHANGELOG.rst (entries 2.37.8, 2.37.9, 2.37.10, 2.37.13)
  - https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html (pending callbacks after the handler returns)
  - https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
  - https://aws.amazon.com/lambda/pricing/ and https://aws.amazon.com/lambda/faqs/
- **CloudFront and Lambda Web Function origins:**
  - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda-web.html
  - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html
  - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html
  - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html
  - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
  - https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_CachePolicyConfig.html
  - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html
  - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HTTPStatusCodes.html
  - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/custom-error-pages-expiration.html
  - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/continuous-deployment-quotas-considerations.html
  - https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PayingForInvalidation.html
  - https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/
- **CloudWatch prices:** AWS Price List API (`AmazonCloudWatch`, location EU (Ireland)), 2026-10-13; https://aws.amazon.com/cloudwatch/pricing/
- **Route 53 and API Gateway:**
  - https://docs.aws.amazon.com/Route53/latest/APIReference/API_AliasTarget.html
  - https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-to-cloudfront-distribution.html
  - https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html

## 16. Review of revision 1 (2026-10-13): what was checked and changed

An external review checked revision 1 against the docs, both repos and the live account. Each point was re-checked before it was adopted.

| Review point | Re-check | Change |
| --- | --- | --- |
| OAuth already retired; plan items assume the old flow | **Confirmed** (`auth.route.js` answers 410). The frontend part was already done: #58 removed all four buttons; the reviewer's checkout was one commit behind. | APP-1, APP-7, P1 and P3 gates, §4.4 row. |
| Error caching described wrongly | **Confirmed** (custom-error-pages-expiration, HTTPStatusCodes). One refinement: a per-code `ErrorCachingMinTTL` of 0 is a documented way out, not only `CachingDisabled`. | D7, §6 error caching, P3 check (8), V21. |
| Secrets on the Web Function not designed | **Confirmed** in the code (`config.js` import-time read, route-level `config.jwtSecret`, the merge in `lambda-config.js` never reaching `config.js`, 10 s × 3 × 3 retries) and in the docs (immutable per-revision variables, no secrets in them, no listen check at activation). | D8, APP-3 bootstrap and `web-server.js`, APP-4 "never `JWT_SECRET`", rotation runbook. |
| Artifact lifecycle can break live revisions | **Confirmed** (web-functions-code-s3). | INF-2 bucket rules, rollback note, V15. |
| EMF cost not counted | **Confirmed**: $0.30 per metric-month in eu-west-1; each dimension combination is a metric. | Dimensions `Runtime` + `Version` only; `Route` and `Status` as properties; §11 rows. |
| Rate limit not equivalent | **Confirmed** (floor 100 req/s). The suggested WAF rule was rejected by the maintainer. | §5 scaling row, §12 decision 3 (no WAF). |
| "Only CloudFront can reach the origin" too strong | **Confirmed**, including that a same-account identity policy suffices. | §1, §5 endpoint row, P9 IAM audit, §12 "not `InvokeWebFunctionEndpoint`". |
| Pipeline steps incomplete | **Confirmed** (async endpoint updates, six documented waiters, Active ≠ healthy). | APP-4 rewritten with waits, version checks, Postman after promotion, dual-run order and failure handling. |
| Canary too small | **Agreed** (~18 requests). | D9: smoke gate + post-promotion Postman + version-tagged 10-minute watch. |
| Debounced invalidation won't fire on the Event Function | **Confirmed** (pending callbacks only resume if the environment is reused). | APP-5 awaits with a 2 s timeout. |
| `isLambdaEnvironment()` and `Connection: close` | **Confirmed**: only four reserved variables are documented for Web Functions. | APP-3 runtime detection and keep-alive; V23. |
| IAM naming wrong | **Confirmed** (`lambda:` prefix; `lambda-web` is the CLI namespace; `.local` log group with Region wildcard). | §12 list, INF-2 role. |
| Current role broader than needed | **Confirmed** (`s3:PutObject` on the whole frontend bucket). | INF-0 in P1. |
| Metadata line references | **Confirmed** (101, 471, 473, 475). | APP-1. |
| Free tier, alarms, smoke idle cost | **Confirmed**. | V12, §11. |
| CLI 2.34.16 has no `lambda-web` | **Confirmed**; the changelog shows 2.37.8 added it, 2.37.10 removed it, 2.37.13 restored it. | V16 ✅, pin ≥ 2.37.13. |

**Added in revision 2 beyond the review:**
- The distribution's DefaultTTL of 3600 caches responses without `Cache-Control` today. Measured that APP-1's `no-store` default doesn't move material traffic to the origin (§4.5), and made getLinked an explicit public read.
- A disallowed CORS origin returned a 500, which CloudFront would cache; APP-1 fixes it.
- P0 now says which prerequisite gates which phase (the security package gates P4, not P1).
