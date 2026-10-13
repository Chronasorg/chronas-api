# Shared constants for infra/api-edge. Sourced, not executed.
# Values from read-only inspection on 2026-10-13
# (docs/API_CLOUDFRONT_WEB_FUNCTIONS_PLAN.md §4.4). Scripts check the live
# state against these and refuse to act on drift.

ACCOUNT_ID="937826731833"
REGION="eu-west-1"
PROFILE="${AWS_EDGE_PROFILE:-chronas-prod}"

DISTRIBUTION_ID="E1KTIK2H0W8J2Q"
DISTRIBUTION_DOMAIN="d24mkpax7rmotx.cloudfront.net"
DISTRIBUTION_ARN="arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DISTRIBUTION_ID}"
CERTIFICATE_ARN="arn:aws:acm:us-east-1:${ACCOUNT_ID}:certificate/b9685497-6e5f-4965-ab54-7f1ea1aee8ec"

HOSTED_ZONE_ID="Z005461139KF8GDMY491N"
RECORD_NAME="api.chronas.org."
# Alias target zone for every CloudFront distribution (Route 53 docs).
CLOUDFRONT_ALIAS_ZONE="Z2FDTNDATAQYW2"
# The record as it was before the cutover; route53.sh rollback restores exactly this.
APIGW_ALIAS_DNS="d-hghcknax0i.execute-api.eu-west-1.amazonaws.com."
APIGW_ALIAS_ZONE="ZLY8HYME6SFDD"
APIGW_ALIAS_EVALUATE_HEALTH="true"

API_ID="2g4uy0bdoe"
API_STAGE='$default'
API_DIRECT_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com"
API_ACCESS_LOG_GROUP_ARN="arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:ApiGatewayStack-ChronasApiGatewayAPIGWAccessLogsA52DB10A-iojowSf05IEk"

LAMBDA_LOG_GROUP="/aws/lambda/ChronasApiLambdaStackV2-ChronasApiLambdaFunction7C-UhX6kGn4FXqM"
ALARM_TOPIC_ARN="arn:aws:sns:${REGION}:${ACCOUNT_ID}:CloudWatch_Alarm_aumannjoachim"

# Standard logging v2 is configured through the CloudWatch Logs API in
# us-east-1; the log group name may only contain [\w-].
CF_LOG_GROUP="chronas-api-cloudfront-access"
CF_LOG_RETENTION_DAYS=14

TEST_DISTRIBUTION_COMMENT="chronas-api P3 throwaway test distribution (delete after use)"

# Lambda Web Function (plan §5, INF-2). Needs AWS CLI >= 2.37.13 for
# `aws lambda-web`; set AWS_WEB_CLI to its path if the default `aws` is older.
WEB_FUNCTION_NAME="chronas-api"
WEB_ENDPOINT_NAME="prod"
WEB_FUNCTION_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:web-function/${WEB_FUNCTION_NAME}"
WEB_ROLE_NAME="chronas-api-web-function-role"
WEB_ARTIFACT_BUCKET="chronas-lambda-web-artifacts"
WEB_OAC_NAME="chronas-api-web-oac"
WEB_LOG_GROUP="/aws/lambda/web/${WEB_FUNCTION_NAME}"
WEB_LOG_RETENTION_DAYS=3
SECRET_ARN="arn:aws:secretsmanager:${REGION}:${ACCOUNT_ID}:secret:/chronas/secrets-YDUZQG"
