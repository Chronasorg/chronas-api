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

# TODO(phase 0): fill in full attribute definitions + GSIs.
# Each create_if_missing call below is a stub that must be expanded with
# --attribute-definitions, --key-schema, --global-secondary-indexes, and
# --billing-mode PAY_PER_REQUEST. The plan documents the full schemas.

log "=== chronas DynamoDB table bootstrap ==="
log "Region: $REGION"
log "Prefix: $PREFIX"

# Uncomment and flesh out per phase:
# create_if_missing "${PREFIX}-markers"     --billing-mode PAY_PER_REQUEST ...
# create_if_missing "${PREFIX}-metadata"    --billing-mode PAY_PER_REQUEST ...
# create_if_missing "${PREFIX}-links"       --billing-mode PAY_PER_REQUEST ...
# create_if_missing "${PREFIX}-areas"       --billing-mode PAY_PER_REQUEST ...
# create_if_missing "${PREFIX}-users"       --billing-mode PAY_PER_REQUEST ...
# create_if_missing "${PREFIX}-revisions"   --billing-mode PAY_PER_REQUEST ...
# create_if_missing "${PREFIX}-flags"       --billing-mode PAY_PER_REQUEST ...
# create_if_missing "${PREFIX}-collections" --billing-mode PAY_PER_REQUEST ...
# create_if_missing "${PREFIX}-games"       --billing-mode PAY_PER_REQUEST ...
# create_if_missing "${PREFIX}-board"       --billing-mode PAY_PER_REQUEST ...

log "NOTICE: table definitions are stubbed — fill in per-table schemas before live run."
log "Done."
