#!/usr/bin/env bash
# The api.chronas.org A record: an alias of CloudFront E1KTIK2H0W8J2Q since
# 2026-10-13 (API Gateway, the previous target, is retired).
#   ./route53.sh status
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_identity
aws_cli route53 list-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" \
  --query "ResourceRecordSets[?Name=='$RECORD_NAME' && Type=='A'] | [0].AliasTarget" --output json
