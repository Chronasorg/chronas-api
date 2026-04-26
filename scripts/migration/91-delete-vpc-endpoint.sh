#!/usr/bin/env bash
# Phase 8 — Delete the VPC interface endpoint used by the old Mongoose/
# DocumentDB path. Saves ~$7/mo.
#
# The endpoint ID is hard-coded from the earlier AWS cleanup work. Confirm
# it still matches before running.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "$HERE/_lib.sh"

REGION="${AWS_REGION:-eu-west-1}"
VPCE_ID="${VPCE_ID:-vpce-0140ad3b3259ace64}"

assert_profile

log "Will delete VPC endpoint: $VPCE_ID"

log "Current endpoint details:"
aws ec2 describe-vpc-endpoints \
  --vpc-endpoint-ids "$VPCE_ID" \
  --region "$REGION" \
  --output json \
  --query 'VpcEndpoints[0].{Service:ServiceName,State:State,Subnets:SubnetIds}' || {
    log "NOTICE: endpoint $VPCE_ID not found — already deleted?"
    exit 0
  }

if is_dry_run; then
  log "DRY-RUN: would run aws ec2 delete-vpc-endpoints --vpc-endpoint-ids $VPCE_ID"
  exit 0
fi

aws ec2 delete-vpc-endpoints \
  --vpc-endpoint-ids "$VPCE_ID" \
  --region "$REGION" \
  --output json

log "Submitted deletion. AWS will move the endpoint through 'deleting' → gone."
log "Done."
