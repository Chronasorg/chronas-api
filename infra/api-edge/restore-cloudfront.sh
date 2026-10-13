#!/usr/bin/env bash
# Put a snapshot's distribution config back (rollback for P4 and P8).
#   ./restore-cloudfront.sh <snapshot>/distribution-config.json [--apply --confirm "restore E1KTIK2H0W8J2Q"]
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
parse_common_args "$@"
require_identity
SNAPSHOT="${ARGS[0]:-}"
[[ -f "$SNAPSHOT" ]] || die "usage: restore-cloudfront.sh <distribution-config.json>"

CURRENT="$(bash "$EDGE_DIR/snapshot.sh" before-restore)/distribution-config.json"
log "Changes (current → snapshot):"
diff <(jq -S .DistributionConfig "$CURRENT") <(jq -S .DistributionConfig "$SNAPSHOT") >&2 || true

if confirmed "restore $DISTRIBUTION_ID"; then
  tmp="$(mktemp)"
  jq .DistributionConfig "$SNAPSHOT" > "$tmp"
  aws_cli cloudfront update-distribution --id "$DISTRIBUTION_ID" --if-match "$(jq -r .ETag "$CURRENT")" \
    --distribution-config "file://$tmp" --query 'Distribution.Status' --output text
  rm -f "$tmp"
  wait_deployed "$DISTRIBUTION_ID"
  invalidate_and_wait "$DISTRIBUTION_ID"
fi
