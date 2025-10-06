# 🚀 AWS CodeBuild Automated Lambda Deployment

## Overview

The Chronas API now has automated Lambda deployment via AWS CodeBuild. Every push to the `main` branch automatically triggers a build and deployment process that:

1. **Tests** the code (unit + integration tests)
2. **Builds** the CDK infrastructure
3. **Deploys** the Lambda function to AWS
4. **Validates** the deployment with API tests

## 🏗️ Infrastructure

### CodeBuild Project: `chronas-api-lambda-deploy`

The deployment is handled by a CodeBuild project defined in the `BuildChronasAPiStack`:

- **Trigger**: Push to `main` branch in `Chronasorg/chronas-api` repository
- **Environment**: Amazon Linux 2.5 with Node.js 22
- **Runtime**: ~15-30 minutes (including tests and deployment)
- **Target**: `ChronasApiLambdaStackV2` in `eu-west-1` region

### Build Phases

#### 1. **Install Phase** 📦
- Installs Node.js 22 runtime
- Installs AWS CDK CLI globally
- Verifies tool versions

#### 2. **Pre-Build Phase** 🧪
- Installs chronas-api dependencies (`npm ci`)
- Installs chronas-cdk dependencies
- Runs unit tests (28 tests)
- Runs integration tests (15 tests)

#### 3. **Build Phase** 🔨
- Builds CDK TypeScript code
- Deploys `ChronasApiLambdaStackV2` using CDK
- Updates Lambda function with latest code

#### 4. **Post-Build Phase** ✅
- Retrieves CloudFormation stack outputs
- Waits for Lambda function to be ready
- Runs Postman API validation tests
- Reports deployment status

## 🔧 Configuration Files

### `buildspec.yml`
Located in `chronas-api/buildspec.yml` - defines the build process for CodeBuild.

### CDK Stack Configuration
The CodeBuild project is defined in `chronas-cdk/lib/build-chronas-api-stack.ts`:

```typescript
new codebuild.Project(this, 'chronas-api-lambda-deploy', {
  projectName: 'chronas-api-lambda-deploy',
  source: codebuild.Source.gitHub({
    owner: 'Chronasorg',
    repo: 'chronas-api',
    webhook: true,
    webhookFilters: [
      codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH)
        .andBranchIs('main'), // Only main branch
    ],
  }),
  // ... environment and build configuration
});
```

## 🚀 Deployment Process

### Automatic Deployment
1. **Push to main branch** in the chronas-api repository
2. **GitHub webhook** triggers CodeBuild project
3. **CodeBuild** executes the build process:
   - Runs all tests
   - Builds and deploys Lambda function
   - Validates deployment
4. **Deployment complete** - Lambda function is updated

### Manual Deployment (Fallback)
If needed, you can still deploy manually:

```bash
# Local deployment (development)
npm run deploy:lambda:dev

# Local deployment (production)
npm run deploy:lambda:prod
```

## 📊 Monitoring

### CodeBuild Console
- **Project**: `chronas-api-lambda-deploy`
- **Location**: AWS Console → CodeBuild → Build projects
- **Logs**: Available in CloudWatch Logs

### Build Status
- **Success**: Lambda function deployed successfully
- **Failure**: Check CodeBuild logs for errors
- **Duration**: Typically 15-30 minutes

### CloudWatch Logs
- **Build Logs**: `/aws/codebuild/chronas-api-lambda-deploy`
- **Lambda Logs**: `/aws/lambda/ChronasApiLambdaStackV2-ChronasApiLambdaFunction`

## 🔍 Troubleshooting

### Common Issues

#### 1. Build Fails on Tests
```
Error: Tests failed with exit code 1
```
**Solution**: Fix failing tests before pushing to main branch

#### 2. CDK Deployment Fails
```
Error: Stack update failed
```
**Solution**: Check CloudFormation events in AWS Console

#### 3. Permission Denied
```
Error: User is not authorized to perform action
```
**Solution**: Verify CodeBuild role has necessary permissions

#### 4. Timeout
```
Error: Build timed out after 30 minutes
```
**Solution**: Check for hanging processes or increase timeout

### Debug Steps

#### 1. Check Build Logs
```bash
# View recent builds
aws codebuild list-builds-for-project --project-name chronas-api-lambda-deploy

# Get build details
aws codebuild batch-get-builds --ids BUILD_ID
```

#### 2. Check Lambda Function
```bash
# Verify function exists and is updated
aws lambda get-function --function-name ChronasApiLambdaStackV2-ChronasApiLambdaFunction

# Check function logs
aws logs tail /aws/lambda/ChronasApiLambdaStackV2-ChronasApiLambdaFunction --follow
```

#### 3. Test API Manually
```bash
# Get API Gateway URL from stack outputs
aws cloudformation describe-stacks --stack-name ApiGatewayStackV2 --query "Stacks[0].Outputs"

# Test health endpoint
curl https://YOUR-API-URL/v1/health
```

## 🔐 Security

### IAM Permissions
The CodeBuild project has permissions for:
- **CloudFormation**: Stack management
- **Lambda**: Function deployment
- **API Gateway**: API management
- **Secrets Manager**: Access to secrets
- **VPC**: Network interface management
- **X-Ray**: Tracing

### GitHub Integration
- **Webhook**: Secure webhook from GitHub to CodeBuild
- **Source**: Read-only access to chronas-api repository
- **Branch Filter**: Only main branch triggers deployment

## 📈 Performance

### Build Optimization
- **Caching**: Node modules cached between builds
- **Parallel**: Tests run in parallel where possible
- **Incremental**: Only changed code triggers full rebuild

### Deployment Speed
- **Typical Duration**: 15-30 minutes
- **Test Phase**: ~5-10 minutes
- **Build Phase**: ~5-10 minutes
- **Deploy Phase**: ~5-15 minutes

## 🔄 Rollback

### Automatic Rollback
- **Failed Deployment**: Previous Lambda version remains active
- **CloudFormation**: Automatic rollback on stack update failure

### Manual Rollback
```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or deploy specific version locally
git checkout PREVIOUS_COMMIT
npm run deploy:lambda:dev
```

## 📋 Best Practices

### Development Workflow
1. **Feature Branch**: Develop in feature branches
2. **Pull Request**: Create PR to main branch
3. **Review**: Code review before merge
4. **Merge**: Merge triggers automatic deployment
5. **Monitor**: Check deployment status in CodeBuild

### Code Quality
- **Tests**: Ensure all tests pass before pushing
- **Linting**: Fix linting issues (optional but recommended)
- **Dependencies**: Keep dependencies up to date

### Deployment Safety
- **Small Changes**: Make incremental changes
- **Test Locally**: Test changes locally first
- **Monitor**: Watch deployment logs
- **Rollback Plan**: Be ready to rollback if needed

## 🎯 Benefits

### Automation
- ✅ **Zero-touch deployment** on main branch changes
- ✅ **Consistent process** every time
- ✅ **Quality gates** with automated testing
- ✅ **Fast feedback** on deployment status

### Reliability
- ✅ **Tested code** only gets deployed
- ✅ **Infrastructure as code** with CDK
- ✅ **Automatic rollback** on failures
- ✅ **Comprehensive logging** for debugging

### Developer Experience
- ✅ **Simple workflow**: Just push to main
- ✅ **No manual steps** required
- ✅ **Clear feedback** via build status
- ✅ **Fallback options** for manual deployment

---

## 🎉 Summary

The Chronas API now has **enterprise-grade automated deployment** via AWS CodeBuild:

- **✅ Automatic**: Deploys on every main branch push
- **✅ Tested**: Quality gates ensure only working code is deployed
- **✅ Fast**: 15-30 minute deployment cycle
- **✅ Reliable**: Built-in rollback and error handling
- **✅ Monitored**: Comprehensive logging and status reporting

**The DocumentDB 5.0 modernized Chronas API is now production-ready with automated CI/CD!** 🚀