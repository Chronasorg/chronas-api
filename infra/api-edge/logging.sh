#!/usr/bin/env bash
# Plan P2: observability, no behavior change.
#  1. CloudFront standard logging v2 → CloudWatch Logs (us-east-1), 14 days.
#  2. API Gateway access-log format with domain, route, integration status,
#     integration error and latencies (existing fields kept).
#  3. Metric filters and alarms for Event Function timeouts and OOMs.
#   ./logging.sh [--apply --confirm "enable edge logging"]
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
parse_common_args "$@"
require_identity
DIR="$(backup_dir logging)"
US=(--region us-east-1)
EU=(--region "$REGION")

CF_LOG_GROUP_ARN="arn:aws:logs:us-east-1:${ACCOUNT_ID}:log-group:${CF_LOG_GROUP}"
SOURCE_NAME="chronas-api-cf-access"
DESTINATION_NAME="chronas-api-cf-access-cwl"
# No cookies, no Authorization. c-ip as in the existing API Gateway logs.
FIELDS='timestamp(ms),x-edge-location,c-ip,c-country,cs-method,x-host-header,cs-uri-stem,cs-uri-query,sc-status,sc-bytes,sc-content-type,time-taken,time-to-first-byte,origin-fbl,origin-lbl,x-edge-result-type,x-edge-response-result-type,x-edge-detailed-result-type,cache-behavior-path-pattern,cs-protocol-version,cs(User-Agent),cs(Referer),x-edge-request-id'

IFS=, read -ra FIELD_LIST <<< "$FIELDS"

ACCESS_LOG_FORMAT='{"requestId":"$context.requestId","userAgent":"$context.identity.userAgent","sourceIp":"$context.identity.sourceIp","requestTime":"$context.requestTime","httpMethod":"$context.httpMethod","path":"$context.path","resourcePath":"$context.resourcePath","status":"$context.status","responseLength":"$context.responseLength","domainName":"$context.domainName","routeKey":"$context.routeKey","integrationStatus":"$context.integration.status","integrationError":"$context.integrationErrorMessage","responseLatency":"$context.responseLatency","integrationLatency":"$context.integration.latency"}'

aws_cli apigatewayv2 get-stage --api-id "$API_ID" --stage-name "$API_STAGE" "${EU[@]}" --output json > "$DIR/apigw-stage-before.json"
aws_cli logs describe-deliveries "${US[@]}" --output json > "$DIR/deliveries-before.json"
aws_cli logs describe-metric-filters --log-group-name "$LAMBDA_LOG_GROUP" "${EU[@]}" --output json > "$DIR/metric-filters-before.json"

log "Plan:"
log " - log group us-east-1:$CF_LOG_GROUP (retention $CF_LOG_RETENTION_DAYS d) ← delivery $SOURCE_NAME → $DESTINATION_NAME"
log " - API Gateway access-log format: add domainName, routeKey, integrationStatus, integrationError, responseLatency, integrationLatency"
log " - metric filters Chronas/Api LambdaTimeouts (\"Status: timeout\") and LambdaOutOfMemory (\"Runtime.OutOfMemory\"), alarms → $ALARM_TOPIC_ARN"

if confirmed "enable edge logging"; then
  if [[ -z "$(aws_cli logs describe-log-groups "${US[@]}" --log-group-name-prefix "$CF_LOG_GROUP" --query "logGroups[?logGroupName=='$CF_LOG_GROUP'].logGroupName" --output text)" ]]; then
    aws_cli logs create-log-group "${US[@]}" --log-group-name "$CF_LOG_GROUP" --tags app=chronas
  fi
  aws_cli logs put-retention-policy "${US[@]}" --log-group-name "$CF_LOG_GROUP" --retention-in-days "$CF_LOG_RETENTION_DAYS"
  aws_cli logs put-delivery-source "${US[@]}" --name "$SOURCE_NAME" --resource-arn "$DISTRIBUTION_ARN" --log-type ACCESS_LOGS --query deliverySource.arn --output text
  DEST_ARN="$(aws_cli logs put-delivery-destination "${US[@]}" --name "$DESTINATION_NAME" --output-format json \
    --delivery-destination-configuration "destinationResourceArn=$CF_LOG_GROUP_ARN" --query deliveryDestination.arn --output text)"
  if [[ -z "$(aws_cli logs describe-deliveries "${US[@]}" --query "deliveries[?deliverySourceName=='$SOURCE_NAME'].id" --output text)" ]]; then
    aws_cli logs create-delivery "${US[@]}" --delivery-source-name "$SOURCE_NAME" --delivery-destination-arn "$DEST_ARN" \
      --record-fields "${FIELD_LIST[@]}" --query delivery.id --output text
  fi

  jq -n --arg arn "$API_ACCESS_LOG_GROUP_ARN" --arg format "$ACCESS_LOG_FORMAT" '{DestinationArn: $arn, Format: $format}' > "$DIR/access-log-settings.json"
  aws_cli apigatewayv2 update-stage --api-id "$API_ID" --stage-name "$API_STAGE" "${EU[@]}" \
    --access-log-settings "file://$DIR/access-log-settings.json" --query StageName --output text

  for spec in "LambdaTimeouts|\"Status: timeout\"" "LambdaOutOfMemory|\"Runtime.OutOfMemory\""; do
    name="${spec%%|*}"; pattern="${spec#*|}"
    aws_cli logs put-metric-filter "${EU[@]}" --log-group-name "$LAMBDA_LOG_GROUP" --filter-name "chronas-api-$name" \
      --filter-pattern "$pattern" --metric-transformations "metricName=$name,metricNamespace=Chronas/Api,metricValue=1,defaultValue=0"
    aws_cli cloudwatch put-metric-alarm "${EU[@]}" --alarm-name "chronas-api-$name" \
      --alarm-description "Event Function $name (infra/api-edge/logging.sh)" \
      --namespace Chronas/Api --metric-name "$name" --statistic Sum --period 300 --evaluation-periods 1 \
      --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold --treat-missing-data notBreaching \
      --alarm-actions "$ALARM_TOPIC_ARN"
  done
  log "Done. First CloudFront log events arrive within minutes: aws logs tail $CF_LOG_GROUP --region us-east-1"
fi
