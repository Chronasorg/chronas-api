#!/usr/bin/env bash
# Phase 0 — Create all DynamoDB tables + GSIs for the DocumentDB → DynamoDB migration.
#
# Idempotent: tables that already exist are skipped. Safe to re-run.
# Billing mode: PAY_PER_REQUEST (on-demand) for every table.
# Region: eu-west-1 (chronas-dev / chronas-prod).
#
# Tables created:
#   chronas-markers, chronas-metadata, chronas-links, chronas-areas,
#   chronas-users, chronas-revisions, chronas-flags, chronas-collections,
#   chronas-games, chronas-board
#
# See DYNAMODB_MIGRATION_PLAN.md § "DynamoDB Table Design" for the
# attribute / GSI schemas.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "$HERE/_lib.sh"

REGION="${AWS_REGION:-eu-west-1}"
PREFIX="${DYNAMODB_TABLE_PREFIX:-chronas}"

assert_profile

table_exists() {
  local name="$1"
  aws dynamodb describe-table --table-name "$name" --region "$REGION" >/dev/null 2>&1
}

create_if_missing() {
  local name="$1"; shift
  if table_exists "$name"; then
    log "SKIP: $name already exists"
    return 0
  fi
  if is_dry_run; then
    log "DRY-RUN: would create table $name"
    return 0
  fi
  log "CREATE: $name"
  aws dynamodb create-table --table-name "$name" --region "$REGION" "$@"
  aws dynamodb wait table-exists --table-name "$name" --region "$REGION"
  log "READY: $name"
}

log "=== chronas DynamoDB table bootstrap ==="
log "Region: $REGION"
log "Prefix: $PREFIX"

# --- chronas-areas (Phase 1) ---
# Simple PK-only table: _id = year as string. No GSIs needed.
create_if_missing "${PREFIX}-areas" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions 'AttributeName=_id,AttributeType=S' \
  --key-schema 'AttributeName=_id,KeyType=HASH'

# --- chronas-markers (Phase 2) ---
# PK: _id. GSI-TypeYear: type + year for the dominant production query.
# GSI-PartOf: partOf + year for area.replaceAll war participant lookup.
create_if_missing "${PREFIX}-markers" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    'AttributeName=_id,AttributeType=S' \
    'AttributeName=type,AttributeType=S' \
    'AttributeName=year,AttributeType=N' \
    'AttributeName=partOf,AttributeType=S' \
  --key-schema 'AttributeName=_id,KeyType=HASH' \
  --global-secondary-indexes \
    '[{"IndexName":"GSI-TypeYear","KeySchema":[{"AttributeName":"type","KeyType":"HASH"},{"AttributeName":"year","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},{"IndexName":"GSI-PartOf","KeySchema":[{"AttributeName":"partOf","KeyType":"HASH"},{"AttributeName":"year","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]'

# --- chronas-metadata (Phase 4) ---
# PK: _id. GSI-TypeSubtype, GSI-SubtypeYear.
create_if_missing "${PREFIX}-metadata" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    'AttributeName=_id,AttributeType=S' \
    'AttributeName=type,AttributeType=S' \
    'AttributeName=subtype,AttributeType=S' \
    'AttributeName=year,AttributeType=N' \
  --key-schema 'AttributeName=_id,KeyType=HASH' \
  --global-secondary-indexes \
    '[{"IndexName":"GSI-TypeSubtype","KeySchema":[{"AttributeName":"type","KeyType":"HASH"},{"AttributeName":"subtype","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},{"IndexName":"GSI-SubtypeYear","KeySchema":[{"AttributeName":"subtype","KeyType":"HASH"},{"AttributeName":"year","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]'

# --- chronas-links (Phase 4b) ---
# Per-entity link items. PK: entityRef ("0:<markerId>" or "1:<metadataId>").
create_if_missing "${PREFIX}-links" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions 'AttributeName=entityRef,AttributeType=S' \
  --key-schema 'AttributeName=entityRef,KeyType=HASH'

# --- chronas-users (Phase 3) ---
# PK: _id (email). GSI-Username, GSI-Karma.
create_if_missing "${PREFIX}-users" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    'AttributeName=_id,AttributeType=S' \
    'AttributeName=username,AttributeType=S' \
    'AttributeName=_entity,AttributeType=S' \
    'AttributeName=karma,AttributeType=N' \
  --key-schema 'AttributeName=_id,KeyType=HASH' \
  --global-secondary-indexes \
    '[{"IndexName":"GSI-Username","KeySchema":[{"AttributeName":"username","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}},{"IndexName":"GSI-Karma","KeySchema":[{"AttributeName":"_entity","KeyType":"HASH"},{"AttributeName":"karma","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]'

# --- chronas-revisions (Phase 5) ---
# PK: _id (UUID). GSI-EntityTimestamp, GSI-UserTimestamp.
create_if_missing "${PREFIX}-revisions" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    'AttributeName=_id,AttributeType=S' \
    'AttributeName=entityId,AttributeType=S' \
    'AttributeName=timestamp,AttributeType=S' \
    'AttributeName=user,AttributeType=S' \
  --key-schema 'AttributeName=_id,KeyType=HASH' \
  --global-secondary-indexes \
    '[{"IndexName":"GSI-EntityTimestamp","KeySchema":[{"AttributeName":"entityId","KeyType":"HASH"},{"AttributeName":"timestamp","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},{"IndexName":"GSI-UserTimestamp","KeySchema":[{"AttributeName":"user","KeyType":"HASH"},{"AttributeName":"timestamp","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]'

# --- chronas-flags (Phase 3) ---
# PK: _id (auto-generated). GSI-FullUrl.
create_if_missing "${PREFIX}-flags" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    'AttributeName=_id,AttributeType=S' \
    'AttributeName=fullUrl,AttributeType=S' \
  --key-schema 'AttributeName=_id,KeyType=HASH' \
  --global-secondary-indexes \
    '[{"IndexName":"GSI-FullUrl","KeySchema":[{"AttributeName":"fullUrl","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]'

# --- chronas-collections (Phase 5, stub) ---
# PK: _id. GSI-OwnerTitle.
create_if_missing "${PREFIX}-collections" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    'AttributeName=_id,AttributeType=S' \
    'AttributeName=owner,AttributeType=S' \
    'AttributeName=title,AttributeType=S' \
  --key-schema 'AttributeName=_id,KeyType=HASH' \
  --global-secondary-indexes \
    '[{"IndexName":"GSI-OwnerTitle","KeySchema":[{"AttributeName":"owner","KeyType":"HASH"},{"AttributeName":"title","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]'

# --- chronas-games (Phase 5, stub) ---
# PK: _id. GSI-Highscore.
create_if_missing "${PREFIX}-games" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    'AttributeName=_id,AttributeType=S' \
    'AttributeName=_entity,AttributeType=S' \
    'AttributeName=identified,AttributeType=N' \
  --key-schema 'AttributeName=_id,KeyType=HASH' \
  --global-secondary-indexes \
    '[{"IndexName":"GSI-Highscore","KeySchema":[{"AttributeName":"_entity","KeyType":"HASH"},{"AttributeName":"identified","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]'

# --- chronas-board (Phase 6) ---
# Single-table design for forums/discussions/opinions.
# PK + SK composite. GSI-QA for discussion lookup by qa_id.
create_if_missing "${PREFIX}-board" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    'AttributeName=PK,AttributeType=S' \
    'AttributeName=SK,AttributeType=S' \
    'AttributeName=qa_id,AttributeType=S' \
    'AttributeName=date,AttributeType=S' \
  --key-schema 'AttributeName=PK,KeyType=HASH' 'AttributeName=SK,KeyType=RANGE' \
  --global-secondary-indexes \
    '[{"IndexName":"GSI-QA","KeySchema":[{"AttributeName":"qa_id","KeyType":"HASH"},{"AttributeName":"date","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]'

log "Done. All 10 tables created (or skipped if existing)."
