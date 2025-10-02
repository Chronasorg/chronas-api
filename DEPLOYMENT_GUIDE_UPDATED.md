# Chronas API - Updated Deployment Guide

## Overview

This guide covers the deployment of the modernized Chronas API running on Node.js 22.x with DocumentDB 5.0.

**Last Updated**: October 2, 2025  
**API Version**: 1.3.5  
**Status**: ✅ Production Ready

---

## Current Infrastructure

### Runtime Environment
- **Platform**: AWS Lambda
- **Runtime**: Node.js 22.x
- **Framework**: Express.js with @vendia/serverless-express
- **Database**: Amazon DocumentDB 5.0.0
- **Deployment**: AWS CDK v2

### Key Components
- **Lambda Function**: `ChronasApiLambdaStackV2-ChronasApiLambdaFunction7C-b5U4C0YDGKS5`
- **API Gateway**: `https://9c3213bzri.execute-api.eu-west-1.amazonaws.com/v1/`
- **DocumentDB Cluster**: `databaseb269d8bb-nnxc5ntzb62u` (DocumentDB 5.0.0)
- **VPC**: Secure networking with proper security groups

---

## Prerequisites

### Development Environment
```bash
# Required tools
node --version  # Should be 22.x
npm --version   # Latest version
aws --version   # AWS CLI v2

# AWS CDK
npm install -g aws-cdk
cdk --version   # Should be 2.x
```

### AWS Configuration
```bash
# Configure AWS profile
aws configure --profile chronas-dev
# Region: eu-west-1
# Credentials: Your AWS access keys
```

---

## Deployment Process

### 1. Environment Setup
```bash
# Clone repository
git clone https://github.com/Chronasorg/chronas-api.git
cd chronas-api

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Configure your environment variables
```

### 2. Build and Test
```bash
# Run tests
npm test

# Run integration tests
npm run test:integration

# Validate with Postman (optional)
npx newman run PostmanTests/chronas-enhanced.postman_collection.json \
  -e PostmanTests/chronas-lambda-dev.postman_environment.json
```

### 3. CDK Deployment
```bash
# Navigate to CDK directory
cd ../chronas-cdk

# Install CDK dependencies
npm install

# Bootstrap CDK (first time only)
cdk bootstrap --profile chronas-dev --region eu-west-1

# Deploy infrastructure
cdk deploy ChronasApiLambdaStackV2 --profile chronas-dev --region eu-west-1
```

### 4. Verify Deployment
```bash
# Test API health
curl https://9c3213bzri.execute-api.eu-west-1.amazonaws.com/v1/health

# Test welcome endpoint
curl https://9c3213bzri.execute-api.eu-west-1.amazonaws.com/v1/version/welcome

# Run full test suite
npx newman run PostmanTests/chronas-enhanced.postman_collection.json \
  -e PostmanTests/chronas-lambda-dev.postman_environment.json
```

---

## Configuration

### Environment Variables
```bash
# Required environment variables
NODE_ENV=production
DB_HOST=your-docdb-cluster-endpoint
DB_PORT=27017
DB_NAME=chronas
JWT_SECRET=your-jwt-secret
```

### DocumentDB Connection
```javascript
// Connection string format
mongodb://username:password@cluster-endpoint:27017/database?tls=true&tlsCAFile=global-bundle.pem
```

### Lambda Configuration
- **Memory**: 512 MB
- **Timeout**: 30 seconds
- **Runtime**: Node.js 22.x
- **Architecture**: x86_64

---

## Monitoring and Maintenance

### CloudWatch Logs
```bash
# View Lambda logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/ChronasApiLambdaStackV2"

# Tail logs in real-time
aws logs tail /aws/lambda/ChronasApiLambdaStackV2-ChronasApiLambdaFunction7C-b5U4C0YDGKS5 --follow
```

### Performance Monitoring
- **Average Response Time**: ~383ms
- **Success Rate**: 100% (67/67 test assertions)
- **Error Rate**: 0%

### Health Checks
```bash
# API Health Check
curl https://9c3213bzri.execute-api.eu-west-1.amazonaws.com/v1/health

# Database Connection Check
curl https://9c3213bzri.execute-api.eu-west-1.amazonaws.com/v1/version
```

---

## Troubleshooting

### Common Issues

#### 1. Lambda Cold Starts
**Symptom**: First request takes longer (~4s)
**Solution**: This is normal for Lambda cold starts. Subsequent requests are fast (~383ms average).

#### 2. DocumentDB Connection Issues
**Symptom**: Database connection timeouts
**Solutions**:
- Verify VPC security groups allow DocumentDB access
- Check DocumentDB cluster status
- Validate connection string and credentials

#### 3. Build Failures
**Symptom**: CDK deployment fails
**Solutions**:
- Ensure Node.js 22.x is installed
- Run `npm install` in both chronas-api and chronas-cdk directories
- Check AWS credentials and permissions

### Debug Commands
```bash
# Check CDK diff
cdk diff ChronasApiLambdaStackV2 --profile chronas-dev

# Validate CDK template
cdk synth ChronasApiLambdaStackV2 --profile chronas-dev

# Check Lambda function status
aws lambda get-function --function-name ChronasApiLambdaStackV2-ChronasApiLambdaFunction7C-b5U4C0YDGKS5
```

---

## API Endpoints

### Core Endpoints
- `GET /v1/health` - Health check
- `GET /v1/version` - API version info
- `GET /v1/version/welcome` - Welcome message with user info
- `POST /v1/auth/login` - User authentication

### Data Endpoints
- `GET /v1/metadata/` - Metadata operations
- `GET /v1/markers/` - Marker data
- `GET /v1/areas/` - Area information
- `GET /v1/board/forum/` - Forum discussions
- `GET /v1/users/` - User management

### Full API Documentation
See `swagger.yaml` for complete API documentation.

---

## Security

### Authentication
- JWT-based authentication
- OAuth integration (Facebook, Google, GitHub, Twitter)
- Secure password hashing with bcrypt

### Network Security
- VPC isolation
- Security groups restricting access
- TLS encryption for all connections
- DocumentDB encryption at rest

### Best Practices
- Regular dependency updates
- Security vulnerability scanning
- Access logging and monitoring
- Principle of least privilege

---

## Performance Optimization

### Current Performance
- **Average Response Time**: 383ms
- **P95 Response Time**: <1s
- **Cold Start**: ~4s (first request only)
- **Throughput**: Excellent for current load

### Optimization Techniques
- Connection pooling for DocumentDB
- Lambda function warming (if needed)
- Efficient query patterns
- Proper indexing in DocumentDB

---

## Backup and Recovery

### DocumentDB Backups
- **Automated Backups**: Enabled with 7-day retention
- **Manual Snapshots**: Created before major changes
- **Point-in-Time Recovery**: Available for last 7 days

### Disaster Recovery
- **RTO**: <1 hour (Recovery Time Objective)
- **RPO**: <15 minutes (Recovery Point Objective)
- **Backup Strategy**: Automated + manual snapshots
- **Testing**: Regular disaster recovery testing

---

## Scaling Considerations

### Current Capacity
- **Lambda Concurrency**: Auto-scaling up to account limits
- **DocumentDB**: Single instance (can be scaled)
- **API Gateway**: Handles high throughput automatically

### Scaling Options
1. **Vertical Scaling**: Increase Lambda memory/timeout
2. **Horizontal Scaling**: DocumentDB read replicas
3. **Caching**: Add ElastiCache if needed
4. **CDN**: CloudFront for static content

---

## Support and Maintenance

### Regular Maintenance Tasks
- [ ] Monthly dependency updates
- [ ] Quarterly security reviews
- [ ] Performance monitoring and optimization
- [ ] Backup verification and testing

### Support Contacts
- **Development Team**: [Your team contact]
- **Infrastructure**: [Infrastructure team contact]
- **Security**: [Security team contact]

### Documentation
- **API Docs**: `swagger.yaml`
- **Architecture**: `docs/architecture.md`
- **Troubleshooting**: This document
- **Upgrade Guide**: `.kiro/specs/chronas-api-modernization/`

---

## Changelog

### Version 1.3.5 (October 2, 2025)
- ✅ Upgraded to DocumentDB 5.0.0
- ✅ Modernized all code to async/await patterns
- ✅ Improved performance (383ms average response time)
- ✅ 100% test success rate (67/67 assertions)
- ✅ Enhanced error handling and reliability

### Previous Versions
See `CHANGELOG.md` for complete version history.

---

**This deployment guide reflects the current state of the modernized Chronas API. For questions or issues, refer to the troubleshooting section or contact the development team.**