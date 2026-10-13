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

ALARM_TOPIC_ARN="arn:aws:sns:${REGION}:${ACCOUNT_ID}:CloudWatch_Alarm_aumannjoachim"

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
