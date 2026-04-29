#!/usr/bin/env bash
# Phase 8 — Remove Lambda from VPC (one-time).
#
# Once all DynamoDB cutovers are done and 24h soak is clean, Lambda no
# longer needs VPC access (DynamoDB is accessed via public AWS endpoint).
# Removing the VPC config shaves ~50% off cold-start latency and clears
# the way to delete the VPC endpoint in 91-delete-vpc-endpoint.sh.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "$HERE/_lib.sh"

REGION="${AWS_REGION:-eu-west-1}"
FUNCTION_NAME="${CHRONAS_LAMBDA_FUNCTION:-}"

assert_profile

if [ -z "$FUNCTION_NAME" ]; then
  echo "ERROR: CHRONAS_LAMBDA_FUNCTION env var required" >&2
  exit 2
fi

log "Will remove VPC config from: $FUNCTION_NAME"

log "Current VPC config:"
aws lambda get-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query 'VpcConfig' \
  --output json

if is_dry_run; then
  log "DRY-RUN: would run aws lambda update-function-configuration --vpc-config 'SubnetIds=[],SecurityGroupIds=[]'"
  exit 0
fi

aws lambda update-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --vpc-config 'SubnetIds=[],SecurityGroupIds=[]' \
  --region "$REGION" >/dev/null

log "Waiting for Lambda update to settle…"
aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"

log "New VPC config:"
aws lambda get-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query 'VpcConfig' \
  --output json

log "Done."
