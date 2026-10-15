#!/usr/bin/env bash
# Create, or check, the two cache policies of plan §6 (names and settings in
# edge-config.mjs POLICY_SPECS: ChronasApiDynamicV3, ChronasApiPublicV4).
# Existing policies are never modified: if one differs from its spec the
# script stops, so a spec change gets a new name.
#   ./policies.sh [--apply --confirm "create cache policies"]
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
parse_common_args "$@"
require_identity

missing=()
for spec in dynamic public; do
  name="$(edge_config policy-spec "$spec" | jq -r .Name)"
  id="$(policy_id_by_name "$name")"
  if [[ -n "$id" ]]; then
    check_policy "$id" "$spec"
    log "$name exists: $id"
  else
    missing+=("$spec")
    log "$name is missing"
  fi
done

if [[ ${#missing[@]} -gt 0 ]] && confirmed "create cache policies"; then
  for spec in "${missing[@]}"; do
    tmp="$(mktemp)"
    edge_config policy-spec "$spec" > "$tmp"
    aws_cli cloudfront create-cache-policy --cache-policy-config "file://$tmp" --query 'CachePolicy.Id' --output text
    rm -f "$tmp"
  done
fi
