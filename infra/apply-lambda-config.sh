#!/usr/bin/env bash
# Apply the expected Lambda configuration to the chronas-api production function.
#
# Idempotent — safe to re-run. Reconciles: architecture, env vars, VPC
# attachment, IAM role policies. Does NOT upload new code (GitHub Actions
# does that on every push to master).
#
# Usage:
#   ./infra/apply-lambda-config.sh           # dry-run (prints what would change)
#   ./infra/apply-lambda-config.sh --apply   # actually apply
#
# Requires AWS credentials with IAM + Lambda write access. Snapshots current
# state into infra/backups/ before making any change.

set -euo pipefail

# Hardcoded — this script always operates on the chronas-prod Lambda in
# eu-west-1. Refuse to pick up whatever AWS_* env vars the operator happens
# to have set (which could point at a different account).
REGION="eu-west-1"
PROFILE="chronas-prod"
FN="ChronasApiLambdaStackV2-ChronasApiLambdaFunction7C-UhX6kGn4FXqM"
ROLE="ChronasApiLambdaStackV2-ChronasApiLambdaFunctionSer-qZwYlfEnXSFI"
INLINE_POLICY_NAME="ChronasApiLambdaFunctionServiceRoleDefaultPolicy8E461284"
S3_BUCKET="chronas-lambda-deployments"
EXPECTED_ARCH="arm64"

APPLY="no"
if [[ "${1:-}" == "--apply" ]]; then
  APPLY="yes"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/backups"
TS="$(date +%Y%m%d-%H%M%S)"

AWS_COMMON=(--region "$REGION" --profile "$PROFILE")

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

run_or_print() {
  if [[ "$APPLY" == "yes" ]]; then
    "$@"
  else
    printf '  DRY-RUN:'
    printf ' %q' "$@"
    echo
  fi
}

log "Snapshotting current state to $BACKUP_DIR/"
mkdir -p "$BACKUP_DIR"

# Refuse to run if infra/backups is not gitignored. Lambda config JSON
# contains OAuth client secrets, JWT secret etc. and must never be pushed.
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if ! git -C "$REPO_ROOT" check-ignore -q "$BACKUP_DIR/sentinel-test.json" 2>/dev/null; then
  echo "ERROR: $BACKUP_DIR is not gitignored. Add 'infra/backups/' to .gitignore" >&2
  echo "before running this script — its output contains OAuth client secrets." >&2
  exit 1
fi
aws "${AWS_COMMON[@]}" lambda get-function-configuration --function-name "$FN" \
  > "$BACKUP_DIR/lambda-config-before-$TS.json"
aws --profile "$PROFILE" iam get-role-policy --role-name "$ROLE" \
  --policy-name "$INLINE_POLICY_NAME" \
  > "$BACKUP_DIR/iam-inline-policy-before-$TS.json" || true

# --- Architecture ------------------------------------------------------------
CURRENT_ARCH="$(aws "${AWS_COMMON[@]}" lambda get-function-configuration \
  --function-name "$FN" --query 'Architectures[0]' --output text)"
if [[ "$CURRENT_ARCH" != "$EXPECTED_ARCH" ]]; then
  log "Architecture is $CURRENT_ARCH — switching to $EXPECTED_ARCH"
  LATEST_ZIP="$(aws "${AWS_COMMON[@]}" s3 ls "s3://$S3_BUCKET/deploys/" \
    | sort | tail -1 | awk '{print $4}')"
  if [[ -z "$LATEST_ZIP" ]]; then
    echo "ERROR: no zip found under s3://$S3_BUCKET/deploys/" >&2
    exit 1
  fi
  log "Re-pointing Lambda to s3://$S3_BUCKET/deploys/$LATEST_ZIP with --architectures $EXPECTED_ARCH"
  run_or_print aws "${AWS_COMMON[@]}" lambda update-function-code \
    --function-name "$FN" --s3-bucket "$S3_BUCKET" \
    --s3-key "deploys/$LATEST_ZIP" --architectures "$EXPECTED_ARCH"
  run_or_print aws "${AWS_COMMON[@]}" lambda wait function-updated \
    --function-name "$FN"
else
  log "Architecture already $EXPECTED_ARCH — skip"
fi

# --- Environment variables ---------------------------------------------------
# Remove keys listed in env-vars-to-remove.txt from the live env. We fetch the
# current env, drop those keys, and write it back — never hardcoding secret
# values into the repo.
log "Reconciling environment variables (removing retired keys only)"
REMOVE_FILE="$SCRIPT_DIR/env-vars-to-remove.txt"
if [[ ! -f "$REMOVE_FILE" ]]; then
  echo "ERROR: missing $REMOVE_FILE" >&2
  exit 1
fi

TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"' EXIT
aws "${AWS_COMMON[@]}" lambda get-function-configuration --function-name "$FN" \
  --query 'Environment' --output json \
  | python3 -c "
import json, sys
env = json.load(sys.stdin) or {'Variables': {}}
variables = env.get('Variables', {}) or {}
remove = {line.strip() for line in open('$REMOVE_FILE') if line.strip() and not line.startswith('#')}
changed = [k for k in list(variables) if k in remove]
for k in changed:
    del variables[k]
json.dump({'Variables': variables}, sys.stdout)
print('', file=sys.stderr)
print(f'Removing {len(changed)} keys: {changed}', file=sys.stderr)
" > "$TMP_ENV"

run_or_print aws "${AWS_COMMON[@]}" lambda update-function-configuration \
  --function-name "$FN" --environment "file://$TMP_ENV"
run_or_print aws "${AWS_COMMON[@]}" lambda wait function-updated \
  --function-name "$FN"

# --- VPC: ensure detached ----------------------------------------------------
VPC_SUBNET_COUNT="$(aws "${AWS_COMMON[@]}" lambda get-function-configuration \
  --function-name "$FN" --query 'length(VpcConfig.SubnetIds)' --output text)"
if [[ "$VPC_SUBNET_COUNT" != "0" ]]; then
  log "Lambda is still in VPC — detaching"
  run_or_print aws "${AWS_COMMON[@]}" lambda update-function-configuration \
    --function-name "$FN" \
    --vpc-config "SubnetIds=[],SecurityGroupIds=[]"
  run_or_print aws "${AWS_COMMON[@]}" lambda wait function-updated \
    --function-name "$FN"
else
  log "Lambda already out of VPC — skip"
fi

# --- IAM: detach VPC managed policy -----------------------------------------
if aws --profile "$PROFILE" iam list-attached-role-policies --role-name "$ROLE" \
    --query "AttachedPolicies[?PolicyName=='AWSLambdaVPCAccessExecutionRole'].PolicyName" \
    --output text | grep -q AWSLambda; then
  log "Detaching AWSLambdaVPCAccessExecutionRole"
  run_or_print aws --profile "$PROFILE" iam detach-role-policy \
    --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
else
  log "AWSLambdaVPCAccessExecutionRole already detached — skip"
fi

# --- IAM: inline policy ------------------------------------------------------
log "Reconciling inline policy $INLINE_POLICY_NAME"
INLINE_POLICY_FILE="$SCRIPT_DIR/iam-inline-policy.json"
run_or_print aws --profile "$PROFILE" iam put-role-policy \
  --role-name "$ROLE" \
  --policy-name "$INLINE_POLICY_NAME" \
  --policy-document "file://$INLINE_POLICY_FILE"

# --- Summary -----------------------------------------------------------------
log "Done. Snapshotting post-apply state"
aws "${AWS_COMMON[@]}" lambda get-function-configuration --function-name "$FN" \
  > "$BACKUP_DIR/lambda-config-after-$TS.json"
aws --profile "$PROFILE" iam get-role-policy --role-name "$ROLE" \
  --policy-name "$INLINE_POLICY_NAME" \
  > "$BACKUP_DIR/iam-inline-policy-after-$TS.json" || true

log "Snapshots saved with suffix $TS in $BACKUP_DIR/"
if [[ "$APPLY" != "yes" ]]; then
  echo
  echo "This was a dry-run. Re-run with --apply to execute."
fi
