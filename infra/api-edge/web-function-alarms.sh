#!/usr/bin/env bash
# CloudWatch alarms for the Web Function, replacing the classic Lambda and
# API Gateway alarms. Same email topic; alarm on trouble only; no data = OK.
# Web Functions publish no latency metric, so there is no duration alarm.
# EndpointActiveEnvironments isn't alarmed: Lambda keeps spare environments
# up, so it sits at the cap even at low traffic; the throttle metric is the
# real "out of capacity" signal.
#   ./web-function-alarms.sh [--apply --confirm "set web function alarms"]
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
parse_common_args "$@"
require_identity

FN_DIMS=(Name=FunctionName,Value="$WEB_FUNCTION_NAME")
EP_DIMS=(Name=FunctionName,Value="$WEB_FUNCTION_NAME" Name=EndpointName,Value="$WEB_ENDPOINT_NAME")
USAGE_DIMS=("${EP_DIMS[@]}" Name=ExecutionRegion,Value="$REGION")

# name | namespace | metric | statistic | threshold | evaluation periods | description
ALARMS=(
  "chronas-api-web-5xx|AWS/Lambda/Web|HTTPResponseStatusClass5XX|Sum|10|1|10 or more 5xx responses in 5 minutes (replaces the Lambda error alarm)"
  "chronas-api-web-throttled|AWS/Lambda/Web/Usage|EndpointRequestThrottles|Sum|10|1|10 or more requests over the endpoint rate limit in 5 minutes (replaces the API Gateway 429 alarm)"
  "chronas-api-web-capacity|AWS/Lambda/Web/Usage|EndpointActiveEnvironmentThrottles|Sum|1|1|Requests needed more environments than maxEnvironments allows (replaces the Lambda concurrency alarm)"
  "chronas-api-web-memory|AWS/Lambda/Web|EnvironmentMaxMemoryUsage|Maximum|1536|1|An environment used more than 1.5 of its 2 GB (timeouts and out-of-memory)"
)

for spec in "${ALARMS[@]}"; do
  IFS='|' read -r name namespace metric statistic threshold periods description <<< "$spec"
  log "$name: $namespace/$metric $statistic >= $threshold over ${periods}x5 min"
done
confirmed "set web function alarms" || exit 0

for spec in "${ALARMS[@]}"; do
  IFS='|' read -r name namespace metric statistic threshold periods description <<< "$spec"
  case "$metric" in
    HTTPResponseStatusClass5XX) dims=("${EP_DIMS[@]}") ;;
    EnvironmentMaxMemoryUsage) dims=("${FN_DIMS[@]}") ;;
    *) dims=("${USAGE_DIMS[@]}") ;;
  esac
  aws_cli cloudwatch put-metric-alarm --region "$REGION" --alarm-name "$name" --alarm-description "$description" \
    --namespace "$namespace" --metric-name "$metric" --dimensions "${dims[@]}" --statistic "$statistic" \
    --period 300 --evaluation-periods "$periods" --threshold "$threshold" \
    --comparison-operator GreaterThanOrEqualToThreshold --treat-missing-data notBreaching \
    --alarm-actions "$ALARM_TOPIC_ARN" --tags Key=app,Value=chronas
  log "set $name"
done
