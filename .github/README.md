# GitHub Actions CI/CD Pipeline

This directory contains the GitHub Actions workflow configuration for automated deployment of the Chronas API to AWS Lambda.

## 📁 Files

- **`workflows/deploy.yml`** - Main CI/CD pipeline workflow
- **`SECRETS.md`** - Required secrets configuration guide
- **`README.md`** - This documentation file

## 🚀 Workflow Overview

The CI/CD pipeline provides automated testing, building, and deployment for the Chronas API with the following stages:

### 1. **Test Stage**
- Runs on all pushes and pull requests
- Executes ESLint code quality checks
- Runs unit tests (28 tests)
- Runs integration tests (15 tests)
- Uses Node.js 22.x runtime

### 2. **Build Stage**
- Creates optimized Lambda deployment package
- Bundles dependencies for production
- Uploads build artifacts for deployment stages

### 3. **Deploy to Development**
- **Trigger**: Push to `feature/modernize-api` branch
- **Environment**: Development AWS account
- **CDK Stack**: Deploys infrastructure changes
- **Validation**: Runs Postman API tests

### 4. **Deploy to Production**
- **Trigger**: Push to `main` branch
- **Environment**: Production AWS account (with approval)
- **CDK Stack**: Deploys infrastructure changes
- **Validation**: Runs comprehensive Postman tests
- **Monitoring**: Includes deployment notifications

## 🔧 Setup Instructions

### 1. Configure AWS Credentials

Create IAM users for development and production with required permissions:

```bash
# Development user policies
- AWSLambdaFullAccess
- AmazonAPIGatewayAdministrator
- CloudFormationFullAccess
- IAMFullAccess
- AmazonS3FullAccess
- AmazonDocumentDBFullAccess
```

### 2. Add GitHub Secrets

Navigate to **Settings** → **Secrets and variables** → **Actions** and add:

#### Development Secrets
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `DEV_API_BASE_URL`

#### Production Secrets
- `PROD_AWS_ACCESS_KEY_ID`
- `PROD_AWS_SECRET_ACCESS_KEY`
- `PROD_API_BASE_URL`

### 3. Configure Environments

Create GitHub Environments:
- **development** - Auto-deploy from feature branch
- **production** - Requires approval for main branch

### 4. Bootstrap CDK (One-time setup)

```bash
# Development account
npx cdk bootstrap aws://DEV-ACCOUNT-ID/eu-west-1 --profile chronas-dev

# Production account
npx cdk bootstrap aws://PROD-ACCOUNT-ID/eu-west-1 --profile chronas-prod
```

## 🧪 Testing the Workflow

### Validate Configuration
```bash
npm run validate:workflow
```

### Test Locally Before Push
```bash
# Run all tests
npm test
npm run test:integration
npm run lint

# Test Postman collection
npm run test:postman

# Validate CDK
cd ../chronas-cdk
npm run build
npx cdk synth
```

## 📊 Workflow Triggers

| Event | Branch | Action |
|-------|--------|--------|
| Push | `main` | Deploy to Production |
| Push | `feature/modernize-api` | Deploy to Development |
| Pull Request | Any → `main` | Run Tests Only |
| Manual | Any | Deploy via UI |

## 🔍 Monitoring & Debugging

### GitHub Actions Logs
- Check the **Actions** tab for workflow execution logs
- Each job provides detailed step-by-step output
- Failed steps include error messages and stack traces

### AWS CloudWatch
- Lambda function logs: `/aws/lambda/chronas-api-function`
- API Gateway logs: Enable in AWS Console
- CDK deployment logs: CloudFormation events

### API Health Checks
```bash
# Development
curl https://DEV-API-URL/v1/health

# Production
curl https://PROD-API-URL/v1/health
```

## 🚨 Troubleshooting

### Common Issues

#### 1. AWS Credentials Error
```
Error: The security token included in the request is invalid
```
**Solution**: Verify AWS credentials in GitHub secrets

#### 2. CDK Bootstrap Required
```
Error: This stack uses assets, so the toolkit stack must be deployed
```
**Solution**: Run CDK bootstrap in target account

#### 3. Test Failures
```
Error: Tests failed with exit code 1
```
**Solution**: Check test logs and fix failing tests locally

#### 4. Postman Tests Fail
```
Error: API endpoint not responding
```
**Solution**: Verify API deployment and endpoint URLs

### Debug Steps

1. **Check Workflow Syntax**:
   ```bash
   # Validate YAML syntax
   yamllint .github/workflows/deploy.yml
   ```

2. **Test Scripts Locally**:
   ```bash
   npm run validate:workflow
   npm test
   npm run test:integration
   ```

3. **Verify CDK Configuration**:
   ```bash
   cd ../chronas-cdk
   npx cdk ls
   npx cdk diff
   ```

## 🔄 Rollback Procedures

### Automatic Rollback
- Failed deployments stop the pipeline
- Previous Lambda version remains active
- No automatic rollback to previous version

### Manual Rollback
1. **Identify Last Working Commit**:
   ```bash
   git log --oneline
   ```

2. **Revert Changes**:
   ```bash
   git revert <commit-hash>
   git push origin main
   ```

3. **Or Deploy Previous Version**:
   ```bash
   git checkout <previous-commit>
   git push origin main --force
   ```

## 📈 Performance Metrics

### Build Times
- **Test Stage**: ~2-3 minutes
- **Build Stage**: ~1-2 minutes
- **Deploy Stage**: ~3-5 minutes
- **Total Pipeline**: ~6-10 minutes

### Success Rates
- Target: >95% success rate
- Monitor via GitHub Actions insights
- Track deployment frequency and lead time

## 🔐 Security Considerations

### Secrets Management
- Use GitHub Secrets for sensitive data
- Rotate AWS credentials regularly
- Use least-privilege IAM policies
- Enable MFA on AWS accounts

### Code Security
- ESLint security rules enabled
- Dependency vulnerability scanning
- No secrets in code or logs
- Secure environment variable handling

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [AWS CDK Guide](https://docs.aws.amazon.com/cdk/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Chronas API Documentation](../README.md)

---

## 🎯 Next Steps

After setting up the workflow:

1. **Test the Pipeline**: Push a small change to trigger deployment
2. **Monitor Performance**: Check deployment times and success rates
3. **Set Up Alerts**: Configure notifications for failed deployments
4. **Document Processes**: Update team documentation with deployment procedures

---

*This CI/CD pipeline supports the DocumentDB 5.0 modernized Chronas API with Node.js 22.x runtime.*