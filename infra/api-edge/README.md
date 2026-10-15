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
| `policies.sh` | P3 | Creates `ChronasApiDynamicV3` and `ChronasApiPublicV3`, or checks them against the spec. Never modifies an existing policy. |
| `test-distribution.sh` | P3 | Creates, finds (`status`, `domain`) and deletes the throwaway distribution: the §6 config with no alias and the default certificate. Refuses to delete anything else. |
| `verify.mjs` | P3–P8 | Gate checks against any base URL, JSON summary, exit code 1 on failure. Authenticated checks need `SMOKE_PASSWORD`. |
| `apply-cloudfront.sh` | P4, P8 | Renders the target from the live config (`--assign`, `--temporary`, `--web-origin`/`--oac`), refuses on drift, shows the diff, applies with the ETag, waits for `Deployed`, invalidates and waits. |
| `restore-cloudfront.sh` | rollback | Puts a snapshot's distribution config back. |
| `route53.sh` | P5 | `status` of the `api.chronas.org` alias (CloudFront since 2026-10-13). |
| `web-function.sh` | P7–P8 | Web Function: `status`, `provision`, `deploy`, `rollback`, distribution access. Used by `deploy-prod.yml`. |
| `web-function-alarms.sh` | — | The four Web Function alarms. |

## Status

The cutover is done (2026-10-13); see [docs/WEB_FUNCTION_CUTOVER.md](../../docs/WEB_FUNCTION_CUTOVER.md). API Gateway is retired, so there is no DNS rollback target any more.
