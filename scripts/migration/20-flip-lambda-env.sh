#!/usr/bin/env bash
# Forward-only Lambda env-var flipper.
#
# Usage:
#   ./scripts/migration/20-flip-lambda-env.sh --flag USE_DYNAMODB_MARKERS=true
#   ./scripts/migration/20-flip-lambda-env.sh --flag USE_DYNAMODB_MARKERS=false --emergency-break-glass
#
# Refuses `=false` unless `--emergency-break-glass` is passed. See the
# forward-only policy in the migration plan — we don't roll flags back.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "$HERE/_lib.sh"

REGION="${AWS_REGION:-eu-west-1}"
FUNCTION_NAME="${CHRONAS_LAMBDA_FUNCTION:-}"
FLAG=""
BREAK_GLASS=0

while [ $# -gt 0 ]; do
  case "$1" in
    --flag) FLAG="$2"; shift 2 ;;
    --function) FUNCTION_NAME="$2"; shift 2 ;;
    --emergency-break-glass) BREAK_GLASS=1; shift ;;
    --dry-run) shift ;;  # handled by _lib
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

assert_profile

if [ -z "$FLAG" ]; then
  echo "ERROR: --flag KEY=VALUE is required" >&2
  exit 2
fi

KEY="${FLAG%%=*}"
VALUE="${FLAG#*=}"

if [ "$VALUE" != "true" ] && [ "$VALUE" != "false" ]; then
  echo "ERROR: flag value must be 'true' or 'false' (got: $VALUE)" >&2
  exit 2
fi

if [ "$VALUE" = "false" ] && [ "$BREAK_GLASS" != "1" ]; then
  cat >&2 <<EOF
REFUSED: $KEY=false is a forward-only policy violation.

This migration is strictly forward-only. Flipping a flag off after writes
have landed in DynamoDB creates split-brain state.

If you have a genuine site-down emergency and no forward-fix is available,
re-run with --emergency-break-glass. You will then be responsible for
reconciling DynamoDB writes back to DocumentDB by replaying the Revision
table.
EOF
  exit 3
fi

if [ -z "$FUNCTION_NAME" ]; then
  echo "ERROR: --function <name> or CHRONAS_LAMBDA_FUNCTION env var required" >&2
  exit 2
fi

log "Target function: $FUNCTION_NAME"
log "Flag: $KEY=$VALUE (break-glass=$BREAK_GLASS)"

current=$(aws lambda get-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query 'Environment.Variables' \
  --output json)

log "Current USE_DYNAMODB_* env on $FUNCTION_NAME:"
echo "$current" | node -e "
  let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
    const e=JSON.parse(s)||{};
    Object.keys(e).filter(k=>k.startsWith('USE_DYNAMODB_')||k==='DYNAMODB_TABLE_PREFIX').sort()
      .forEach(k=>console.log('  ',k,'=',e[k]));
  });"

if is_dry_run; then
  log "DRY-RUN: would set $KEY=$VALUE on $FUNCTION_NAME"
  exit 0
fi

merged=$(echo "$current" | KEY="$KEY" VALUE="$VALUE" node -e "
  let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
    const e=JSON.parse(s)||{};
    e[process.env.KEY]=process.env.VALUE;
    console.log(JSON.stringify({Variables:e}));
  });")

aws lambda update-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --environment "$merged" >/dev/null

log "APPLIED. Waiting for Lambda update to settle…"
aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"
log "Done."
