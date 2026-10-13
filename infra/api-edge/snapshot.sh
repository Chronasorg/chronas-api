#!/usr/bin/env bash
# Read-only snapshot of the edge: distribution config and ETag, the cache
# policies it uses, and the api.chronas.org record. No secrets.
#   ./snapshot.sh [label]        prints the snapshot directory
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_identity
DIR="$(backup_dir "${1:-snapshot}")"

aws_cli cloudfront get-distribution-config --id "$DISTRIBUTION_ID" --output json > "$DIR/distribution-config.json"
for id in $(jq -r '[.DistributionConfig.DefaultCacheBehavior.CachePolicyId] + [.DistributionConfig.CacheBehaviors.Items[]?.CachePolicyId] | unique | .[]' "$DIR/distribution-config.json"); do
  aws_cli cloudfront get-cache-policy-config --id "$id" --output json > "$DIR/cache-policy-$id.json" || true
done
aws_cli cloudfront get-distribution --id "$DISTRIBUTION_ID" --query 'Distribution.{Status:Status,LastModifiedTime:LastModifiedTime,DomainName:DomainName}' --output json > "$DIR/distribution-status.json"
aws_cli route53 list-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" \
  --query "ResourceRecordSets[?Name=='$RECORD_NAME']" --output json > "$DIR/route53-record.json"
log "Snapshot written to $DIR"
echo "$DIR"
