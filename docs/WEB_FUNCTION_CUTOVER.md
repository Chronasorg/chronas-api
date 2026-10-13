# Cutover: api.chronas.org → CloudFront → Lambda Web Function

Runbook for the production switch decided on 2026-10-13: Lambda Web Functions with CloudFront in front, done directly in production (a few minutes of disruption is acceptable). Background and decisions: [API_CLOUDFRONT_WEB_FUNCTIONS_PLAN.md](API_CLOUDFRONT_WEB_FUNCTIONS_PLAN.md). Scripts: [infra/api-edge/](../infra/api-edge/README.md).

All commands run from the repo root with the `chronas-prod` profile. `AWS_WEB_CLI` must point at an AWS CLI ≥ 2.37.13, because older versions have no `lambda-web`.

## Already in place (prepared, serving no live traffic)

| Resource | Value |
| --- | --- |
| Web Function | `chronas-api` (eu-west-1, `nodejs24.x`, arm64), entry `index.js` → `web-server.js` |
| Endpoint | `prod`, `IamAuth`, routing `Disabled` (moved only by deploys), `maxEnvironments` 3, `rateLimit` 100. Domain `qsysmsjd39s9mwkf.1p2.lambda-web.eu-west-1.on.aws`. Unsigned direct calls get 403 |
| Resource policy | `lambda:InvokeWebFunctionEndpoint` for `cloudfront.amazonaws.com`, only from distribution `E1KTIK2H0W8J2Q` (plus the test distribution until it is deleted) |
| Execution role | `chronas-api-web-function-role`: the `chronas-*` tables, the statistics object, `/chronas/secrets`, its own two log groups |
| Artifacts | `s3://chronas-lambda-web-artifacts/web/chronas-api-<commit>.zip`: versioned, private, TLS only, readable only by this function's revisions, no expiry |
| Logs | `/aws/lambda/web/chronas-api` and `.local`, 3 days, WARN and above |
| OAC | `chronas-api-web-oac` (`E7INWQN9BB4TP`): `lambda`, `sigv4`, `always-amz-auth` |
| Cache policies | `ChronasApiDynamicV3` (`113a9e01-…`), `ChronasApiPublicV3` (`0862a230-…`) |
| Test distribution | `E1P2H0V435VLMH` (`d2yc2w5g1vrary.cloudfront.net`): the target config with every path on the Web Function |
| Pipeline | Branch `feat/web-function-cutover`: `deploy-prod.yml` deploys to the Web Function; merged only after the switch |

## The switch (needs the go)

| # | Step | Command | Check |
| --- | --- | --- | --- |
| 1 | Live distribution → Web Function. chronas.org uses this distribution directly, so the new frontend moves here. | `infra/api-edge/apply-cloudfront.sh --web-origin qsysmsjd39s9mwkf.1p2.lambda-web.eu-west-1.on.aws --oac E7INWQN9BB4TP --assign default=WebFunctionOrigin,areas=WebFunctionOrigin,metadata=WebFunctionOrigin,markers=WebFunctionOrigin --apply --confirm "apply E1KTIK2H0W8J2Q"` | The script waits for `Deployed` and invalidates. Then `verify.mjs --base https://d24mkpax7rmotx.cloudfront.net` and the workflow's `smoke` action against the same URL. |
| 2 | `api.chronas.org` → CloudFront. The legacy site and third parties move here. | `infra/api-edge/route53.sh cutover --apply --confirm "point api.chronas.org at CloudFront"` | The script waits for `INSYNC`. Then `dig api.chronas.org`, `verify.mjs --base https://api.chronas.org`, and `smoke` against `https://api.chronas.org`. |
| 3 | Pipeline → Web Function | Merge `feat/web-function-cutover` | The deploy run passes: revision Active, `/v1/version` shows the new commit, Postman green. |
| 4 | Clean up | `test-distribution.sh delete`, `web-function.sh revoke-distribution E1P2H0V435VLMH` | Resource policy lists only `E1KTIK2H0W8J2Q`. |

Expected disruption: none, or seconds. During step 1, edge locations switch origin one by one, and both origins serve the same data. Step 2 changes an alias with TTL 60.

## Rollback

| Situation | Command | Time |
| --- | --- | --- |
| Web Function misbehaves after step 1 | `infra/api-edge/restore-cloudfront.sh infra/backups/api-edge/<…>-before-apply/distribution-config.json --apply --confirm "restore E1KTIK2H0W8J2Q"` | about 5 min |
| Problems after step 2 | `infra/api-edge/route53.sh rollback --apply --confirm "point api.chronas.org at API Gateway"`, then restore CloudFront if needed | 1–2 min (TTL 60) |
| A bad deploy after step 3 | Automatic: the pipeline moves the endpoint back to the previous revision. By hand: `infra/api-edge/web-function.sh rollback <revision-id> --apply --confirm "roll back chronas-api"` | about 1 min |

API Gateway, its custom domain and the Event Function stay in place and current (the pipeline still updates the Event Function), so every rollback lands on the same build.

## Afterwards (not part of the switch)

- After a few quiet days, block the API Gateway path, then retire it with the Event Function. Plan P9.
- Remove `JWT_SECRET` from the Event Function environment.
