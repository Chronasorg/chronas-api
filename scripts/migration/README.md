# Migration scripts (DocumentDB → DynamoDB)

These scripts are executed **locally from a developer terminal** using the
`chronas-dev` AWS profile. They are not GitHub Actions workflows — see the
migration plan's Hard Requirement #3 for why (GitHub Actions is reserved
for recurring code deploys and Postman verification; one-time imperative
actions live here).

## Conventions

- Every script starts by running `aws sts get-caller-identity` and asserting
  that the returned account matches the `chronas-dev` account. Mismatch
  → hard fail.
- Every mutating script accepts `--dry-run` and prints the actions it *would*
  take without executing them.
- Every script pipes full stdout/stderr to `scripts/migration/logs/<ts>-<name>.log`
  (gitignored). Retain the logs for the duration of the migration.
- Idempotent where possible: re-running the same script should be safe.
- Shell scripts use `set -euo pipefail`; Node scripts use top-level `await`
  and exit non-zero on any uncaught error.

## Scripts

| Script | Phase | Re-runnable | Purpose |
|---|---|---|---|
| `00-create-dynamodb-tables.sh` | 0 | yes | Create 10 DynamoDB tables + GSIs via AWS CLI |
| `01-create-provinces-s3.sh` | 0 | yes | Create S3 bucket + upload `provinces.geojson.gz` for FE-WIN #1 |
| `10-migrate-collection.js` | 1–7 | yes | Per-collection data copy (Mongoose → DynamoDB BatchWriteItem) |
| `11-verify-migration.js` | 1–7 | yes | Item counts + random-sample field diff vs source |
| `20-flip-lambda-env.sh` | 1–7 | yes | Flip `USE_DYNAMODB_*` env vars on the live Lambda (forward-only) |
| `90-remove-lambda-vpc.sh` | 8 | no | Remove Lambda from VPC — one-time |
| `91-delete-vpc-endpoint.sh` | 8 | no | Delete `vpce-0140ad3b3259ace64` — one-time |
| `99-delete-documentdb.sh` | 8 | no | Terminal: flip deletion protection, final snapshot, delete cluster |

## Running

```bash
export AWS_PROFILE=chronas-dev
aws sts get-caller-identity   # sanity check
./scripts/migration/00-create-dynamodb-tables.sh --dry-run
./scripts/migration/00-create-dynamodb-tables.sh
```
