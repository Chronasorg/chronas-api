#!/usr/bin/env bash
# Phase 8, TERMINAL — Delete the DocumentDB cluster.
#
# Only runs after 4 full weeks of clean DynamoDB operation. Requires an
# explicit `--confirm "YES DELETE DOCDB"` string. Even in dry-run, never
# issues a delete. Takes a final snapshot first.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "$HERE/_lib.sh"

REGION="${AWS_REGION:-eu-west-1}"
CLUSTER_ID="${DOCDB_CLUSTER_ID:-databaseb269d8bb-phnragzw0yth}"
CONFIRM=""

while [ $# -gt 0 ]; do
  case "$1" in
    --confirm) CONFIRM="$2"; shift 2 ;;
    --cluster) CLUSTER_ID="$2"; shift 2 ;;
    --dry-run) shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

assert_profile

if [ "$CONFIRM" != "YES DELETE DOCDB" ]; then
  cat >&2 <<EOF
REFUSED: missing --confirm "YES DELETE DOCDB".

This is a terminal operation. Once the cluster is deleted, only the final
snapshot remains. Requirements before running:
  1. At least 28 days since Phase 8 cutover was complete.
  2. DynamoDB error rate < 0.1% throughout.
  3. User has confirmed out-of-band that the snapshot plan is acceptable.
EOF
  exit 3
fi

log "Target cluster: $CLUSTER_ID"

log "Describing cluster (for record)…"
aws docdb describe-db-clusters \
  --db-cluster-identifier "$CLUSTER_ID" \
  --region "$REGION" \
  --query 'DBClusters[0].{Status:Status,DeletionProtection:DeletionProtection,Instances:DBClusterMembers[*].DBInstanceIdentifier}' \
  --output json

if is_dry_run; then
  log "DRY-RUN: would disable deletion protection, snapshot, delete instances, delete cluster."
  exit 0
fi

SNAP_ID="chronas-final-$(date -u +%Y%m%dT%H%M%SZ)"
log "Step 1: take final manual snapshot: $SNAP_ID"
aws docdb create-db-cluster-snapshot \
  --db-cluster-snapshot-identifier "$SNAP_ID" \
  --db-cluster-identifier "$CLUSTER_ID" \
  --region "$REGION" >/dev/null
aws docdb wait db-cluster-snapshot-available \
  --db-cluster-snapshot-identifier "$SNAP_ID" \
  --region "$REGION"
log "Snapshot $SNAP_ID is available."

log "Step 2: disable deletion protection on cluster"
aws docdb modify-db-cluster \
  --db-cluster-identifier "$CLUSTER_ID" \
  --no-deletion-protection \
  --apply-immediately \
  --region "$REGION" >/dev/null

INSTANCES=$(aws docdb describe-db-clusters \
  --db-cluster-identifier "$CLUSTER_ID" \
  --region "$REGION" \
  --query 'DBClusters[0].DBClusterMembers[*].DBInstanceIdentifier' \
  --output text)

for inst in $INSTANCES; do
  log "Deleting instance: $inst"
  aws docdb delete-db-instance --db-instance-identifier "$inst" --region "$REGION" >/dev/null
done

for inst in $INSTANCES; do
  log "Waiting for instance $inst to finish deletion…"
  aws docdb wait db-instance-deleted --db-instance-identifier "$inst" --region "$REGION"
done

log "Step 3: delete cluster $CLUSTER_ID (final snapshot already taken: $SNAP_ID)"
aws docdb delete-db-cluster \
  --db-cluster-identifier "$CLUSTER_ID" \
  --skip-final-snapshot \
  --region "$REGION" >/dev/null

log "Done. Retain snapshot $SNAP_ID until you're sure DynamoDB is stable."
