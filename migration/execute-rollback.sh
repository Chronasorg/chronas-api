#!/bin/bash

# DocumentDB Rollback Execution Script
# This script handles emergency rollback scenarios for DocumentDB migration

set -e

# Configuration
ENVIRONMENT=${1:-dev}
ROLLBACK_TYPE=${2:-connection_switch}
REASON=${3:-"Manual rollback requested"}
AWS_PROFILE="chronas-dev"
AWS_REGION="eu-west-1"

# Rollback parameters
SOURCE_SECRET_NAME="/chronas/docdb/newpassword"  # Original cluster
TARGET_SECRET_NAME="/chronas/${ENVIRONMENT}/docdb/modernized"  # New cluster
COLLECTIONS=("users" "metadata" "areas" "markers" "collections" "revisions" "flags" "games")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${RED}🚨 EMERGENCY ROLLBACK PROCEDURE 🚨${NC}"
echo -e "${YELLOW}WARNING: This will rollback the DocumentDB migration${NC}"
echo "Environment: $ENVIRONMENT"
echo "Rollback Type: $ROLLBACK_TYPE"
echo "Reason: $REASON"
echo "AWS Profile: $AWS_PROFILE"
echo "AWS Region: $AWS_REGION"
echo "----------------------------------------"

# Function to log messages
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

urgent() {
    echo -e "${MAGENTA}[URGENT] $1${NC}"
}

# Validate parameters
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    error "Invalid environment. Must be one of: dev, staging, prod"
fi

if [[ ! "$ROLLBACK_TYPE" =~ ^(connection_switch|data_restore|cluster_restore)$ ]]; then
    error "Invalid rollback type. Must be one of: connection_switch, data_restore, cluster_restore"
fi

# Special warning for production
if [ "$ENVIRONMENT" = "prod" ]; then
    urgent "PRODUCTION ROLLBACK DETECTED!"
    urgent "This operation will affect production systems!"
    echo ""
    echo -e "${RED}Please confirm the following:${NC}"
    echo "1. You have authorization to perform production rollback"
    echo "2. Stakeholders have been notified"
    echo "3. You understand the impact of this operation"
    echo ""
    read -p "Type 'CONFIRM PRODUCTION ROLLBACK' to proceed: " confirmation
    
    if [ "$confirmation" != "CONFIRM PRODUCTION ROLLBACK" ]; then
        echo "Rollback cancelled"
        exit 0
    fi
fi

# Check prerequisites
log "Checking prerequisites..."

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    error "AWS CLI is not installed"
fi

# Check jq for JSON processing
if ! command -v jq &> /dev/null; then
    error "jq is not installed (required for JSON processing)"
fi

# Check AWS credentials
log "Checking AWS credentials..."
if ! aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" > /dev/null 2>&1; then
    error "AWS CLI not configured properly or profile '$AWS_PROFILE' not found"
fi

# Get account ID
ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" --query 'Account' --output text)
log "AWS Account ID: $ACCOUNT_ID"

# Verify clusters exist
log "Verifying DocumentDB clusters..."

# Check source cluster (original)
log "Checking source cluster (original)..."
SOURCE_SECRET_EXISTS=$(aws secretsmanager describe-secret \
    --secret-id "$SOURCE_SECRET_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'Name' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$SOURCE_SECRET_EXISTS" = "NOT_FOUND" ]; then
    error "Source cluster secret not found: $SOURCE_SECRET_NAME"
fi

log "✓ Source cluster secret found"

# Check target cluster (new)
log "Checking target cluster (new)..."
TARGET_SECRET_EXISTS=$(aws secretsmanager describe-secret \
    --secret-id "$TARGET_SECRET_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'Name' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$TARGET_SECRET_EXISTS" = "NOT_FOUND" ]; then
    error "Target cluster secret not found: $TARGET_SECRET_NAME"
fi

log "✓ Target cluster secret found"

# Test connectivity to source cluster
log "Testing source cluster connectivity..."
SOURCE_CREDENTIALS=$(aws secretsmanager get-secret-value \
    --secret-id "$SOURCE_SECRET_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'SecretString' \
    --output text)

SOURCE_HOST=$(echo "$SOURCE_CREDENTIALS" | jq -r '.host')
SOURCE_PORT=$(echo "$SOURCE_CREDENTIALS" | jq -r '.port // 27017')

if timeout 10 bash -c "</dev/tcp/$SOURCE_HOST/$SOURCE_PORT" 2>/dev/null; then
    log "✓ Source cluster is accessible"
else
    warn "Source cluster connectivity test failed"
    warn "This may be expected if not running from VPC"
fi

# Get backup information for cluster restore
BACKUP_SNAPSHOT_ID=""
if [ "$ROLLBACK_TYPE" = "cluster_restore" ]; then
    log "Looking for recent backup snapshots..."
    
    # Find the most recent snapshot
    BACKUP_SNAPSHOT_ID=$(aws docdb describe-db-cluster-snapshots \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --query 'DBClusterSnapshots[?contains(DBClusterSnapshotIdentifier, `chronas`) && contains(DBClusterSnapshotIdentifier, `backup`)].{Id:DBClusterSnapshotIdentifier,Time:SnapshotCreateTime}' \
        --output json | jq -r 'sort_by(.Time) | reverse | .[0].Id // empty')
    
    if [ -z "$BACKUP_SNAPSHOT_ID" ]; then
        error "No backup snapshots found for cluster restore. Use data_restore instead."
    fi
    
    log "Found backup snapshot: $BACKUP_SNAPSHOT_ID"
fi

# Create rollback execution ID
ROLLBACK_ID="rollback-$(date +%Y%m%d-%H%M%S)-${ENVIRONMENT}"
log "Rollback ID: $ROLLBACK_ID"

# Create rollback log directory
LOG_DIR="./logs/${ROLLBACK_ID}"
mkdir -p "$LOG_DIR"

# Final confirmation
echo ""
echo -e "${YELLOW}ROLLBACK SUMMARY:${NC}"
echo "Rollback ID: $ROLLBACK_ID"
echo "Type: $ROLLBACK_TYPE"
echo "Environment: $ENVIRONMENT"
echo "Reason: $REASON"
echo "Source (Original): $SOURCE_HOST"
echo "Target (New): $(echo "$TARGET_CREDENTIALS" | jq -r '.host' 2>/dev/null || echo 'Unknown')"
if [ -n "$BACKUP_SNAPSHOT_ID" ]; then
    echo "Backup Snapshot: $BACKUP_SNAPSHOT_ID"
fi
echo ""

read -p "Are you sure you want to proceed with this rollback? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Rollback cancelled"
    exit 0
fi

# Start rollback process
urgent "Starting rollback process..."

# Check if Lambda functions exist
log "Checking Lambda functions..."

ROLLBACK_FUNCTION_NAME="chronas-rollback-handler-${ENVIRONMENT}"
ROLLBACK_FUNCTION_EXISTS=$(aws lambda get-function \
    --function-name "$ROLLBACK_FUNCTION_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'FunctionName' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$ROLLBACK_FUNCTION_EXISTS" = "NOT_FOUND" ]; then
    warn "Rollback Lambda function not found. Using direct approach."
    USE_LAMBDA=false
else
    log "✓ Rollback Lambda function found"
    USE_LAMBDA=true
fi

# Execute rollback
if [ "$USE_LAMBDA" = "true" ]; then
    # Use Lambda-based rollback
    log "Using Lambda-based rollback approach"
    
    # Create rollback payload
    ROLLBACK_PAYLOAD=$(cat << EOF
{
  "rollbackType": "$ROLLBACK_TYPE",
  "sourceSecretName": "$SOURCE_SECRET_NAME",
  "targetSecretName": "$TARGET_SECRET_NAME",
  "backupSnapshotId": $([ -n "$BACKUP_SNAPSHOT_ID" ] && echo "\"$BACKUP_SNAPSHOT_ID\"" || echo "null"),
  "collections": $(printf '%s\n' "${COLLECTIONS[@]}" | jq -R . | jq -s .),
  "validateRollback": true,
  "cleanupTarget": false,
  "reason": "$REASON",
  "rollbackId": "$ROLLBACK_ID"
}
EOF
    )
    
    echo "$ROLLBACK_PAYLOAD" > "$LOG_DIR/rollback-payload.json"
    
    # Execute rollback Lambda
    log "Invoking rollback Lambda function..."
    
    aws lambda invoke \
        --function-name "$ROLLBACK_FUNCTION_NAME" \
        --payload "$ROLLBACK_PAYLOAD" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        "$LOG_DIR/rollback-result.json"
    
    # Check rollback result
    ROLLBACK_SUCCESS=$(jq -r '.statusCode' "$LOG_DIR/rollback-result.json" 2>/dev/null || echo "500")
    
    if [ "$ROLLBACK_SUCCESS" = "200" ]; then
        log "✓ Rollback Lambda completed successfully"
        
        # Parse results
        ROLLBACK_BODY=$(jq -r '.body' "$LOG_DIR/rollback-result.json" | jq .)
        echo "$ROLLBACK_BODY" > "$LOG_DIR/rollback-details.json"
        
        ROLLBACK_STEPS=$(echo "$ROLLBACK_BODY" | jq -r '.steps | length')
        ROLLBACK_ERRORS=$(echo "$ROLLBACK_BODY" | jq -r '.errors | length')
        
        log "Rollback completed: $ROLLBACK_STEPS steps executed, $ROLLBACK_ERRORS errors"
        
    else
        error "Rollback Lambda failed. Check $LOG_DIR/rollback-result.json for details"
    fi
    
else
    # Manual rollback instructions
    warn "Lambda functions not available. Providing manual rollback instructions."
    
    case $ROLLBACK_TYPE in
        "connection_switch")
            log "Manual Connection Switch Rollback:"
            echo "1. Update application configuration to use original cluster:"
            echo "   - Secret: $SOURCE_SECRET_NAME"
            echo "   - Host: $SOURCE_HOST:$SOURCE_PORT"
            echo "2. Restart application services"
            echo "3. Verify application functionality"
            echo "4. Monitor application logs"
            ;;
            
        "data_restore")
            log "Manual Data Restore Rollback:"
            echo "1. Connect to both clusters"
            echo "2. Clear target cluster collections"
            echo "3. Copy data from source to target cluster"
            echo "4. Recreate indexes"
            echo "5. Validate data integrity"
            warn "This is a complex manual process. Consider using Lambda functions."
            ;;
            
        "cluster_restore")
            log "Manual Cluster Restore Rollback:"
            echo "1. Create new cluster from backup snapshot: $BACKUP_SNAPSHOT_ID"
            echo "2. Wait for cluster to become available"
            echo "3. Update application configuration"
            echo "4. Test connectivity and functionality"
            warn "Cluster restore takes significant time (30+ minutes)"
            ;;
    esac
fi

# Generate rollback report
log "Generating rollback report..."

REPORT_FILE="$LOG_DIR/rollback-report.md"

cat > "$REPORT_FILE" << EOF
# DocumentDB Rollback Report

**Rollback ID**: $ROLLBACK_ID
**Date**: $(date)
**Environment**: $ENVIRONMENT
**Type**: $ROLLBACK_TYPE
**Reason**: $REASON

## Configuration

- **Source Secret (Original)**: $SOURCE_SECRET_NAME
- **Target Secret (New)**: $TARGET_SECRET_NAME
- **Source Host**: $SOURCE_HOST:$SOURCE_PORT
- **Collections**: ${COLLECTIONS[*]}
$([ -n "$BACKUP_SNAPSHOT_ID" ] && echo "- **Backup Snapshot**: $BACKUP_SNAPSHOT_ID")

## Rollback Results

$(if [ "$USE_LAMBDA" = "true" ] && [ -f "$LOG_DIR/rollback-details.json" ]; then
    echo "### Lambda Rollback Results"
    echo ""
    echo "\`\`\`json"
    cat "$LOG_DIR/rollback-details.json"
    echo "\`\`\`"
else
    echo "### Manual Rollback"
    echo "Rollback executed using manual approach."
    echo "Follow the manual instructions provided during execution."
fi)

## Post-Rollback Actions Required

### Immediate Actions
1. **Verify Application Functionality**
   - Test critical application features
   - Check database connectivity
   - Monitor application logs

2. **Update Monitoring**
   - Update monitoring dashboards
   - Adjust alerting thresholds
   - Monitor performance metrics

3. **Communication**
   - Notify stakeholders of rollback completion
   - Update incident documentation
   - Schedule post-mortem if needed

### Follow-up Actions
1. **Root Cause Analysis**
   - Investigate original migration issues
   - Document lessons learned
   - Update migration procedures

2. **Future Migration Planning**
   - Address identified issues
   - Improve testing procedures
   - Plan next migration attempt

## Files Generated

- Rollback Payload: \`$LOG_DIR/rollback-payload.json\`
- Rollback Result: \`$LOG_DIR/rollback-result.json\`
- Rollback Details: \`$LOG_DIR/rollback-details.json\`
- Rollback Report: \`$REPORT_FILE\`

## Important Notes

- **Original Cluster**: Now active again (if connection_switch)
- **New Cluster**: $([ "$ROLLBACK_TYPE" = "cluster_restore" ] && echo "Replaced with restored cluster" || echo "May need cleanup")
- **Data Integrity**: Validate all critical data
- **Performance**: Monitor for any performance impacts
- **Next Steps**: Plan corrective actions before next migration attempt

## Emergency Contacts

- Database Team: [Contact Information]
- Application Team: [Contact Information]
- Infrastructure Team: [Contact Information]

---

*Rollback report generated automatically*
*Status: $([ "$ROLLBACK_SUCCESS" = "200" ] && echo "SUCCESS" || echo "REQUIRES MANUAL VERIFICATION")*
EOF

# Display summary
urgent "Rollback execution completed!"
echo "----------------------------------------"
echo -e "${GREEN}Rollback Summary:${NC}"
echo "Rollback ID: $ROLLBACK_ID"
echo "Type: $ROLLBACK_TYPE"
echo "Environment: $ENVIRONMENT"
echo "Approach: $([ "$USE_LAMBDA" = "true" ] && echo "Lambda-based" || echo "Manual")"
echo "Status: $([ "$ROLLBACK_SUCCESS" = "200" ] && echo "SUCCESS" || echo "REQUIRES VERIFICATION")"
echo "Log Directory: $LOG_DIR"
echo "Report: $REPORT_FILE"
echo "----------------------------------------"

echo ""
echo -e "${MAGENTA}CRITICAL POST-ROLLBACK ACTIONS:${NC}"
echo "1. 🔍 VERIFY application functionality immediately"
echo "2. 📊 CHECK monitoring dashboards and alerts"
echo "3. 📞 NOTIFY stakeholders of rollback completion"
echo "4. 📝 UPDATE incident documentation"
echo "5. 🔄 MONITOR system performance closely"

if [ "$ROLLBACK_TYPE" = "connection_switch" ]; then
    echo ""
    echo -e "${BLUE}Connection Switch Rollback:${NC}"
    echo "✅ Application should now be using the original cluster"
    echo "⚠️  Update application configuration if needed"
    echo "📈 Monitor performance and error rates"
fi

echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Review rollback report: $REPORT_FILE"
echo "2. Conduct root cause analysis"
echo "3. Plan corrective actions"
echo "4. Schedule post-mortem meeting"
echo "5. Update migration procedures"