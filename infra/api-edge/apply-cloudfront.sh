#!/usr/bin/env bash
# Render the §6 configuration from the live distribution, validate it, show
# the diff, and apply it with the captured ETag (plan phases P4 and P8).
#   ./apply-cloudfront.sh [--assign default=WebFunctionOrigin,markers=WebFunctionOrigin,…]
#                         [--temporary] [--web-origin <domain> --oac <id>] [--drop-api-gateway]
#                         [--apply --confirm "apply E1KTIK2H0W8J2Q"]
# After applying: wait for Deployed, invalidate /v1/* and wait.
# The live distribution has no ApiGatewayOrigin any more, and unassigned
# behaviors default to it: always pass
#   --assign default=WebFunctionOrigin,areas=WebFunctionOrigin,metadata=WebFunctionOrigin,markers=WebFunctionOrigin --drop-api-gateway
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
parse_common_args "$@"
require_identity
set -- "${ARGS[@]+"${ARGS[@]}"}"
RENDER_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --assign|--web-origin|--oac) RENDER_ARGS+=("$1" "$2"); shift ;;
    --temporary|--drop-api-gateway) RENDER_ARGS+=("$1") ;;
    *) die "unknown argument $1" ;;
  esac
  shift
done

# A failure inside $(…) only ends the subshell, so stop here explicitly.
POLICY_IDS="$(policy_ids)" || exit 1
read -r DYNAMIC_ID PUBLIC_ID <<< "$POLICY_IDS"
PREVIOUS_PUBLIC_ID=""
PREVIOUS_PUBLIC_NAME="$(edge_config previous-policy-name public)"
if [[ -n "$PREVIOUS_PUBLIC_NAME" ]]; then PREVIOUS_PUBLIC_ID="$(policy_id_by_name "$PREVIOUS_PUBLIC_NAME")"; fi
SNAP="$(bash "$EDGE_DIR/snapshot.sh" before-apply)"
LIVE="$SNAP/distribution-config.json"
ETAG="$(jq -r .ETag "$LIVE")"

# Drift: the live config must be the recorded pre-P4 state, an already valid
# §6 config, or one that is valid with the previous public policy
# (PREVIOUS_POLICY_SPECS in edge-config.mjs, ChronasApiPublicV3). Anything
# else was changed outside these scripts.
PRE="$EDGE_DIR/fixtures/live-distribution-config-2026-10-13.json"
valid_with() { edge_config validate --config "$LIVE" --dynamic-id "$DYNAMIC_ID" --public-id "$1" >/dev/null 2>&1; }
if ! valid_with "$PUBLIC_ID" && ! { [[ -n "$PREVIOUS_PUBLIC_ID" ]] && valid_with "$PREVIOUS_PUBLIC_ID"; }; then
  if ! diff -q <(jq -S '.DistributionConfig | del(.CallerReference)' "$LIVE") <(jq -S 'del(.CallerReference)' "$PRE") >/dev/null; then
    die "live distribution drifted from both the pre-P4 snapshot and the §6 target; inspect $SNAP"
  fi
fi

TARGET="$SNAP/target-config.json"
edge_config render --live "$LIVE" --dynamic-id "$DYNAMIC_ID" --public-id "$PUBLIC_ID" "${RENDER_ARGS[@]+"${RENDER_ARGS[@]}"}" > "$TARGET"
log "Changes (live → target):"
diff <(jq -S .DistributionConfig "$LIVE") <(jq -S . "$TARGET") >&2 || true

if confirmed "apply $DISTRIBUTION_ID"; then
  aws_cli cloudfront update-distribution --id "$DISTRIBUTION_ID" --if-match "$ETAG" \
    --distribution-config "file://$TARGET" --query 'Distribution.Status' --output text
  wait_deployed "$DISTRIBUTION_ID"
  invalidate_and_wait "$DISTRIBUTION_ID"
  bash "$EDGE_DIR/snapshot.sh" after-apply >/dev/null
  log "Applied. Rollback: restore $LIVE with ./restore-cloudfront.sh $LIVE"
fi
