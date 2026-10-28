#!/usr/bin/env bash
# Lambda Web Function "chronas-api", endpoint "prod", behind CloudFront with
# OAC (docs/API_CLOUDFRONT_WEB_FUNCTIONS_PLAN.md). Needs AWS CLI >= 2.37.13
# (AWS_WEB_CLI). Every mutating action is a dry run without --apply --confirm.
#
#   ./web-function.sh status
#   ./web-function.sh revision-config <key> <version> <commit>   (prints the JSON)
#   ./web-function.sh provision <zip> <commit>        --confirm "provision chronas-api"
#   ./web-function.sh deploy <zip> <commit>           --confirm "deploy chronas-api"
#   ./web-function.sh rollback <revision-id>          --confirm "roll back chronas-api"
#   ./web-function.sh scale <maxEnvironments>         --confirm "scale chronas-api to <n>"
#   ./web-function.sh role-policy                     --confirm "update chronas-api role policy"
#   ./web-function.sh allow-distribution <dist-id>    --confirm "allow <dist-id>"
#   ./web-function.sh revoke-distribution <dist-id>   --confirm "revoke <dist-id>"
#
# deploy prints PREVIOUS_REVISION=… and NEW_REVISION=… on stdout.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
parse_common_args "$@"
require_identity
# role-policy only talks to IAM, so it works with an older aws CLI too.
[[ "${ARGS[0]:-}" == role-policy ]] || require_web_cli
set -- "${ARGS[@]+"${ARGS[@]}"}"
ACTION="${1:-}"; shift || true

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${WEB_ROLE_NAME}"
ENDPOINT_ARN="${WEB_FUNCTION_ARN}/endpoint/${WEB_ENDPOINT_NAME}"

# Upload a zip under an immutable per-commit key; prints "<key> <versionId>".
# The key is never overwritten and no lifecycle rule expires versions: a
# revision whose object version disappears fails permanently.
upload_artifact() {
  local zip="$1" commit="$2" key="web/chronas-api-$2.zip" version
  version="$(aws_cli s3api put-object --bucket "$WEB_ARTIFACT_BUCKET" --key "$key" --body "$zip" \
    --region "$REGION" --query VersionId --output text)"
  echo "$key $version"
}

# Full revision configuration. A revision copies nothing from the previous
# one, so everything is passed every time. No secrets: JWT_SECRET comes from
# Secrets Manager at startup (config/bootstrap.js).
# Logging: warnings and errors only; the log groups keep 3 days.
revision_json() {
  local key="$1" version="$2" commit="$3"
  jq -n --arg bucket "$WEB_ARTIFACT_BUCKET" --arg key "$key" --arg version "$version" --arg role "$ROLE_ARN" --arg commit "$commit" --arg dist "$DISTRIBUTION_ID" '{
    description: ("commit " + $commit),
    buildConfig: {
      codeConfig: {s3Object: {bucket: $bucket, key: $key, versionId: $version}},
      runtimeConfig: {runtime: "nodejs24.x"}
    },
    serviceConfig: {
      executionRoleArn: $role,
      timeoutSeconds: 25,
      maxConcurrencyPerEnvironment: 64,
      environmentVariables: {
        NODE_ENV: "production",
        # Memory is billed as consumed for the whole environment lifetime, and
        # the default V8 heap here is 1 GB, so the heap grows lazily. 384 MB is
        # the cap the classic Lambda ran with in production since 2026-05.
        # With only that flag set, Lambda does not set --max-semi-space-size
        # (web-functions-runtimes.html), so the young generation grows to the
        # Node default. 4 MB semi-spaces lowered peak RSS in a 400-year area
        # sweep on Node 24 from 331 to 222 MB (concurrency 4) and from 392 to
        # 276 MB (concurrency 16), at about 10% more CPU (2026-10-15, macOS).
        # No apostrophes in these comments: this jq program is single-quoted.
        NODE_OPTIONS: "--max-old-space-size=384 --max-semi-space-size=4",
        APP_VERSION: $commit,
        SECRET_CONFIG_NAME: "/chronas/secrets",
        DYNAMODB_TABLE_PREFIX: "chronas",
        USE_DYNAMODB_AREAS: "true", USE_DYNAMODB_MARKERS: "true", USE_DYNAMODB_METADATA: "true",
        USE_DYNAMODB_USERS: "true", USE_DYNAMODB_FLAGS: "true", USE_DYNAMODB_REVISIONS: "true",
        USE_DYNAMODB_BOARD: "true",
        STATISTICS_S3_BUCKET: "chronas-frontend-new",
        STATISTICS_S3_KEY: "api/statistics.json",
        CHRONAS_HOST: "https://chronas.org",
        ALLOWED_ORIGINS: "https://chronas.org,https://new.chronas.org,http://localhost:3000,http://localhost:5173",
        # The API invalidates its CloudFront copies after writes (server/helpers/edge-invalidation.js).
        CLOUDFRONT_DISTRIBUTION_ID: $dist
      },
      telemetryConfig: {loggingConfig: {applicationLogLevel: "WARN", systemLogLevel: "WARN"}}
    }
  }'
}

current_revision() {
  web_cli get-web-function-endpoint --function-name "$WEB_FUNCTION_NAME" --endpoint-name "$WEB_ENDPOINT_NAME" \
    --query 'revisionWeights[0].revisionId' --output text
}

point_endpoint_at() {
  web_cli update-web-function-endpoint --function-name "$WEB_FUNCTION_NAME" --endpoint-name "$WEB_ENDPOINT_NAME" \
    --revision-weights "[{\"revisionId\":\"$1\",\"weight\":100}]" --query updateStatus --output text >&2
  web_cli wait web-function-endpoint-updated --function-name "$WEB_FUNCTION_NAME" --endpoint-name "$WEB_ENDPOINT_NAME"
  log "Endpoint $WEB_ENDPOINT_NAME now serves $1"
}

put_distribution_access() {
  local mode="$1" dist="$2" sid current policy revision
  sid="CloudFront${dist}"
  current="$(web_cli get-resource-policy --resource-arn "$WEB_FUNCTION_ARN" --output json 2>/dev/null || echo '{}')"
  policy="$(jq -r '.policy // "{\"Version\":\"2012-10-17\",\"Statement\":[]}"' <<< "$current")"
  revision="$(jq -r '.revisionId // empty' <<< "$current")"
  if [[ "$mode" == allow ]]; then
    policy="$(jq -c --arg sid "$sid" --arg res "$ENDPOINT_ARN" --arg src "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${dist}" \
      '.Statement = ([.Statement[] | select(.Sid != $sid)] + [{Sid: $sid, Effect: "Allow", Principal: {Service: "cloudfront.amazonaws.com"}, Action: "lambda:InvokeWebFunctionEndpoint", Resource: $res, Condition: {StringEquals: {"aws:SourceArn": $src}}}])' <<< "$policy")"
  else
    policy="$(jq -c --arg sid "$sid" '.Statement = [.Statement[] | select(.Sid != $sid)]' <<< "$policy")"
  fi
  if [[ "$(jq '.Statement | length' <<< "$policy")" == 0 ]]; then
    web_cli delete-resource-policy --resource-arn "$WEB_FUNCTION_ARN" ${revision:+--revision-id "$revision"}
  else
    web_cli put-resource-policy --resource-arn "$WEB_FUNCTION_ARN" --policy "$policy" ${revision:+--revision-id "$revision"} --query revisionId --output text >&2
  fi
  log "Resource policy: $(jq -c '[.Statement[].Sid]' <<< "$policy")"
}

case "$ACTION" in
  status)
    web_cli get-web-function --function-name "$WEB_FUNCTION_NAME" --output json 2>/dev/null | jq '{state: (.state // .State)}' || echo "no web function"
    web_cli get-web-function-endpoint --function-name "$WEB_FUNCTION_NAME" --endpoint-name "$WEB_ENDPOINT_NAME" --output json 2>/dev/null \
      | jq '{domainName, state, updateStatus, authType, autoDeploymentMode, revisionWeights, scalingConfig, throttleConfig}' || true
    web_cli get-resource-policy --resource-arn "$WEB_FUNCTION_ARN" --query policy --output text 2>/dev/null | jq -c '[.Statement[] | {Sid, SourceArn: .Condition.StringEquals["aws:SourceArn"]}]' || true
    ;;

  provision)
    ZIP="${1:?zip}"; COMMIT="${2:?commit}"
    log "Plan: bucket $WEB_ARTIFACT_BUCKET (versioned, private, TLS only), role $WEB_ROLE_NAME, log groups (${WEB_LOG_RETENTION_DAYS} d),"
    log "      web function $WEB_FUNCTION_NAME with endpoint $WEB_ENDPOINT_NAME (IamAuth, routing Disabled, maxEnvironments $WEB_MAX_ENVIRONMENTS, rateLimit 100),"
    log "      CloudFront access for $DISTRIBUTION_ID only, OAC $WEB_OAC_NAME. Serves no traffic until CloudFront points at it."
    confirmed "provision chronas-api" || exit 0

    if ! aws_cli s3api head-bucket --bucket "$WEB_ARTIFACT_BUCKET" --region "$REGION" >/dev/null 2>&1; then
      aws_cli s3api create-bucket --bucket "$WEB_ARTIFACT_BUCKET" --region "$REGION" \
        --create-bucket-configuration "LocationConstraint=$REGION" --query Location --output text
    fi
    aws_cli s3api put-public-access-block --bucket "$WEB_ARTIFACT_BUCKET" --region "$REGION" \
      --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
    aws_cli s3api put-bucket-versioning --bucket "$WEB_ARTIFACT_BUCKET" --region "$REGION" --versioning-configuration Status=Enabled
    aws_cli s3api put-bucket-tagging --bucket "$WEB_ARTIFACT_BUCKET" --region "$REGION" --tagging 'TagSet=[{Key=app,Value=chronas}]'
    aws_cli s3api put-bucket-policy --bucket "$WEB_ARTIFACT_BUCKET" --region "$REGION" --policy "$(jq -c -n \
      --arg bucket "$WEB_ARTIFACT_BUCKET" --arg acct "$ACCOUNT_ID" --arg fn "$WEB_FUNCTION_ARN" '{
        Version: "2012-10-17",
        Statement: [
          {Sid: "LambdaReadsRevisionCode", Effect: "Allow", Principal: {Service: "lambda.amazonaws.com"},
           Action: ["s3:GetObject", "s3:GetObjectVersion"], Resource: ("arn:aws:s3:::" + $bucket + "/web/*"),
           Condition: {StringEquals: {"aws:SourceAccount": $acct}, ArnLike: {"aws:SourceArn": ($fn + "/revision/*")}}},
          {Sid: "TlsOnly", Effect: "Deny", Principal: "*", Action: "s3:*",
           Resource: [("arn:aws:s3:::" + $bucket), ("arn:aws:s3:::" + $bucket + "/*")],
           Condition: {Bool: {"aws:SecureTransport": "false"}}}
        ]}')"

    if ! aws_cli iam get-role --role-name "$WEB_ROLE_NAME" >/dev/null 2>&1; then
      aws_cli iam create-role --role-name "$WEB_ROLE_NAME" --tags Key=app,Value=chronas \
        --description "chronas-api Lambda Web Function execution role" --query Role.Arn --output text \
        --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
      sleep 10 # IAM propagation before Lambda assumes the role
    fi
    aws_cli iam put-role-policy --role-name "$WEB_ROLE_NAME" --policy-name chronas-api-web-access \
      --policy-document "file://$EDGE_DIR/web-function-role-policy.json"

    for group in "$WEB_LOG_GROUP" "$WEB_LOG_GROUP.local"; do
      aws_cli logs create-log-group --region "$REGION" --log-group-name "$group" --tags app=chronas 2>/dev/null || true
      aws_cli logs put-retention-policy --region "$REGION" --log-group-name "$group" --retention-in-days "$WEB_LOG_RETENTION_DAYS"
    done

    if ! web_cli get-web-function --function-name "$WEB_FUNCTION_NAME" >/dev/null 2>&1; then
      read -r KEY VERSION <<< "$(upload_artifact "$ZIP" "$COMMIT")"
      web_cli create-web-function --function-name "$WEB_FUNCTION_NAME" --tags app=chronas \
        --revision-config "$(revision_json "$KEY" "$VERSION" "$COMMIT")" \
        --endpoint-config "{\"endpointName\":\"$WEB_ENDPOINT_NAME\",\"endpointType\":\"HomeRegion\",\"authType\":\"IamAuth\",\"autoDeploymentMode\":\"Disabled\",\"scalingConfig\":{\"maxEnvironments\":$WEB_MAX_ENVIRONMENTS},\"throttleConfig\":{\"rateLimit\":100}}" \
        --query functionArn --output text
    fi
    web_cli wait web-function-endpoint-active --function-name "$WEB_FUNCTION_NAME" --endpoint-name "$WEB_ENDPOINT_NAME"
    put_distribution_access allow "$DISTRIBUTION_ID"

    if [[ -z "$(aws_cli cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?Name=='$WEB_OAC_NAME'].Id | [0]" --output text | sed 's/^None$//')" ]]; then
      aws_cli cloudfront create-origin-access-control --query OriginAccessControl.Id --output text \
        --origin-access-control-config "{\"Name\":\"$WEB_OAC_NAME\",\"Description\":\"chronas-api Lambda Web Function origin\",\"SigningProtocol\":\"sigv4\",\"SigningBehavior\":\"always-amz-auth\",\"OriginAccessControlOriginType\":\"lambda\"}"
    fi
    bash "$0" status
    ;;

  deploy)
    ZIP="${1:?zip}"; COMMIT="${2:?commit}"
    PREVIOUS="$(current_revision)"
    log "Plan: upload $ZIP, create a revision for $COMMIT, move endpoint $WEB_ENDPOINT_NAME from $PREVIOUS to it."
    confirmed "deploy chronas-api" || exit 0
    read -r KEY VERSION <<< "$(upload_artifact "$ZIP" "$COMMIT")"
    REVISION_CONFIG="$(revision_json "$KEY" "$VERSION" "$COMMIT")"
    NEW="$(web_cli create-web-function-revision --function-name "$WEB_FUNCTION_NAME" \
      --description "$(jq -r .description <<< "$REVISION_CONFIG")" \
      --build-config "$(jq -c .buildConfig <<< "$REVISION_CONFIG")" \
      --service-config "$(jq -c .serviceConfig <<< "$REVISION_CONFIG")" \
      --query revisionId --output text)"
    log "Revision $NEW created; waiting for Active"
    web_cli wait web-function-revision-active --function-name "$WEB_FUNCTION_NAME" --revision-id "$NEW"
    # Active doesn't mean the server started; the caller checks /v1/version.
    point_endpoint_at "$NEW"
    echo "PREVIOUS_REVISION=$PREVIOUS"
    echo "NEW_REVISION=$NEW"
    ;;

  revision-config)
    revision_json "${1:?key}" "${2:?version}" "${3:?commit}"
    ;;

  rollback)
    TARGET="${1:?revision id}"
    log "Plan: move endpoint $WEB_ENDPOINT_NAME from $(current_revision) back to $TARGET"
    confirmed "roll back chronas-api" || exit 0
    point_endpoint_at "$TARGET"
    ;;

  scale)
    # Deploys keep the endpoint's scalingConfig; only this changes it.
    TARGET="${1:?maxEnvironments}"
    [[ "$TARGET" =~ ^[0-9]+$ ]] && (( TARGET >= 2 )) || die "maxEnvironments must be a whole number >= 2"
    CURRENT="$(web_cli get-web-function-endpoint --function-name "$WEB_FUNCTION_NAME" --endpoint-name "$WEB_ENDPOINT_NAME" --output json)"
    log "Plan: endpoint $WEB_ENDPOINT_NAME scalingConfig $(jq -c '.scalingConfig // {}' <<< "$CURRENT") -> {\"maxEnvironments\":$TARGET}"
    log "      Under continuous traffic Lambda keeps about maxEnvironments running; each is billed for its memory."
    confirmed "scale chronas-api to $TARGET" || exit 0
    DIR="$(backup_dir web-function-scale)"
    printf '%s\n' "$CURRENT" > "$DIR/endpoint.json"
    log "Snapshot: $DIR/endpoint.json"
    web_cli update-web-function-endpoint --function-name "$WEB_FUNCTION_NAME" --endpoint-name "$WEB_ENDPOINT_NAME" \
      --scaling-config "{\"maxEnvironments\":$TARGET}" --query updateStatus --output text >&2
    web_cli wait web-function-endpoint-updated --function-name "$WEB_FUNCTION_NAME" --endpoint-name "$WEB_ENDPOINT_NAME"
    bash "$0" status
    ;;

  role-policy)
    # put-role-policy replaces the whole inline policy, so always apply the
    # file as a whole and show the diff against the live policy first.
    POLICY_FILE="$EDGE_DIR/web-function-role-policy.json"
    CURRENT="$(aws_cli iam get-role-policy --role-name "$WEB_ROLE_NAME" --policy-name chronas-api-web-access --query PolicyDocument --output json)"
    if diff <(jq -S . <<< "$CURRENT") <(jq -S . "$POLICY_FILE") >&2; then
      log "Role policy already matches $POLICY_FILE"
      exit 0
    fi
    log "Plan: replace the inline policy chronas-api-web-access of $WEB_ROLE_NAME with $POLICY_FILE (diff above: live < > file)"
    confirmed "update chronas-api role policy" || exit 0
    DIR="$(backup_dir web-function-role-policy)"
    printf '%s\n' "$CURRENT" > "$DIR/role-policy.json"
    log "Snapshot: $DIR/role-policy.json"
    aws_cli iam put-role-policy --role-name "$WEB_ROLE_NAME" --policy-name chronas-api-web-access --policy-document "file://$POLICY_FILE"
    log "Applied; environments started from now on get the new permissions"
    ;;

  allow-distribution|revoke-distribution)
    DIST="${1:?distribution id}"
    MODE="${ACTION%%-*}"
    log "Plan: $MODE CloudFront distribution $DIST to invoke endpoint $WEB_ENDPOINT_NAME"
    confirmed "$MODE $DIST" || exit 0
    put_distribution_access "$MODE" "$DIST"
    ;;

  *) die "usage: web-function.sh status|provision|deploy|rollback|scale|role-policy|allow-distribution|revoke-distribution" ;;
esac
