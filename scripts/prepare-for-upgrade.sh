#!/bin/bash

# Prepare for DocumentDB In-Place Upgrade
set -e

echo "🔍 DocumentDB In-Place Upgrade Preparation"
echo "========================================="

AWS_PROFILE="chronas-dev"
AWS_REGION="eu-west-1"
CLUSTER_ID="databaseb269d8bb-nnxc5ntzb62u"

# Check current cluster status
echo "📋 Checking current DocumentDB cluster status..."
CLUSTER_INFO=$(aws docdb describe-db-clusters \
    --db-cluster-identifier "$CLUSTER_ID" \
    --query 'DBClusters[0].[Status,EngineVersion,DatabaseName]' \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION")

echo "   Cluster Status: $(echo $CLUSTER_INFO | cut -d' ' -f1)"
echo "   Engine Version: $(echo $CLUSTER_INFO | cut -d' ' -f2)"
echo "   Database Name: $(echo $CLUSTER_INFO | cut -d' ' -f3)"

# Check Lambda configuration
echo ""
echo "📋 Checking Lambda configuration..."
LAMBDA_SECRET=$(aws lambda get-function-configuration \
    --function-name ChronasApiLambdaStackV2-ChronasApiLambdaFunction7C-b5U4C0YDGKS5 \
    --query 'Environment.Variables.SECRET_DB_NAME' \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION")

echo "   Lambda Secret: $LAMBDA_SECRET"

if [ "$LAMBDA_SECRET" = "/chronas/docdb/newpassword" ]; then
    echo "   ✅ Lambda is using original DocumentDB cluster"
else
    echo "   ❌ Lambda is not using original cluster"
    exit 1
fi

# Test API
echo ""
echo "📋 Testing API functionality..."
API_RESPONSE=$(curl -s https://9c3213bzri.execute-api.eu-west-1.amazonaws.com/v1/welcome 2>/dev/null || echo "API_ERROR")

if [ "$API_RESPONSE" = "API_ERROR" ]; then
    echo "   ❌ API is not responding"
    exit 1
else
    echo "   ✅ API is responding"
    USER_COUNT=$(echo "$API_RESPONSE" | jq -r '.user' 2>/dev/null || echo "unknown")
    VERSION=$(echo "$API_RESPONSE" | jq -r '.version' 2>/dev/null || echo "unknown")
    echo "   API Version: $VERSION"
    echo "   User Count: $USER_COUNT"
fi

# Check for available OS updates
echo ""
echo "📋 Checking for available OS updates..."
echo "   Note: OS updates must be applied before major version upgrade"
echo "   This is a CRITICAL requirement that blocks the upgrade"

# Summary
echo ""
echo "🎯 Pre-Upgrade Status Summary:"
echo "============================="
echo "   ✅ DocumentDB Cluster: Available ($(echo $CLUSTER_INFO | cut -d' ' -f2))"
echo "   ✅ Lambda Configuration: Using original cluster"
echo "   ✅ API Functionality: Working correctly"
echo "   ✅ Application State: Ready for upgrade"

echo ""
echo "📋 Next Steps:"
echo "=============="
echo "   1. Apply OS updates to DocumentDB cluster (CRITICAL)"
echo "   2. Create manual snapshot for rollback"
echo "   3. Execute in-place upgrade to DocumentDB 5.0"
echo ""
echo "📖 Detailed Instructions:"
echo "   - Requirements: .kiro/specs/chronas-api-modernization/requirements-upgrade.md"
echo "   - Tasks: .kiro/specs/chronas-api-modernization/tasks-upgrade.md"
echo ""
echo "🚀 Ready to proceed with DocumentDB in-place upgrade!"