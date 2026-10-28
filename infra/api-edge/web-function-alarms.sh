#!/usr/bin/env bash
# CloudWatch alarms for the Web Function, replacing the classic Lambda and
# API Gateway alarms. Same email topic; alarm on trouble only; no data = OK.
# Web Functions publish no latency metric, so there is no duration alarm.
# EndpointActiveEnvironments isn't alarmed: under continuous traffic Lambda
# keeps spare environments up to maxEnvironments (it scaled to zero after
# about 5-6 idle minutes, measured 2026-10-13 to 10-15), so the throttle
# metric is the real "out of capacity" signal. maxEnvironments was 2 until
# 2026-10-28 (then 10), and single throttles came now and then, even at 14-49
# requests per minute: the first capacity alarm fired on 1 throttle at 19:58 UTC on
# 2026-10-13 (period from 19:54) with threshold 1, raised to 5 at 20:32 UTC.
# The per-environment request limit is dynamic and not published, and
# EnvironmentConcurrentRequests reads 1-2 even in idle minutes, so it is no
# measure of it. 429s with Platform.EndpointConcurrentInitThrottle (too many
# environments starting at once) increment no throttle metric at all.
# HTTPResponseStatusClass5XX also counts 5xx that Lambda returned itself
# (for example 503 load shedding, web-functions-scaling.html); the app logs
# one http5xx line per 5xx Express sends, so the difference is the platform
# share, apart from the 503s web-server.js sends while startup fails (one
# "Startup failed" line per attempt).
# The CloudFront 5xx-rate alarm (CloudFront-5xx-Rate-High) lives in us-east-1
# and notifies the us-east-1 topic of the same name; it is not managed here.
#   ./web-function-alarms.sh [--apply --confirm "set web function alarms"]
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
parse_common_args "$@"
require_identity

FN_DIMS=(Name=FunctionName,Value="$WEB_FUNCTION_NAME")
EP_DIMS=(Name=FunctionName,Value="$WEB_FUNCTION_NAME" Name=EndpointName,Value="$WEB_ENDPOINT_NAME")
USAGE_DIMS=("${EP_DIMS[@]}" Name=ExecutionRegion,Value="$REGION")

# Thresholds since 2026-10-15: a single scanner burst or one page load that
# hits the environment cap is not worth an email; a sustained one is.
# Throttled needs two 5-minute periods in a row, capacity counts over 15
# minutes. Memory: the peak since the 384 MB heap cap is 521 MB, so 768 MB
# means something grows (a leak, native memory, cost).
# name | namespace | metric | statistic | threshold | period (s) | evaluation periods | datapoints to alarm | description
ALARMS=(
  "chronas-api-web-5xx|AWS/Lambda/Web|HTTPResponseStatusClass5XX|Sum|10|300|1|1|10 or more 5xx responses in 5 minutes (replaces the Lambda error alarm)"
  "chronas-api-web-throttled|AWS/Lambda/Web/Usage|EndpointRequestThrottles|Sum|10|300|2|2|10 or more requests over the endpoint rate limit in each of two 5-minute periods in a row (replaces the API Gateway 429 alarm)"
  "chronas-api-web-capacity|AWS/Lambda/Web/Usage|EndpointActiveEnvironmentThrottles|Sum|10|900|1|1|10 or more requests in 15 minutes got 429 because maxEnvironments was reached (replaces the Lambda concurrency alarm)"
  "chronas-api-web-memory|AWS/Lambda/Web|EnvironmentMaxMemoryUsage|Maximum|768|300|1|1|An environment used 768 MB or more (peak 521 MB since the 384 MB heap cap): memory is growing. A V8 heap failure shows as a WARN platform.invokeReport failure (Runtime.ExitError, Exit, Unreachable or OutOfMemory) instead"
)

for spec in "${ALARMS[@]}"; do
  IFS='|' read -r name namespace metric statistic threshold period periods datapoints description <<< "$spec"
  log "$name: $namespace/$metric $statistic >= $threshold in $datapoints of $periods x ${period}s"
done
confirmed "set web function alarms" || exit 0

for spec in "${ALARMS[@]}"; do
  IFS='|' read -r name namespace metric statistic threshold period periods datapoints description <<< "$spec"
  case "$metric" in
    HTTPResponseStatusClass5XX) dims=("${EP_DIMS[@]}") ;;
    EnvironmentMaxMemoryUsage) dims=("${FN_DIMS[@]}") ;;
    *) dims=("${USAGE_DIMS[@]}") ;;
  esac
  aws_cli cloudwatch put-metric-alarm --region "$REGION" --alarm-name "$name" --alarm-description "$description" \
    --namespace "$namespace" --metric-name "$metric" --dimensions "${dims[@]}" --statistic "$statistic" \
    --period "$period" --evaluation-periods "$periods" --datapoints-to-alarm "$datapoints" --threshold "$threshold" \
    --comparison-operator GreaterThanOrEqualToThreshold --treat-missing-data notBreaching \
    --alarm-actions "$ALARM_TOPIC_ARN" --tags Key=app,Value=chronas
  log "set $name"
done
