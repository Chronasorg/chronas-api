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
                                       DynamoDB · S3 (statistics) · SSM Parameter Store
```

| Resource | Setting |
| --- | --- |
| Web Function | `chronas-api`, `nodejs24.x`, arm64, entry `index.js` → `web-server.js`; 2 vCPU / 2 GB per environment |
| Endpoint | `prod`: `HomeRegion`, `IamAuth` (only CloudFront `E1KTIK2H0W8J2Q` may call it; unsigned calls get 403), routing `Disabled` (moved by deploys), `maxEnvironments` 10 since 2026-10-28 (2, the smallest value allowed, before), `rateLimit` 100 req/s |
| Revision settings | timeout 25 s, 64 concurrent requests per environment, `NODE_OPTIONS=--max-old-space-size=384 --max-semi-space-size=4` (a lower cap saves no memory, measured 2026-10-28), environment variables without secrets, including `CLOUDFRONT_DISTRIBUTION_ID` for the API's own invalidations ([`api-edge/web-function.sh`](api-edge/web-function.sh) `revision_json`) |
| Execution role | `chronas-api-web-function-role`: inline policy `chronas-api-web-access` = [`api-edge/web-function-role-policy.json`](api-edge/web-function-role-policy.json), applied as a whole with `web-function.sh role-policy` (tables, the statistics object, the JWT secret in Secrets Manager and SSM, logs, and `cloudfront:CreateInvalidation` on `E1KTIK2H0W8J2Q`, since 2026-10-28) |
| Code artifacts | `s3://chronas-lambda-web-artifacts/web/chronas-api-<commit>.zip`: versioned, private, TLS only, readable only by the function's revisions. **Never delete an object version a revision uses**, because that revision would fail permanently |
| CloudFront | `E1KTIK2H0W8J2Q`: `/v1/areas/*`, `/v1/metadata*`, `/v1/markers*` on `ChronasApiPublicV3` (cached only when the origin says `public`, at most 1 day; `ChronasApiPublicV4`, at most 7 days, replaces it once the API's invalidations are verified, see [api-edge/README.md](api-edge/README.md)), default on `ChronasApiDynamicV3`; both key on `Authorization` and the public one also on `Origin`; origin request policy AllViewerExceptHostHeader; 500/502/503/504 not cached |
| DNS | `api.chronas.org` A → alias of `d24mkpax7rmotx.cloudfront.net` (zone `Z005461139KF8GDMY491N`) |
| Secrets | SSM Parameter Store SecureString `/chronas/jwt-secret` (Standard tier, AWS managed key `aws/ssm`, no charge) since 2026-10-28: the revision's `JWT_SECRET_PARAMETER` names it, and the app loads `JWT_SECRET` from it at startup ([config/bootstrap.js](../config/bootstrap.js)) with no fallback. Secrets Manager `/chronas/secrets` (same value) is scheduled for deletion; see [JWT secret](#jwt-secret) |
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

### Edge invalidation after writes

The API invalidates its own CloudFront copies after writes ([server/helpers/edge-invalidation.js](../server/helpers/edge-invalidation.js)): the environment that handled a write sends one invalidation about 15 s after its first write, then at most every 2 minutes while writes continue, and CloudFront needs another 10–100 s. Votes never cause one of their own. Another environment can still serve a year or metadata list it cached before the write until that copy expires (at most 1 h), and browsers keep theirs up to max-age (area years 1 day). Scripts that write through the models invalidate themselves ([scripts/data-validation/edge-invalidation-cli.js](../scripts/data-validation/edge-invalidation-cli.js)).

Invalidate by hand after an edit in the DynamoDB console, after a failed invalidation (`edgeInvalidationFailed` in the logs), when a change doesn't show within a few minutes, and after a manual `web-function.sh rollback` (it only moves the endpoint; the pipeline's automatic rollback is followed by the deploy's own `/v1/*` invalidation):

```bash
aws cloudfront create-invalidation --profile chronas-prod --distribution-id E1KTIK2H0W8J2Q --paths "/v1/areas/*" "/v1/markers*" "/v1/metadata*"
```

Before rolling the code back past edge invalidation while `ChronasApiPublicV4` is assigned, restore V3 first with `restore-cloudfront.sh`: older code doesn't invalidate after writes.

## Changing infrastructure

Everything goes through [`api-edge/`](api-edge/README.md), never the console. Every script checks the account, is a dry run unless called with `--apply --confirm "<phrase>"`, and snapshots into the gitignored `backups/` (`EDGE_BACKUP_DIR` overrides the directory, for tests; it must be gitignored inside a work tree, and the `API edge` workflow uploads only `backups/`).

- Web Function: `api-edge/web-function.sh` (`status`, `deploy`, `rollback <revision>` (moves only the endpoint, no invalidation), `scale <maxEnvironments>`, `role-policy`, distribution access). It needs AWS CLI ≥ 2.37.13 for `aws lambda-web`; set `AWS_WEB_CLI` if your `aws` is older. Deploys keep the endpoint's `maxEnvironments`; `rateLimit` has no script: `aws lambda-web update-web-function-endpoint`.
- Role policy: `api-edge/web-function.sh role-policy` diffs the live inline policy against [`api-edge/web-function-role-policy.json`](api-edge/web-function-role-policy.json); with `--apply --confirm "update chronas-api role policy"` it snapshots and replaces the whole policy with the file, so every statement must be in the file first.
- JWT secret: `api-edge/jwt-secret-ssm.sh copy` and `verify`; see [JWT secret](#jwt-secret).
- CloudFront: `api-edge/apply-cloudfront.sh` (render, validate, diff, apply with the ETag), and `restore-cloudfront.sh <snapshot>` to undo.
- Checks against any base URL: `api-edge/verify.mjs`, or the `API edge` workflow's `smoke` action (adds the full Postman suite).

## JWT secret

`/chronas/jwt-secret` is an SSM Parameter Store SecureString (Standard tier, AWS managed key `aws/ssm`) that holds only the HS256 signing secret. Tokens carry no expiry, so any change of the value logs every user of chronas.org and old.chronas.org out, and the deploy's Postman run doesn't notice (it logs in fresh).

- `api-edge/jwt-secret-ssm.sh copy` creates it from the `JWT_SECRET` field of Secrets Manager `/chronas/secrets`: a dry run first, then `--apply --confirm "copy jwt secret to ssm"`. It never overwrites another value. It stops before PutParameter, dry run included, for a value Parameter Store rejects: more than 4096 bytes, or containing `{{` and `}}`. If that happens, don't switch: keep reading Secrets Manager, because a new value would log every user out. If PutParameter itself fails, only its error code is shown, since a message could quote the value.
- `api-edge/jwt-secret-ssm.sh verify` compares the two values by SHA-256 and prints only `match` (exit 0) or `mismatch` (exit 1). Run it right before the push that switches the revision, and again before retiring Secrets Manager.
- The value only passes through 0600 files in a private temporary directory, never the terminal, a snapshot or a command line. The script refuses to run while AWS CLI history (`cli_history`) is enabled.

### Rotating the JWT secret

Rotating logs every user out, so do it only on purpose. Until Secrets Manager is retired, revisions from before the switch keep the old value: rolling back to one of them would log everyone out again. So rotate after the retirement, unless you must rotate sooner (for example after a leak).

1. `aws configure get cli_history --profile chronas-prod` must not print `enabled`. Otherwise the CLI stores the request, value included, in `~/.aws/cli/history`.
2. Generate the value and the request in a private directory, never on a command line. Never use `put-parameter --value`: the value would show up in the process list and the shell history. Don't put `Tags` in the request: PutParameter rejects Tags together with Overwrite. The `app=chronas` tag from the copy stays; `aws ssm add-tags-to-resource` changes tags.
   ```bash
   (
     umask 077; d="$(mktemp -d)"; trap 'rm -rf "$d"' EXIT
     openssl rand -base64 48 | tr -d '\n' > "$d/value"   # 64 characters, no braces
     jq -n --rawfile value "$d/value" '{Name: "/chronas/jwt-secret",
       Description: "chronas-api JWT signing secret (JWT_SECRET_PARAMETER)",
       Value: $value, Type: "SecureString", KeyId: "alias/aws/ssm", Tier: "Standard", Overwrite: true}' > "$d/put.json"
     aws ssm put-parameter --profile chronas-prod --region eu-west-1 \
       --cli-input-json "file://$d/put.json" --query Version --output text
   )
   ```
3. Each environment reads the parameter once, when it starts. Until all of them are replaced, some accept only the old tokens and some only the new ones. Deploy right away: any push to `master`, for example the commit that records the rotation. The new revision starts every environment with the new value.
4. Check the metadata (no value): `aws ssm describe-parameters --profile chronas-prod --region eu-west-1 --parameter-filters Key=Name,Option=Equals,Values=/chronas/jwt-secret --query 'Parameters[0].[Type,KeyId,Tier,Version]' --output text` prints `SecureString alias/aws/ssm Standard <new version>`. While `/chronas/secrets` still exists, `jwt-secret-ssm.sh verify` now prints `mismatch`; that is expected.

### Retiring Secrets Manager

Start only when the switch has been live for at least a day and at least one more deploy has succeeded after it, so that the automatic rollback target reads Parameter Store too. A secret scheduled for deletion is not billed.

1. `api-edge/jwt-secret-ssm.sh verify` prints `match`. This is the last time it can run.
2. The app only ever read the `JWT_SECRET` field. The other fields of `/chronas/secrets` (Mailgun, the retired social logins, PayPal, Cloudinary, Application Insights) are unused since 2026-10-13; make sure nothing else needs them.
3. Keep the `JwtSecret` statement in [`api-edge/web-function-role-policy.json`](api-edge/web-function-role-policy.json) until the deletion date: a secret scheduled for deletion can't be read anyway, and an emergency restore then needs no IAM change. Remove it (and apply with `web-function.sh role-policy`) once the secret is gone.
4. Schedule the deletion with the longest recovery window; never use `--force-delete-without-recovery`:
   `aws secretsmanager delete-secret --profile chronas-prod --region eu-west-1 --secret-id arn:aws:secretsmanager:eu-west-1:937826731833:secret:/chronas/secrets-YDUZQG --recovery-window-in-days 30`
   `aws secretsmanager describe-secret --profile chronas-prod --region eu-west-1 --secret-id <the same ARN> --query DeletedDate` then shows the date; the secret is deleted 30 days later.
5. Until that date, before any rollback to a revision from before the switch (one that sets `SECRET_CONFIG_NAME`):
   - run `aws secretsmanager restore-secret --profile chronas-prod --region eu-west-1 --secret-id <the same ARN>`;
   - only then roll back.
   A secret scheduled for deletion can't be read, so without the restore that revision answers every request with 503.
6. Don't delete the CloudFormation stack `SecretStack`, now or later. `AmplifyStack` and `BuildChronasAPi` import its export `SecretStack:ExportsOutputRefchronasgithubtokenDC32AE6AEC7E85B4`, so the delete would fail. CloudFormation also deletes the stack's secrets with `ForceDeleteWithoutRecovery`, which skips the recovery window. Leave `SecretStack`, `AmplifyStack` and the CodeBuild stack as they are.
7. After the deletion date, remove:
   - the Secrets Manager branch of `config/bootstrap.js` (`readSecretDocument`, `SECRET_KEYS`, `SECRET_CONFIG_NAME`) with its tests;
   - `@aws-sdk/client-secrets-manager`;
   - `SECRET_ARN` in `api-edge/constants.sh`;
   - `api-edge/jwt-secret-ssm.sh` with its test and `server/tests/helpers/aws-cli-stub.js`, since both of its actions read the deleted secret.
   Then update these docs. The `aws/ssm` key needs nothing: AWS managed keys have no monthly fee and can't be deleted.

## Cost

September 2026: $5.56 (DynamoDB $2.04, Route 53 $0.74, Secrets Manager $0.42, CloudWatch $0.31, S3 $0.22, tax $0.89). API Gateway (≈ $0.85) is gone. No NAT Gateway, no WAF.

The Web Function, measured in Cost Explorer for 2026-10-14: $0.332/day gross, about $10.1/month before tax (≈ $12 with tax): memory 81%, vCPU 15%, requests 4%. Account credits offset it for now (net $0 while they last). Memory is billed as consumed for each environment's whole lifetime, idle time included: 0.405 GB per environment-second on average, and about 7,200 environment-seconds per hour (2.0 environments) since `maxEnvironments` went to 2. Billed GB-seconds were within about 3% of the time-weighted `EnvironmentMaxMemoryUsage`; whether billing uses peak or current memory is not documented.

Why two environments run almost all the time, and what can lower it:
- The docs have no minimum or reserved-environment setting and say an endpoint scales to zero without traffic, but Lambda keeps spare environments ("headroom") ahead of demand, up to `maxEnvironments` ([scaling](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-scaling.html)). Origin traffic is continuous in about 84% of minutes, so the endpoint sits at 2.
- Measured: it scaled to zero after about 5–6 idle minutes at least 6 times between 2026-10-13 and 10-15 (no idle period is documented), and Lambda replaced environments without any idle gap too (about 22 fresh starts in 35 h). A fresh environment uses about 150 MB and grows to about 430 MB over hours.
- `maxEnvironments` can't go below 2. The levers are memory per environment (`NODE_OPTIONS`, cache sizes), fewer origin requests (edge cache hit ratio), and longer idle gaps, which a site with visitors around the clock rarely has.
- A higher cap raises the always-on count: at `maxEnvironments` 3 (2026-10-13 until 19:36 UTC) the endpoint ran 2.5–3.0 environments on average, at about $3.50/month each. It went to 10 at 08:31 UTC on 2026-10-28 as a 24-hour test, because at 2 capacity 429s came almost daily; compare `EndpointActiveEnvironments` and the memory GB-seconds in Cost Explorer before keeping it.
