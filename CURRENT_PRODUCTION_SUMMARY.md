# Current Production Setup Summary

Last verified: 2026-04-06
AWS Account: chronas-prod, Region: eu-west-1

## Lambda Functions

### ChronasApiLambdaStackV2-ChronasApiLambdaFunction7C-UhX6kGn4FXqM
- **Runtime**: nodejs22.x
- **Handler**: lambda-handler.handler
- **Memory**: 512MB
- **Timeout**: 30s
- **Package**: Zip (S3)
- **Last Modified**: 2026-03-10

### ChronasFrontendS3Stack-CustomS3AutoDeleteObjectsCu-Ui7ewcHUZewT
- **Runtime**: nodejs18.x
- **Memory**: 128MB
- **Purpose**: S3 auto-delete custom resource (CDK-managed)

## API Gateway

### ChronasApiGateway
- **Type**: HTTP API (API Gateway v2)
- **Endpoint**: https://2g4uy0bdoe.execute-api.eu-west-1.amazonaws.com
- **Custom Domain**: api.chronas.org (TLS 1.2, regional)

## DocumentDB

### databaseb269d8bb-phnragzw0yth
- **Status**: available
- **Endpoint**: databaseb269d8bb-phnragzw0yth.cluster-cstwu7mt2svi.eu-west-1.docdb.amazonaws.com
- **Port**: 27017
- **Auth**: SCRAM-SHA-1, TLS required
- **Credentials**: AWS Secrets Manager `/chronas/docdb/newpassword`

## CloudFormation Stacks (active)

| Stack | Status | Description |
|-------|--------|-------------|
| ChronasApiLambdaStackV2 | UPDATE_COMPLETE | Lambda function + config |
| ApiGatewayStack | UPDATE_COMPLETE | HTTP API Gateway |
| NetworkStack | UPDATE_COMPLETE | VPC for DocumentDB |
| SecretStack | UPDATE_COMPLETE | Secrets Manager secrets |
| DnsStack | UPDATE_COMPLETE | Route 53 DNS |
| ChronasFrontendS3Stack | UPDATE_COMPLETE | Frontend S3 hosting |
| CloudwatchStack | UPDATE_COMPLETE | Monitoring |
| CDKToolkit | UPDATE_COMPLETE | CDK bootstrap |

## S3 Buckets

- **chronas-frontend-new** — Current frontend hosting
- **chronas-frontend-937826731833** — Previous frontend bucket
- **cdk-hnb659fds-assets-***: CDK asset staging buckets

## App Secrets

- `/chronas/docdb/newpassword` — DocumentDB credentials (host, username, password, port)
- `/chronas/secrets` — App config (OAuth keys, JWT secret, etc.)
