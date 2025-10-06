# Simple Production Deployment Plan

## Overview
Simple production deployment with acceptable downtime. Upgrade DocumentDB and deploy new Lambda function.

## Steps

### 1. Document Current Setup (FIRST - DO NOT SKIP)
- [ ] Run documentation script: `node scripts/document-current-setup.js`
- [ ] Review CURRENT_PRODUCTION_SUMMARY.md
- [ ] Understand current DocumentDB cluster configuration
- [ ] Understand current Lambda function setup
- [ ] Understand current API Gateway configuration
- [ ] **DO NOT PROCEED** until current setup is fully documented

### 2. Database Snapshot & Upgrade
- [ ] Create DocumentDB snapshot
- [ ] Upgrade DocumentDB from 3.6 to 5.0 (in-place)
- [ ] Validate database connectivity

### 3. Deploy New Lambda Function
- [ ] Deploy modernized Lambda function (Node.js 22.x)
- [ ] Update environment variables
- [ ] Test Lambda function directly

### 4. Update API Gateway
- [ ] Point API Gateway to new Lambda function
- [ ] Update any necessary configurations
- [ ] Test API Gateway integration

### 5. Validate with Postman
- [ ] Run Postman test suite
- [ ] Validate all endpoints work
- [ ] Check performance

## Commands

```bash
# FIRST: Document current setup (REQUIRED)
node scripts/document-current-setup.js

# Check current DocumentDB
aws docdb describe-db-clusters --profile chronas-prod --region eu-west-1

# Create snapshot
aws docdb create-db-cluster-snapshot --db-cluster-identifier CLUSTER_ID --db-cluster-snapshot-identifier prod-upgrade-backup-$(date +%Y%m%d) --profile chronas-prod --region eu-west-1

# Upgrade DocumentDB
aws docdb modify-db-cluster --db-cluster-identifier CLUSTER_ID --engine-version 5.0.0 --allow-major-version-upgrade --apply-immediately --profile chronas-prod --region eu-west-1

# Deploy Lambda
cd chronas-cdk && npm run build && npx cdk deploy ChronasApiLambdaStackV2 --profile chronas-prod --region eu-west-1

# Test with Postman
npm run test:postman:prod
```

## Rollback Plan
If issues occur:
1. Revert API Gateway to old Lambda function
2. Restore DocumentDB from snapshot if needed
3. Validate old system works

## Expected Downtime
- DocumentDB upgrade: ~15-30 minutes
- Lambda deployment: ~5-10 minutes
- Total: ~20-40 minutes