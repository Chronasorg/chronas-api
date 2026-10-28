# infra/api-edge: CloudFront and Route 53 for api.chronas.org

Scripts for the edge and the Web Function ([docs/API_CLOUDFRONT_WEB_FUNCTIONS_PLAN.md](../../docs/API_CLOUDFRONT_WEB_FUNCTIONS_PLAN.md)). Run them locally with the `chronas-prod` profile, or from the [`API edge` workflow](../../.github/workflows/api-edge-prod.yml).

**Rules.** Every script:
- checks that the credentials belong to account `937826731833`;
- is a dry run unless called with `--apply --confirm "<phrase>"`, where the phrase is the one its dry run prints;
- snapshots state into the gitignored `infra/backups/api-edge/`, which the workflow also copies to `s3://chronas-lambda-deployments/infra-backups/api-edge/<run-id>/`;
- never prints tokens or Lambda environment values.

| Script | Phase | What it does |
| --- | --- | --- |
| `edge-config.mjs` | all | Renders and validates the §6 distribution config from the live one. Pure functions, tested in `server/tests/unit/api-edge-config.test.js` against `fixtures/live-distribution-config-2026-10-13.json`. |
| `snapshot.sh` | all | Distribution config and ETag, its cache policies, the distribution status and the DNS record. |
| `policies.sh` | P3 | Creates the cache policies named in `edge-config.mjs` `POLICY_SPECS` (`ChronasApiDynamicV3`, `ChronasApiPublicV4`), or checks them against the spec. Never modifies an existing policy, so a changed spec gets a new name; `ChronasApiPublicV3` stays as it is. |
| `test-distribution.sh` | P3 | Creates, finds (`status`, `domain`) and deletes the throwaway distribution: the §6 config with no alias and the default certificate. Refuses to delete anything else. |
| `verify.mjs` | P3–P8 | Gate checks against any base URL, JSON summary, exit code 1 on failure. Authenticated checks need `SMOKE_PASSWORD`. |
| `apply-cloudfront.sh` | P4, P8 | Renders the target from the live config (`--assign`, `--temporary`, `--web-origin`/`--oac`), refuses on drift, shows the diff, applies with the ETag, waits for `Deployed`, invalidates and waits. Also accepts a live config that is valid with the previous public policy (`PREVIOUS_POLICY_SPECS`). Always pass `--assign default=WebFunctionOrigin,areas=WebFunctionOrigin,metadata=WebFunctionOrigin,markers=WebFunctionOrigin --drop-api-gateway`: unassigned behaviors default to the retired `ApiGatewayOrigin`. |
| `restore-cloudfront.sh` | rollback | Puts a snapshot's distribution config back. |
| `route53.sh` | P5 | `status` of the `api.chronas.org` alias (CloudFront since 2026-10-13). |
| `web-function.sh` | P7–P8 | Web Function: `status`, `provision`, `deploy`, `rollback` (only moves the endpoint; it doesn't invalidate), `scale <maxEnvironments>`, `role-policy` (diff, snapshot and replace the inline role policy with `web-function-role-policy.json`), distribution access. Used by `deploy-prod.yml`. |
| `jwt-secret-ssm.sh` | — | `copy`: puts the `JWT_SECRET` field of `/chronas/secrets` into the SSM SecureString `/chronas/jwt-secret` and never overwrites another value; `verify`: compares both by SHA-256 and prints only `match`/`mismatch`. The value never reaches the terminal, a snapshot or a command line ([../README.md](../README.md#jwt-secret)). |
| `web-function-alarms.sh` | — | The four Web Function alarms. |

## ChronasApiPublicV4 (7-day edge lifetime)

`ChronasApiPublicV4` is `ChronasApiPublicV3` with a MaxTTL of 7 days instead of 1. It is only safe while the API invalidates its own copies after writes, so the order is:

1. IAM: statement `InvalidateApiEdge` on `chronas-api-web-function-role` (`web-function.sh role-policy`). Live since 2026-10-28.
2. Deploy the API with `CLOUDFRONT_DISTRIBUTION_ID` in the revision.
3. Check that its invalidations work: `aws cloudfront list-invalidations --profile chronas-prod --distribution-id E1KTIK2H0W8J2Q` lists `chronas-api-…` invalidations about 15 s to 2 minutes after the deploy's Postman writes, and the log group has no `edgeInvalidationFailed` line.
4. `./policies.sh --apply --confirm "create cache policies"` (the dry run says `ChronasApiPublicV4 is missing` until then).
5. `./apply-cloudfront.sh --assign default=WebFunctionOrigin,areas=WebFunctionOrigin,metadata=WebFunctionOrigin,markers=WebFunctionOrigin --drop-api-gateway`: the dry-run diff is the `CachePolicyId` of the three public behaviors, nothing else. Then the same with `--apply --confirm "apply E1KTIK2H0W8J2Q"`.

Rollback: `./restore-cloudfront.sh <before-apply snapshot> --apply --confirm "restore E1KTIK2H0W8J2Q"` (V3 is never deleted). Restore V3 before rolling the code back past edge invalidation.

## Status

The cutover is done (2026-10-13); see [docs/WEB_FUNCTION_CUTOVER.md](../../docs/WEB_FUNCTION_CUTOVER.md). API Gateway is retired, so there is no DNS rollback target any more.
