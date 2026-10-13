#!/usr/bin/env bash
# P3 throwaway distribution: the §6 target config with no alias and the
# default certificate, all behaviors on the API Gateway origin.
#   ./test-distribution.sh create [--web-origin <domain> --oac <id> --assign default=WebFunctionOrigin,…]
#                                 [--apply --confirm "create test distribution"]
#   ./test-distribution.sh status|domain
#   ./test-distribution.sh delete [--apply --confirm "delete test distribution"]
# The throwaway distribution is found by its comment, so CI runs don't need
# to share state. delete refuses anything that isn't that distribution.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
parse_common_args "$@"
require_identity

find_test_distribution() {
  aws_cli cloudfront list-distributions \
    --query "DistributionList.Items[?Comment=='$TEST_DISTRIBUTION_COMMENT'] | [0].{Id:Id,DomainName:DomainName,Status:Status,Enabled:Enabled}" --output json \
    | sed 's/^null$//'
}
FOUND="$(find_test_distribution)"

case "${ARGS[0]:-}" in
  create)
    [[ -z "$FOUND" ]] || die "a test distribution already exists: $FOUND"
    read -r DYNAMIC_ID PUBLIC_ID <<< "$(policy_ids)"
    DIR="$(backup_dir test-distribution)"
    aws_cli cloudfront get-distribution-config --id "$DISTRIBUTION_ID" --output json > "$DIR/live.json"
    edge_config render --live "$DIR/live.json" --dynamic-id "$DYNAMIC_ID" --public-id "$PUBLIC_ID" --test-distribution \
      "${ARGS[@]:1}" > "$DIR/test-config.json"
    log "Test distribution config: $DIR/test-config.json"
    if confirmed "create test distribution"; then
      CREATED="$(aws_cli cloudfront create-distribution --distribution-config "file://$DIR/test-config.json" \
        --query 'Distribution.{Id:Id,DomainName:DomainName}' --output json)"
      wait_deployed "$(jq -r .Id <<< "$CREATED")"
      log "Test distribution ready: https://$(jq -r .DomainName <<< "$CREATED")"
      echo "$CREATED"
    fi
    ;;
  status)
    [[ -n "$FOUND" ]] || die "no test distribution exists"
    echo "$FOUND"
    ;;
  domain)
    [[ -n "$FOUND" ]] || die "no test distribution exists"
    jq -r .DomainName <<< "$FOUND"
    ;;
  delete)
    [[ -n "$FOUND" ]] || die "no test distribution exists"
    ID="$(jq -r .Id <<< "$FOUND")"
    [[ "$ID" != "$DISTRIBUTION_ID" ]] || die "refusing to delete the production distribution"
    CFG="$(mktemp)"
    aws_cli cloudfront get-distribution-config --id "$ID" --output json > "$CFG"
    [[ "$(jq -r .DistributionConfig.Comment "$CFG")" == "$TEST_DISTRIBUTION_COMMENT" ]] || die "$ID is not the throwaway test distribution"
    [[ "$(jq -r .DistributionConfig.Aliases.Quantity "$CFG")" == "0" ]] || die "$ID has aliases; refusing"
    if confirmed "delete test distribution"; then
      if [[ "$(jq -r .DistributionConfig.Enabled "$CFG")" == "true" ]]; then
        jq '.DistributionConfig.Enabled = false | .DistributionConfig' "$CFG" > "$CFG.disabled"
        aws_cli cloudfront update-distribution --id "$ID" --if-match "$(jq -r .ETag "$CFG")" \
          --distribution-config "file://$CFG.disabled" --query 'Distribution.Status' --output text
        wait_deployed "$ID"
      fi
      aws_cli cloudfront delete-distribution --id "$ID" \
        --if-match "$(aws_cli cloudfront get-distribution-config --id "$ID" --query ETag --output text)"
      log "Deleted $ID"
    fi
    ;;
  *) die "usage: test-distribution.sh create|status|domain|delete" ;;
esac
