# GitHub Actions Secrets Configuration

This document describes the required secrets for the GitHub Actions CI/CD pipeline.

## Required Secrets

### Development Environment

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `AWS_ACCESS_KEY_ID` | AWS Access Key for development | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS Secret Key for development | `wJalrXUt...` |
| `DEV_API_BASE_URL` | Development API base URL | `https://api-dev.chronas.org` |

### Production Environment

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `PROD_AWS_ACCESS_KEY_ID` | AWS Access Key for production | `AKIA...` |
| `PROD_AWS_SECRET_ACCESS_KEY` | AWS Secret Key for production | `wJalrXUt...` |
| `PROD_API_BASE_URL` | Production API base URL | `https://api.chronas.org` |

## Setup Instructions

### 1. Create AWS IAM Users

Create separate IAM users for development and production with the following policies:

#### Development User Policies
- `AWSLambdaFullAccess`
- `AmazonAPIGatewayAdministrator`
- `CloudFormationFullAccess`
- `IAMFullAccess` (for CDK role creation)
- `AmazonS3FullAccess` (for CDK assets)
- `AmazonDocumentDBFullAccess`

#### Production User Policies
- `AWSLambdaFullAccess`
- `AmazonAPIGatewayAdministrator`
- `CloudFormationFullAccess`
- `IAMFullAccess` (for CDK role creation)
- `AmazonS3FullAccess` (for CDK assets)
- `AmazonDocumentDBFullAccess`

### 2. Configure GitHub Secrets

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret from the tables above

### 3. Environment Configuration

The workflow uses GitHub Environments for additional security:

#### Development Environment
- **Name**: `development`
- **Protection rules**: None (auto-deploy on feature branch)
- **Secrets**: Development AWS credentials

#### Production Environment
- **Name**: `production`
- **Protection rules**: 
  - Required reviewers (recommended)
  - Wait timer (optional)
- **Secrets**: Production AWS credentials

## Security Best Practices

### AWS Credentials
- Use IAM users with minimal required permissions
- Rotate access keys regularly
- Enable MFA on IAM users
- Use separate AWS accounts for dev/prod if possible

### GitHub Secrets
- Never log secret values in workflows
- Use environment-specific secrets
- Regularly audit secret usage
- Remove unused secrets

### CDK Deployment
- Use CDK context for environment-specific configuration
- Store sensitive configuration in AWS Secrets Manager
- Use AWS IAM roles for cross-service access

## Troubleshooting

### Common Issues

#### AWS Credentials Invalid
```
Error: The security token included in the request is invalid
```
**Solution**: Check that AWS credentials are correct and have proper permissions.

#### CDK Bootstrap Required
```
Error: This stack uses assets, so the toolkit stack must be deployed
```
**Solution**: Run CDK bootstrap in the target AWS account:
```bash
npx cdk bootstrap aws://ACCOUNT-NUMBER/REGION --profile chronas-dev
```

#### Permission Denied
```
Error: User is not authorized to perform: lambda:UpdateFunctionCode
```
**Solution**: Ensure the IAM user has the required Lambda permissions.

### Debug Steps

1. **Check AWS Credentials**:
   ```bash
   aws sts get-caller-identity --profile chronas-dev
   ```

2. **Verify CDK Context**:
   ```bash
   cd chronas-cdk
   npx cdk context --clear
   npx cdk ls
   ```

3. **Test Local Deployment**:
   ```bash
   npm run deploy:dev
   ```

## Workflow Triggers

### Automatic Triggers
- **Push to `main`**: Deploys to production
- **Push to `feature/modernize-api`**: Deploys to development
- **Pull Request**: Runs tests only

### Manual Triggers
- **workflow_dispatch**: Manual deployment via GitHub Actions UI

## Monitoring

### Deployment Status
- Check GitHub Actions tab for workflow status
- Monitor AWS CloudWatch for Lambda function logs
- Use API health endpoints for validation

### Post-Deployment Validation
- Automated Postman tests run after deployment
- Health check endpoints are validated
- Performance metrics are collected

## Rollback Procedures

### Automatic Rollback
- Failed deployments automatically stop the pipeline
- Previous Lambda version remains active

### Manual Rollback
1. Identify previous working deployment
2. Revert to previous commit
3. Push to trigger re-deployment
4. Or use AWS Lambda version management

## Support

For issues with the CI/CD pipeline:
1. Check GitHub Actions logs
2. Review AWS CloudFormation events
3. Check Lambda function logs in CloudWatch
4. Validate API endpoints manually

---

*This configuration supports the DocumentDB 5.0 modernized Chronas API deployment pipeline.*