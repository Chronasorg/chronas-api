# 🚀 Chronas API Lambda Deployment Guide

## Overview

This guide covers the automated deployment of the Chronas API to AWS Lambda using the existing `ChronasApiLambaStack` CDK infrastructure. The deployment process has been enhanced with comprehensive automation, validation, and testing.

## 📋 Prerequisites

### Required Software
- **Node.js 22.x** - Runtime environment
- **AWS CLI** - AWS command line interface
- **CDK CLI** - AWS Cloud Development Kit
- **npm** - Package manager

### AWS Configuration
- **AWS Profiles**: `chronas-dev` and `chronas-prod` configured
- **AWS Credentials**: Valid credentials for both environments
- **AWS Permissions**: Lambda, API Gateway, CloudFormation, Secrets Manager access

### Project Structure
```
chronas-api/
├── lambda-handler.js          # Lambda entry point
├── package.json               # Dependencies and scripts
├── scripts/
│   ├── deploy-lambda.js       # Automated deployment script
│   └── validate-deployment.js # Deployment validation
└── PostmanTests/              # API validation tests

chronas-cdk/
├── lib/
│   └── chronas-api-lambda-stack.ts  # Lambda infrastructure
└── bin/
    └── chronas-cdk.ts         # CDK application
```

## 🔧 Quick Start

### 1. Validate Deployment Readiness
```bash
npm run validate:deployment
```

### 2. Deploy to Development
```bash
npm run deploy:lambda:dev
```

### 3. Deploy to Production
```bash
npm run deploy:lambda:prod
```

## 📜 Available Commands

### Deployment Commands
```bash
# Deploy to development (default)
npm run deploy:lambda
npm run deploy:lambda:dev

# Deploy to production
npm run deploy:lambda:prod

# Dry run (show what would be deployed)
npm run deploy:lambda:dry-run

# Show help and options
npm run deploy:lambda -- --help
```

### Validation Commands
```bash
# Validate deployment readiness
npm run validate:deployment

# Run tests manually
npm test
npm run test:integration
npm run test:postman:dev
```

### Legacy Commands (still available)
```bash
# Direct CDK deployment
npm run deploy:dev
npm run deploy:prod
```

## 🚀 Deployment Process

The automated deployment script (`scripts/deploy-lambda.js`) performs the following steps:

### 1. **Prerequisites Check** ✅
- Validates project structure
- Checks AWS CLI and CDK availability
- Verifies AWS credentials and profiles
- Confirms CDK directory structure

### 2. **Testing Phase** 🧪
- Runs unit tests (28 tests)
- Runs integration tests (15 tests)
- Can be skipped with `--skip-tests` flag

### 3. **Build Phase** 🔨
- Installs production dependencies
- Runs application build scripts
- Can be skipped with `--skip-build` flag

### 4. **CDK Build** 🏗️
- Installs CDK dependencies
- Compiles TypeScript CDK code
- Prepares infrastructure definitions

### 5. **Deployment** 🚀
- Deploys `ChronasApiLambdaStackV2` to AWS
- Uses CDK for infrastructure as code
- Automatically bundles Lambda code
- Configures VPC, secrets, and permissions

### 6. **Validation** 🔍
- Retrieves stack outputs
- Checks Lambda function status
- Tests API Gateway endpoints
- Validates health endpoints

### 7. **Post-Deployment Testing** 🧪
- Runs Postman API tests
- Validates all endpoints
- Confirms DocumentDB connectivity

## 🌍 Environment Configuration

### Development Environment
- **AWS Profile**: `chronas-dev`
- **AWS Region**: `eu-west-1`
- **Stack Name**: `ChronasApiLambdaStackV2`
- **DocumentDB**: Development cluster
- **API Gateway**: Development stage

### Production Environment
- **AWS Profile**: `chronas-prod`
- **AWS Region**: `eu-west-1`
- **Stack Name**: `ChronasApiLambdaStackV2`
- **DocumentDB**: Production cluster
- **API Gateway**: Production stage

## 🔧 Advanced Usage

### Command Line Options
```bash
# Skip tests (faster deployment)
npm run deploy:lambda dev -- --skip-tests

# Skip build (if already built)
npm run deploy:lambda dev -- --skip-build

# Dry run (preview changes)
npm run deploy:lambda dev -- --dry-run

# Combine options
npm run deploy:lambda dev -- --skip-tests --skip-build
```

### Environment Variables
The deployment script respects these environment variables:
- `AWS_PROFILE` - Override AWS profile
- `AWS_DEFAULT_REGION` - Override AWS region

### Manual CDK Commands
```bash
# Navigate to CDK directory
cd ../chronas-cdk

# Show what would be deployed
npx cdk diff ChronasApiLambdaStackV2 --profile chronas-dev

# Deploy manually
npx cdk deploy ChronasApiLambdaStackV2 --profile chronas-dev

# View stack outputs
aws cloudformation describe-stacks --stack-name ChronasApiLambdaStackV2 --profile chronas-dev
```

## 🏗️ Infrastructure Details

### Lambda Function Configuration
- **Runtime**: Node.js 22.x
- **Memory**: 1024 MB
- **Timeout**: 30 seconds
- **VPC**: Deployed in private subnets
- **Tracing**: AWS X-Ray enabled
- **Concurrency**: 10 reserved executions

### Permissions
- **Secrets Manager**: Access to database and config secrets
- **VPC**: Network interface management
- **X-Ray**: Tracing permissions
- **CloudWatch**: Logging permissions

### Monitoring
- **CloudWatch Logs**: `/aws/lambda/ChronasApiLambdaStackV2-ChronasApiLambdaFunction`
- **CloudWatch Metrics**: Invocations, errors, duration, throttles
- **CloudWatch Alarms**: Error rate and duration monitoring
- **X-Ray Tracing**: Request tracing and performance analysis

## 🔍 Troubleshooting

### Common Issues

#### 1. AWS Credentials Error
```
Error: Unable to locate credentials
```
**Solution**: Configure AWS profiles
```bash
aws configure --profile chronas-dev
aws configure --profile chronas-prod
```

#### 2. CDK Bootstrap Required
```
Error: This stack uses assets, so the toolkit stack must be deployed
```
**Solution**: Bootstrap CDK in the target account
```bash
npx cdk bootstrap --profile chronas-dev
```

#### 3. Lambda Function Not Found
```
Error: Function not found
```
**Solution**: Ensure stack is deployed and check stack name
```bash
aws lambda list-functions --profile chronas-dev
```

#### 4. VPC Configuration Issues
```
Error: ENI creation failed
```
**Solution**: Check VPC and subnet configuration in CDK stack

#### 5. Secrets Manager Access Denied
```
Error: User is not authorized to perform: secretsmanager:GetSecretValue
```
**Solution**: Verify IAM permissions for Lambda execution role

### Debug Commands

#### Check Lambda Function Status
```bash
aws lambda get-function --function-name ChronasApiLambdaStackV2-ChronasApiLambdaFunction --profile chronas-dev
```

#### View Lambda Logs
```bash
aws logs tail /aws/lambda/ChronasApiLambdaStackV2-ChronasApiLambdaFunction --follow --profile chronas-dev
```

#### Test API Endpoint
```bash
# Get API Gateway URL from stack outputs
aws cloudformation describe-stacks --stack-name ApiGatewayStackV2 --profile chronas-dev --query "Stacks[0].Outputs"

# Test health endpoint
curl https://YOUR-API-URL/v1/health
```

#### Check Stack Status
```bash
aws cloudformation describe-stacks --stack-name ChronasApiLambdaStackV2 --profile chronas-dev
```

## 📊 Monitoring and Logging

### CloudWatch Logs
- **Log Group**: `/aws/lambda/ChronasApiLambdaStackV2-ChronasApiLambdaFunction`
- **Retention**: Configured in CDK stack
- **Access**: Via AWS Console or CLI

### CloudWatch Metrics
- **Invocations**: Number of function invocations
- **Errors**: Number of function errors
- **Duration**: Function execution time
- **Throttles**: Number of throttled invocations
- **Concurrent Executions**: Number of concurrent executions

### CloudWatch Alarms
- **Error Alarm**: Triggers when error rate > 5 in 2 periods
- **Duration Alarm**: Triggers when duration > 25 seconds for 3 periods

### X-Ray Tracing
- **Service Map**: Visual representation of service dependencies
- **Traces**: Individual request traces
- **Performance**: Response time analysis

## 🔄 Rollback Procedures

### Automatic Rollback
- Failed deployments automatically stop
- Previous Lambda version remains active
- CloudFormation stack rollback on failure

### Manual Rollback
1. **Identify Previous Version**:
   ```bash
   aws lambda list-versions-by-function --function-name ChronasApiLambdaStackV2-ChronasApiLambdaFunction --profile chronas-dev
   ```

2. **Update Alias to Previous Version**:
   ```bash
   aws lambda update-alias --function-name ChronasApiLambdaStackV2-ChronasApiLambdaFunction --name LIVE --function-version PREVIOUS_VERSION --profile chronas-dev
   ```

3. **Or Redeploy Previous Code**:
   ```bash
   git checkout PREVIOUS_COMMIT
   npm run deploy:lambda:dev
   ```

## 📈 Performance Optimization

### Lambda Optimization
- **Memory**: Adjust based on usage patterns
- **Timeout**: Optimize for typical response times
- **Concurrency**: Set reserved concurrency for predictable performance
- **VPC**: Consider Lambda outside VPC for better cold start performance

### Code Optimization
- **Bundle Size**: Exclude unnecessary files and dependencies
- **Connection Pooling**: Reuse database connections
- **Secrets Caching**: Cache secrets to reduce API calls
- **Error Handling**: Implement proper error handling and retries

## 🔐 Security Considerations

### IAM Permissions
- **Least Privilege**: Lambda execution role has minimal required permissions
- **Secrets Access**: Restricted to specific secrets
- **VPC Access**: Network isolation through VPC deployment

### Network Security
- **VPC Deployment**: Lambda runs in private subnets
- **Security Groups**: Restrict network access
- **NAT Gateway**: Outbound internet access for API calls

### Data Security
- **Secrets Manager**: Database credentials stored securely
- **TLS**: All database connections use TLS encryption
- **X-Ray**: Sensitive data excluded from traces

## 📚 Additional Resources

### Documentation
- [AWS Lambda Developer Guide](https://docs.aws.amazon.com/lambda/latest/dg/)
- [AWS CDK Developer Guide](https://docs.aws.amazon.com/cdk/latest/guide/)
- [DocumentDB Developer Guide](https://docs.aws.amazon.com/documentdb/latest/developerguide/)

### Monitoring
- [CloudWatch Lambda Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Lambda-Insights.html)
- [X-Ray Developer Guide](https://docs.aws.amazon.com/xray/latest/devguide/)

### Best Practices
- [Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [CDK Best Practices](https://docs.aws.amazon.com/cdk/latest/guide/best-practices.html)

---

## 🎯 Summary

The enhanced Lambda deployment process provides:

- ✅ **Automated deployment** with comprehensive validation
- ✅ **Environment-specific** configuration (dev/prod)
- ✅ **Quality gates** with automated testing
- ✅ **Infrastructure as code** with CDK
- ✅ **Monitoring and alerting** with CloudWatch
- ✅ **Security best practices** with VPC and secrets management
- ✅ **Easy rollback** procedures
- ✅ **Comprehensive documentation** and troubleshooting

**The DocumentDB 5.0 modernized Chronas API is now ready for production deployment with enterprise-grade automation!** 🚀