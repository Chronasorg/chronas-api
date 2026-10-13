#!/usr/bin/env bash
# The api.chronas.org A record (plan P5).
#   ./route53.sh status
#   ./route53.sh cutover  [--apply --confirm "point api.chronas.org at CloudFront"]
#   ./route53.sh rollback [--apply --confirm "point api.chronas.org at API Gateway"]
# rollback restores exactly the pre-cutover alias. Both wait for INSYNC.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
parse_common_args "$@"
require_identity

current() {
  aws_cli route53 list-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" \
    --query "ResourceRecordSets[?Name=='$RECORD_NAME' && Type=='A'] | [0].AliasTarget" --output json
}

upsert() {
  local zone="$1" dns="$2" health="$3" batch
  batch="$(mktemp)"
  jq -n --arg name "$RECORD_NAME" --arg zone "$zone" --arg dns "$dns" --argjson health "$health" \
    '{Comment: "api.chronas.org edge (infra/api-edge/route53.sh)", Changes: [{Action: "UPSERT", ResourceRecordSet: {Name: $name, Type: "A", AliasTarget: {HostedZoneId: $zone, DNSName: $dns, EvaluateTargetHealth: $health}}}]}' > "$batch"
  local change
  change="$(aws_cli route53 change-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" --change-batch "file://$batch" --query ChangeInfo.Id --output text)"
  rm -f "$batch"
  log "Change $change submitted; waiting for INSYNC"
  aws_cli route53 wait resource-record-sets-changed --id "$change"
  current
}

LIVE="$(current)"
case "${ARGS[0]:-}" in
  status) echo "$LIVE" ;;
  cutover)
    [[ "$(jq -r .DNSName <<< "$LIVE")" == "$APIGW_ALIAS_DNS" && "$(jq -r .HostedZoneId <<< "$LIVE")" == "$APIGW_ALIAS_ZONE" ]] \
      || die "record is not the expected API Gateway alias (drift): $LIVE"
    # The distribution must already serve api.chronas.org correctly.
    [[ "$(aws_cli cloudfront get-distribution --id "$DISTRIBUTION_ID" --query Distribution.Status --output text)" == "Deployed" ]] || die "distribution is not Deployed"
    aws_cli cloudfront get-distribution-config --id "$DISTRIBUTION_ID" --query 'DistributionConfig.Aliases.Items' --output text | grep -qw api.chronas.org || die "distribution lacks the api.chronas.org alias"
    NOT_AFTER="$(aws_cli acm describe-certificate --region us-east-1 --certificate-arn "$CERTIFICATE_ARN" --query 'Certificate.[Status,NotAfter]' --output text)"
    [[ "$NOT_AFTER" == ISSUED* ]] || die "certificate not ISSUED: $NOT_AFTER"
    bash "$EDGE_DIR/snapshot.sh" before-cutover >/dev/null
    if confirmed "point api.chronas.org at CloudFront"; then
      upsert "$CLOUDFRONT_ALIAS_ZONE" "${DISTRIBUTION_DOMAIN}." false
    fi
    ;;
  rollback)
    bash "$EDGE_DIR/snapshot.sh" before-rollback >/dev/null
    if confirmed "point api.chronas.org at API Gateway"; then
      upsert "$APIGW_ALIAS_ZONE" "$APIGW_ALIAS_DNS" "$APIGW_ALIAS_EVALUATE_HEALTH"
    fi
    ;;
  *) die "usage: route53.sh status|cutover|rollback" ;;
esac
