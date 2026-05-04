# Chronas API Infrastructure

**This directory is the source of truth for the chronas-api AWS infrastructure.**
No CDK, no CloudFormation `cdk deploy` — every resource is either created by
the GitHub Actions pipeline (`code`) or by the idempotent bash script at
[`apply-lambda-config.sh`](apply-lambda-config.sh) (`configuration`).

The `chronas-cdk` sibling repo is **legacy and must not be deployed**. The CDK
stacks still exist in CloudFormation but their templates have drifted from
reality. Keep them for CloudFormation-output lookups only (the deploy workflow
reads `LambdaFunctionName` from stack outputs).

## Current production state

| Resource | Setting |
| --- | --- |
| Lambda function | `ChronasApiLambdaStackV2-ChronasApiLambdaFunction7C-UhX6kGn4FXqM` |
| Region | `eu-west-1` |
| Account | `937826731833` |
| Runtime | `nodejs22.x` |
| **Architecture** | **`arm64`** (switched 2026-05-04 for ~20% Lambda cost reduction + faster cold starts) |
| Memory | 512 MB |
| Timeout | 30 s |
| **VPC** | **None** (detached; DynamoDB/Secrets Manager/S3 reach over public internet) |
| Handler | `lambda-handler.handler` |
| Package size | ~35 MB (down from 62.5 MB after Mongoose/DocumentDB removal) |
| Execution role | `ChronasApiLambdaStackV2-ChronasApiLambdaFunctionSer-qZwYlfEnXSFI` |

### Data layer

All persistent state lives in **DynamoDB** (PAY_PER_REQUEST, PITR enabled,
deletion protection on). Pre-computed stats JSON is in S3.

| Table | Purpose |
| --- | --- |
| `chronas-markers` | Markers (GSI-TypeYear, GSI-PartOf) |
| `chronas-areas` | Province/area snapshots per year |
| `chronas-metadata` | Entity metadata (provinces, ruler, religion, culture) — large items gzip-compressed |
| `chronas-users` | User accounts (PK = lowercased email) |
| `chronas-flags` | Crowdsourced correction flags |
| `chronas-revisions` | Edit history (GSI-EntityTimestamp) |
| `chronas-links` | Normalized per-entity links |
| `chronas-board` | Forum posts/discussions/opinions |
| `chronas-collections` | (unused — `/v1/collections` retired, returns 410) |
| `chronas-games` | (unused — `/v1/game` retired, returns 410) |

S3 bucket `chronas-frontend-new` hosts both the frontend (`chronas.org`) and
the pre-computed statistics JSON at `api/statistics.json`.

### IAM role policies

**Managed policies attached:**
- `AWSLambdaBasicExecutionRole` — CloudWatch Logs.

**Inline policies:** see [`iam-inline-policy.json`](iam-inline-policy.json) for
the app-level policy (SQS DLQ + Secrets Manager for `/chronas/secrets`). The
`ChronasDynamoDBAccess` inline policy is managed separately and covers
DynamoDB + the S3 statistics bucket.

### Environment variables

See [`backups/env-vars-after.json`](backups/env-vars-after.json) for the full
set. Notable:

- `SECRET_CONFIG_NAME=/chronas/secrets` — JWT + OAuth secrets
- `USE_DYNAMODB_*=true` for all in-scope models (areas, markers, metadata,
  users, flags, revisions, board)
- `STATISTICS_S3_BUCKET=chronas-frontend-new`, `STATISTICS_S3_KEY=api/statistics.json`
- `ALLOWED_ORIGINS` — CORS allowlist (chronas.org subdomains are also
  accepted by regex in [config/express.js](../config/express.js))

Removed on 2026-05-04 (no longer needed): `VPC_ID`, `SECRET_DB_NAME`,
`SECRET_MODERNIZED_DB_NAME`, `DOCDB_TLS_ENABLED`.

### Edge / API layer

| Layer | Value |
| --- | --- |
| Domain | `api.chronas.org` → CloudFront → API Gateway HTTP API |
| CloudFront distribution | `E1KTIK2H0W8J2Q` (`d24mkpax7rmotx.cloudfront.net`) |
| API Gateway | `ChronasApiGateway` (HTTP API) |
| Cache policy | Respects origin `Cache-Control`; invalidated on every deploy |
| DLQ | SQS: `ChronasApiLambdaStackV2-ChronasApiLambdaFunctionDeadLetterQueueE0BB-kQ5FG2we8vvn` |

### Deployment

GitHub Actions — [`.github/workflows/deploy-prod.yml`](../.github/workflows/deploy-prod.yml).
Triggered on `push` to `master`. Steps:

1. `npm ci && npm test` (dynalite-backed mocha)
2. `npm ci --omit=dev` + `zip` the package
3. Upload to S3 (`chronas-lambda-deployments/deploys/`)
4. `aws lambda update-function-code --s3-bucket ... --s3-key ...`
5. `aws cloudfront create-invalidation --paths /v1/*`
6. Warm-up curls
7. Newman post-deploy smoke tests (auto-rollback to previous S3 zip on failure)
8. `npm version patch` + push

**No CDK involved in deploys.** The only CDK touchpoint is step 4 which reads
the Lambda function name from a CloudFormation stack output. That remains
stable even if CDK is never run again.

## Making infra changes

**Always use the CLI**, not CDK. Two options:

1. Edit [`apply-lambda-config.sh`](apply-lambda-config.sh) and re-run it
   (it's idempotent).
2. One-off fix? Run the exact `aws` command, then snapshot the result into
   `backups/lambda-config-after-*.json` and update this README.

⚠️ **`infra/backups/` is gitignored and contains secrets.** Lambda
`get-function-configuration` output includes `FACEBOOK_CLIENT_SECRET`,
`GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET` etc. in
cleartext. Keep the snapshots local-only for your own rollback; never
commit them. `apply-lambda-config.sh` refuses to run if the directory is
not gitignored.

Before any change:

```bash
FN=ChronasApiLambdaStackV2-ChronasApiLambdaFunction7C-UhX6kGn4FXqM
ROLE=ChronasApiLambdaStackV2-ChronasApiLambdaFunctionSer-qZwYlfEnXSFI

# Snapshot current state for rollback (stays LOCAL, not committed)
aws lambda get-function-configuration --function-name "$FN" \
  --region eu-west-1 --profile chronas-prod \
  > infra/backups/lambda-config-before-$(date +%Y%m%d-%H%M%S).json

aws iam get-role-policy --role-name "$ROLE" \
  --policy-name ChronasApiLambdaFunctionServiceRoleDefaultPolicy8E461284 \
  --profile chronas-prod \
  > infra/backups/iam-inline-policy-before-$(date +%Y%m%d-%H%M%S).json
```

After any change, run the Postman smoke against prod:

```bash
npm run test:postman:prod
```

## Rollback

Every change is reversible from the snapshots in [`backups/`](backups/):

- **Revert env vars:** `aws lambda update-function-configuration --function-name "$FN" --environment 'file://backups/<before>.json'` (pass the `Environment` field only).
- **Revert inline IAM:** `aws iam put-role-policy --role-name "$ROLE" --policy-name ChronasApiLambdaFunctionServiceRoleDefaultPolicy8E461284 --policy-document 'file://backups/iam-inline-policy-before-*.json'`.
- **Revert ARM64 → x86_64:** `aws lambda update-function-code --function-name "$FN" --s3-bucket chronas-lambda-deployments --s3-key deploys/<last-x86-zip> --architectures x86_64`.
- **Re-attach VPC policy:** `aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole`.

## Safety rules

- **Never run `cdk destroy`** against any stack — the Lambda, its IAM role, and
  the CloudFormation outputs the deploy workflow depends on would disappear.
- **Never run `cdk deploy`** — templates have drifted and would re-introduce
  VPC attachment, Mongoose secrets, and x86_64 architecture.
- **Do not delete** the `ChronasApiLambdaStackV2` CloudFormation stack for the
  same reason — the deploy workflow reads `LambdaFunctionName` from its
  outputs.

## Cost

~$5–8/month as of 2026-05-04:

- DynamoDB: ~$3 (pay-per-request, dominated by the forum scan — cached 1 h)
- CloudFront: $0 (within free tier)
- API Gateway: ~$1
- Lambda: ~$1 (ARM64)
- Secrets Manager, CloudWatch Logs: ~$1

No NAT Gateway cost — Lambda is not in a VPC.
