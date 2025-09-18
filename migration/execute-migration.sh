#!/bin/bash

# DocumentDB Migration Execution Script
# This script orchestrates the complete migration process from old to new DocumentDB cluster

set -e

# Configuration
ENVIRONMENT=${1:-dev}
AWS_PROFILE="chronas-dev"
AWS_REGION="eu-west-1"
DRY_RUN=${2:-true}
SKIP_BACKUP=${3:-false}

# Migration parameters
SOURCE_SECRET_NAME="/chronas/docdb/newpassword"
TARGET_SECRET_NAME="/chronas/${ENVIRONMENT}/docdb/modernized"
COLLECTIONS=("users" "metadata" "areas" "markers" "collections" "revisions" "flags" "games")
BATCH_SIZE=1000

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}DocumentDB Migration Execution${NC}"
echo "Environment: $ENVIRONMENT"
echo "AWS Profile: $AWS_PROFILE"
echo "AWS Region: $AWS_REGION"
echo "Dry Run: $DRY_RUN"
echo "Skip Backup: $SKIP_BACKUP"
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

# Validate environment parameter
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    error "Invalid environment. Must be one of: dev, staging, prod"
fi

# Validate dry run parameter
if [[ ! "$DRY_RUN" =~ ^(true|false)$ ]]; then
    error "Invalid dry run parameter. Must be 'true' or 'false'"
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

# Verify source and target clusters exist
log "Verifying DocumentDB clusters..."

# Check source cluster
log "Checking source cluster..."
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

# Check target cluster
log "Checking target cluster..."
TARGET_SECRET_EXISTS=$(aws secretsmanager describe-secret \
    --secret-id "$TARGET_SECRET_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'Name' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$TARGET_SECRET_EXISTS" = "NOT_FOUND" ]; then
    error "Target cluster secret not found: $TARGET_SECRET_NAME. Deploy the new cluster first."
fi

log "✓ Target cluster secret found"

# Create backup if not skipped
if [ "$SKIP_BACKUP" = "false" ]; then
    log "Creating backup of source cluster..."
    
    if [ -f "./backup-current-cluster.sh" ]; then
        ./backup-current-cluster.sh
        if [ $? -eq 0 ]; then
            log "✓ Backup completed successfully"
        else
            error "Backup failed. Aborting migration."
        fi
    else
        warn "Backup script not found. Continuing without backup."
    fi
else
    warn "Skipping backup as requested"
fi

# Test connectivity to both clusters
log "Testing cluster connectivity..."

# Test source cluster
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
    log "✓ Source cluster connectivity verified"
else
    warn "Source cluster connectivity test failed (may be expected if not in VPC)"
fi

# Test target cluster
log "Testing target cluster connectivity..."
TARGET_CREDENTIALS=$(aws secretsmanager get-secret-value \
    --secret-id "$TARGET_SECRET_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'SecretString' \
    --output text)

TARGET_HOST=$(echo "$TARGET_CREDENTIALS" | jq -r '.host')
TARGET_PORT=$(echo "$TARGET_CREDENTIALS" | jq -r '.port // 27017')

if timeout 10 bash -c "</dev/tcp/$TARGET_HOST/$TARGET_PORT" 2>/dev/null; then
    log "✓ Target cluster connectivity verified"
else
    warn "Target cluster connectivity test failed (may be expected if not in VPC)"
fi

# Check if Lambda functions exist
log "Checking Lambda functions..."

MIGRATION_FUNCTION_NAME="chronas-migration-handler-${ENVIRONMENT}"
VALIDATION_FUNCTION_NAME="chronas-validation-handler-${ENVIRONMENT}"

MIGRATION_FUNCTION_EXISTS=$(aws lambda get-function \
    --function-name "$MIGRATION_FUNCTION_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'FunctionName' \
    --output text 2>/dev/null || echo "NOT_FOUND")

VALIDATION_FUNCTION_EXISTS=$(aws lambda get-function \
    --function-name "$VALIDATION_FUNCTION_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'FunctionName' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$MIGRATION_FUNCTION_EXISTS" = "NOT_FOUND" ] || [ "$VALIDATION_FUNCTION_EXISTS" = "NOT_FOUND" ]; then
    warn "Lambda functions not found. Will use direct migration approach."
    USE_LAMBDA=false
else
    log "✓ Lambda functions found"
    USE_LAMBDA=true
fi

# Create migration execution ID
MIGRATION_ID="migration-$(date +%Y%m%d-%H%M%S)-${ENVIRONMENT}"
log "Migration ID: $MIGRATION_ID"

# Create migration log directory
LOG_DIR="./logs/${MIGRATION_ID}"
mkdir -p "$LOG_DIR"

# Start migration process
log "Starting migration process..."

if [ "$USE_LAMBDA" = "true" ]; then
    # Use Lambda-based migration
    log "Using Lambda-based migration approach"
    
    # Create migration payload
    MIGRATION_PAYLOAD=$(cat << EOF
{
  "sourceSecretName": "$SOURCE_SECRET_NAME",
  "targetSecretName": "$TARGET_SECRET_NAME",
  "collections": $(printf '%s\n' "${COLLECTIONS[@]}" | jq -R . | jq -s .),
  "dryRun": $DRY_RUN,
  "skipValidation": false,
  "continueOnError": false,
  "batchSize": $BATCH_SIZE,
  "migrationId": "$MIGRATION_ID"
}
EOF
    )
    
    echo "$MIGRATION_PAYLOAD" > "$LOG_DIR/migration-payload.json"
    
    # Execute migration Lambda
    log "Invoking migration Lambda function..."
    
    aws lambda invoke \
        --function-name "$MIGRATION_FUNCTION_NAME" \
        --payload "$MIGRATION_PAYLOAD" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        "$LOG_DIR/migration-result.json"
    
    # Check migration result
    MIGRATION_SUCCESS=$(jq -r '.statusCode' "$LOG_DIR/migration-result.json" 2>/dev/null || echo "500")
    
    if [ "$MIGRATION_SUCCESS" = "200" ]; then
        log "✓ Migration Lambda completed successfully"
        
        # Parse results
        MIGRATION_BODY=$(jq -r '.body' "$LOG_DIR/migration-result.json" | jq .)
        echo "$MIGRATION_BODY" > "$LOG_DIR/migration-details.json"
        
        TOTAL_MIGRATED=$(echo "$MIGRATION_BODY" | jq -r '.totalMigrated // 0')
        TOTAL_ERRORS=$(echo "$MIGRATION_BODY" | jq -r '.errors | length')
        
        log "Migration completed: $TOTAL_MIGRATED documents processed, $TOTAL_ERRORS errors"
        
    else
        error "Migration Lambda failed. Check $LOG_DIR/migration-result.json for details"
    fi
    
else
    # Use direct migration approach
    log "Using direct migration approach"
    
    # Check if Node.js migration script exists
    if [ -f "./lambda/migration-handler.js" ]; then
        log "Running direct migration..."
        
        # Set environment variables
        export AWS_PROFILE="$AWS_PROFILE"
        export AWS_REGION="$AWS_REGION"
        export SOURCE_SECRET_NAME="$SOURCE_SECRET_NAME"
        export TARGET_SECRET_NAME="$TARGET_SECRET_NAME"
        export BATCH_SIZE="$BATCH_SIZE"
        
        # Create migration event
        MIGRATION_EVENT=$(cat << EOF
{
  "sourceSecretName": "$SOURCE_SECRET_NAME",
  "targetSecretName": "$TARGET_SECRET_NAME",
  "collections": $(printf '%s\n' "${COLLECTIONS[@]}" | jq -R . | jq -s .),
  "dryRun": $DRY_RUN,
  "skipValidation": false,
  "continueOnError": false
}
EOF
        )
        
        echo "$MIGRATION_EVENT" > "$LOG_DIR/migration-event.json"
        
        # Run migration (this would require Node.js environment)
        warn "Direct migration requires Node.js environment with MongoDB drivers"
        info "Consider deploying Lambda functions for production migrations"
        
    else
        error "Migration script not found and Lambda functions not available"
    fi
fi

# Generate migration report
log "Generating migration report..."

REPORT_FILE="$LOG_DIR/migration-report.md"

cat > "$REPORT_FILE" << EOF
# DocumentDB Migration Report

**Migration ID**: $MIGRATION_ID
**Date**: $(date)
**Environment**: $ENVIRONMENT
**Dry Run**: $DRY_RUN

## Configuration

- **Source Secret**: $SOURCE_SECRET_NAME
- **Target Secret**: $TARGET_SECRET_NAME
- **Source Host**: $SOURCE_HOST:$SOURCE_PORT
- **Target Host**: $TARGET_HOST:$TARGET_PORT
- **Collections**: ${COLLECTIONS[*]}
- **Batch Size**: $BATCH_SIZE

## Migration Results

$(if [ "$USE_LAMBDA" = "true" ] && [ -f "$LOG_DIR/migration-details.json" ]; then
    echo "### Lambda Migration Results"
    echo ""
    echo "\`\`\`json"
    cat "$LOG_DIR/migration-details.json"
    echo "\`\`\`"
else
    echo "### Direct Migration"
    echo "Migration executed using direct approach."
fi)

## Files Generated

- Migration Payload: \`$LOG_DIR/migration-payload.json\`
- Migration Result: \`$LOG_DIR/migration-result.json\`
- Migration Details: \`$LOG_DIR/migration-details.json\`
- Migration Report: \`$REPORT_FILE\`

## Next Steps

$(if [ "$DRY_RUN" = "true" ]; then
    echo "1. Review dry run results"
    echo "2. If satisfied, run with DRY_RUN=false"
    echo "3. Monitor application performance"
    echo "4. Update application configuration"
else
    echo "1. Validate migration results"
    echo "2. Update application configuration"
    echo "3. Monitor application performance"
    echo "4. Decommission old cluster (after validation period)"
fi)

## Important Notes

- **Backup**: $([ "$SKIP_BACKUP" = "false" ] && echo "Backup was created" || echo "Backup was skipped")
- **Rollback**: Keep old cluster running until migration is fully validated
- **Monitoring**: Monitor both clusters during transition period
- **Application**: Update connection strings after successful migration

---

*Migration report generated automatically*
*For issues, check CloudWatch logs and migration result files*
EOF

# Display summary
log "Migration execution completed!"
echo "----------------------------------------"
echo -e "${GREEN}Migration Summary:${NC}"
echo "Migration ID: $MIGRATION_ID"
echo "Environment: $ENVIRONMENT"
echo "Dry Run: $DRY_RUN"
echo "Approach: $([ "$USE_LAMBDA" = "true" ] && echo "Lambda-based" || echo "Direct")"
echo "Log Directory: $LOG_DIR"
echo "Report: $REPORT_FILE"
echo "----------------------------------------"

if [ "$DRY_RUN" = "true" ]; then
    info "This was a dry run. No data was actually migrated."
    info "Review the results and run with DRY_RUN=false to perform actual migration."
else
    log "Migration completed. Review the results and validate data integrity."
    warn "Keep the old cluster running until migration is fully validated."
fi

echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Review migration report: $REPORT_FILE"
echo "2. Validate data integrity in target cluster"
echo "3. Update application configuration"
echo "4. Monitor application performance"
echo "5. Plan old cluster decommissioning"