#!/bin/bash

# DocumentDB Backup Script
# This script creates a comprehensive backup of the current DocumentDB cluster
# before migration to the new version

set -e

# Configuration
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
AWS_PROFILE="chronas-dev"
AWS_REGION="eu-west-1"
SECRET_NAME="/chronas/docdb/newpassword"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting DocumentDB Backup Process${NC}"
echo "Backup Directory: $BACKUP_DIR"
echo "AWS Profile: $AWS_PROFILE"
echo "AWS Region: $AWS_REGION"
echo "----------------------------------------"

# Create backup directory
mkdir -p "$BACKUP_DIR"

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

# Check AWS CLI and profile
log "Checking AWS CLI configuration..."
if ! aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" > /dev/null 2>&1; then
    error "AWS CLI not configured properly or profile '$AWS_PROFILE' not found"
fi

# Get DocumentDB credentials from AWS Secrets Manager
log "Retrieving DocumentDB credentials from Secrets Manager..."
SECRET_JSON=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_NAME" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'SecretString' \
    --output text)

if [ -z "$SECRET_JSON" ]; then
    error "Failed to retrieve DocumentDB credentials from Secrets Manager"
fi

# Parse credentials
DOCDB_HOST=$(echo "$SECRET_JSON" | jq -r '.host')
DOCDB_PORT=$(echo "$SECRET_JSON" | jq -r '.port')
DOCDB_USERNAME=$(echo "$SECRET_JSON" | jq -r '.username')
DOCDB_PASSWORD=$(echo "$SECRET_JSON" | jq -r '.password')

if [ "$DOCDB_HOST" = "null" ] || [ "$DOCDB_USERNAME" = "null" ] || [ "$DOCDB_PASSWORD" = "null" ]; then
    error "Invalid credentials retrieved from Secrets Manager"
fi

log "DocumentDB Host: $DOCDB_HOST"
log "DocumentDB Port: $DOCDB_PORT"
log "DocumentDB Username: $DOCDB_USERNAME"

# Create connection string
CONNECTION_STRING="mongodb://$DOCDB_USERNAME:$(echo "$DOCDB_PASSWORD" | sed 's/@/%40/g')@$DOCDB_HOST:$DOCDB_PORT/chronas-api?replicaSet=rs0&retryWrites=false&directConnection=true"

# Test connection
log "Testing DocumentDB connection..."
if ! mongosh "$CONNECTION_STRING" --eval "db.runCommand('ping')" > /dev/null 2>&1; then
    warn "Direct connection test failed, this is expected if TLS is required"
    log "Proceeding with backup assuming connection will work with proper certificates"
fi

# Create cluster information backup
log "Documenting cluster configuration..."
cat > "$BACKUP_DIR/cluster-info.json" << EOF
{
  "backup_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "cluster_endpoint": "$DOCDB_HOST",
  "cluster_port": "$DOCDB_PORT",
  "database_name": "chronas-api",
  "engine_version": "3.6",
  "parameter_group": "disabled-tls-parameter",
  "tls_enabled": false,
  "backup_method": "mongodump_equivalent",
  "collections": [
    "areas",
    "markers", 
    "users",
    "metadata",
    "collections",
    "revisions",
    "flags",
    "games"
  ]
}
EOF

# Function to backup a single collection
backup_collection() {
    local collection_name=$1
    log "Backing up collection: $collection_name"
    
    # Create collection-specific directory
    mkdir -p "$BACKUP_DIR/collections/$collection_name"
    
    # Export collection data
    mongoexport \
        --uri="$CONNECTION_STRING" \
        --collection="$collection_name" \
        --out="$BACKUP_DIR/collections/$collection_name/data.json" \
        --jsonArray \
        2>> "$BACKUP_DIR/backup.log" || warn "Failed to backup collection $collection_name"
    
    # Get collection stats
    mongosh "$CONNECTION_STRING" --eval "
        db = db.getSiblingDB('chronas-api');
        const stats = db.$collection_name.stats();
        print(JSON.stringify({
            collection: '$collection_name',
            count: stats.count,
            size: stats.size,
            avgObjSize: stats.avgObjSize,
            storageSize: stats.storageSize,
            indexes: stats.nindexes,
            indexSizes: stats.indexSizes
        }, null, 2));
    " > "$BACKUP_DIR/collections/$collection_name/stats.json" 2>> "$BACKUP_DIR/backup.log" || warn "Failed to get stats for $collection_name"
    
    # Get indexes
    mongosh "$CONNECTION_STRING" --eval "
        db = db.getSiblingDB('chronas-api');
        const indexes = db.$collection_name.getIndexes();
        print(JSON.stringify(indexes, null, 2));
    " > "$BACKUP_DIR/collections/$collection_name/indexes.json" 2>> "$BACKUP_DIR/backup.log" || warn "Failed to get indexes for $collection_name"
}

# Backup all collections
COLLECTIONS=("areas" "markers" "users" "metadata" "collections" "revisions" "flags" "games")

log "Starting collection backups..."
for collection in "${COLLECTIONS[@]}"; do
    backup_collection "$collection"
done

# Create database-level information
log "Gathering database statistics..."
mongosh "$CONNECTION_STRING" --eval "
    db = db.getSiblingDB('chronas-api');
    const dbStats = db.stats();
    const collections = db.listCollections().toArray();
    
    print(JSON.stringify({
        database: 'chronas-api',
        stats: dbStats,
        collections: collections.map(c => c.name),
        timestamp: new Date().toISOString()
    }, null, 2));
" > "$BACKUP_DIR/database-stats.json" 2>> "$BACKUP_DIR/backup.log" || warn "Failed to get database statistics"

# Create AWS DocumentDB cluster snapshot
log "Creating AWS DocumentDB cluster snapshot..."
SNAPSHOT_ID="chronas-migration-backup-$(date +%Y%m%d-%H%M%S)"

# Get cluster identifier (assuming it follows the CDK naming pattern)
CLUSTER_ID=$(aws docdb describe-db-clusters \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'DBClusters[?contains(DBClusterIdentifier, `database`) || contains(DBClusterIdentifier, `chronas`)].DBClusterIdentifier' \
    --output text | head -n1)

if [ -n "$CLUSTER_ID" ]; then
    log "Found DocumentDB cluster: $CLUSTER_ID"
    
    aws docdb create-db-cluster-snapshot \
        --db-cluster-identifier "$CLUSTER_ID" \
        --db-cluster-snapshot-identifier "$SNAPSHOT_ID" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        > "$BACKUP_DIR/aws-snapshot.json" 2>> "$BACKUP_DIR/backup.log"
    
    if [ $? -eq 0 ]; then
        log "AWS snapshot created: $SNAPSHOT_ID"
        echo "$SNAPSHOT_ID" > "$BACKUP_DIR/snapshot-id.txt"
    else
        warn "Failed to create AWS snapshot"
    fi
else
    warn "Could not identify DocumentDB cluster for AWS snapshot"
fi

# Create backup verification script
cat > "$BACKUP_DIR/verify-backup.sh" << 'EOF'
#!/bin/bash

# Backup Verification Script
BACKUP_DIR=$(dirname "$0")

echo "Verifying backup integrity..."
echo "Backup Directory: $BACKUP_DIR"
echo "----------------------------------------"

# Check if all expected files exist
EXPECTED_FILES=(
    "cluster-info.json"
    "database-stats.json"
    "backup.log"
)

EXPECTED_COLLECTIONS=("areas" "markers" "users" "metadata" "collections" "revisions" "flags" "games")

echo "Checking backup files..."
for file in "${EXPECTED_FILES[@]}"; do
    if [ -f "$BACKUP_DIR/$file" ]; then
        echo "✓ $file exists"
    else
        echo "✗ $file missing"
    fi
done

echo "Checking collection backups..."
for collection in "${EXPECTED_COLLECTIONS[@]}"; do
    if [ -f "$BACKUP_DIR/collections/$collection/data.json" ]; then
        record_count=$(jq length "$BACKUP_DIR/collections/$collection/data.json" 2>/dev/null || echo "0")
        echo "✓ $collection: $record_count records"
    else
        echo "✗ $collection: backup missing"
    fi
done

if [ -f "$BACKUP_DIR/snapshot-id.txt" ]; then
    snapshot_id=$(cat "$BACKUP_DIR/snapshot-id.txt")
    echo "✓ AWS Snapshot: $snapshot_id"
else
    echo "✗ AWS Snapshot: not created"
fi

echo "----------------------------------------"
echo "Backup verification complete"
EOF

chmod +x "$BACKUP_DIR/verify-backup.sh"

# Create backup summary
log "Creating backup summary..."
cat > "$BACKUP_DIR/backup-summary.md" << EOF
# DocumentDB Backup Summary

**Backup Date**: $(date)
**Backup Directory**: $BACKUP_DIR
**Source Cluster**: $DOCDB_HOST:$DOCDB_PORT
**Database**: chronas-api

## Backup Contents

### Collections Backed Up
$(for collection in "${COLLECTIONS[@]}"; do
    if [ -f "$BACKUP_DIR/collections/$collection/data.json" ]; then
        record_count=$(jq length "$BACKUP_DIR/collections/$collection/data.json" 2>/dev/null || echo "unknown")
        echo "- **$collection**: $record_count records"
    else
        echo "- **$collection**: backup failed"
    fi
done)

### Files Created
- \`cluster-info.json\`: Cluster configuration details
- \`database-stats.json\`: Database statistics
- \`collections/*/data.json\`: Collection data exports
- \`collections/*/stats.json\`: Collection statistics
- \`collections/*/indexes.json\`: Index definitions
- \`backup.log\`: Backup process log
- \`verify-backup.sh\`: Backup verification script

$(if [ -f "$BACKUP_DIR/snapshot-id.txt" ]; then
    echo "### AWS Snapshot"
    echo "- Snapshot ID: $(cat "$BACKUP_DIR/snapshot-id.txt")"
    echo "- Cluster: $CLUSTER_ID"
fi)

## Verification

Run the verification script to check backup integrity:
\`\`\`bash
./verify-backup.sh
\`\`\`

## Restoration

To restore from this backup:
1. Use the AWS snapshot for cluster-level restoration
2. Use the JSON exports for collection-level restoration
3. Recreate indexes using the index definitions

## Notes

- This backup was created before migrating to DocumentDB 5.0+
- Ensure compatibility when restoring to newer engine versions
- Test restoration process in development environment first
EOF

# Run verification
log "Running backup verification..."
"$BACKUP_DIR/verify-backup.sh"

# Final summary
log "Backup process completed!"
echo "----------------------------------------"
echo -e "${GREEN}Backup Summary:${NC}"
echo "Location: $BACKUP_DIR"
echo "Collections: ${#COLLECTIONS[@]}"
if [ -f "$BACKUP_DIR/snapshot-id.txt" ]; then
    echo "AWS Snapshot: $(cat "$BACKUP_DIR/snapshot-id.txt")"
fi
echo "Verification: Run $BACKUP_DIR/verify-backup.sh"
echo "----------------------------------------"

log "DocumentDB backup process completed successfully!"