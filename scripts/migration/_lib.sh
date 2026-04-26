#!/usr/bin/env bash
# Common helpers sourced by all shell migration scripts.
# Requires: AWS_PROFILE=chronas-dev (or --profile chronas-dev on the CLI).

set -euo pipefail

REQUIRED_PROFILE="${REQUIRED_PROFILE:-chronas-dev}"
EXPECTED_ACCOUNT="${EXPECTED_ACCOUNT:-}"  # set per-env if we want to pin

assert_profile() {
  if [ -z "${AWS_PROFILE:-}" ]; then
    echo "ERROR: AWS_PROFILE is not set. Export AWS_PROFILE=${REQUIRED_PROFILE} first." >&2
    exit 2
  fi
  if [ "$AWS_PROFILE" != "$REQUIRED_PROFILE" ]; then
    echo "ERROR: AWS_PROFILE=$AWS_PROFILE, required: $REQUIRED_PROFILE." >&2
    exit 2
  fi
  local ident
  ident=$(aws sts get-caller-identity --output json)
  local account
  account=$(echo "$ident" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).Account))")
  echo "AWS identity: account=$account profile=$AWS_PROFILE"
  if [ -n "$EXPECTED_ACCOUNT" ] && [ "$account" != "$EXPECTED_ACCOUNT" ]; then
    echo "ERROR: account $account != expected $EXPECTED_ACCOUNT" >&2
    exit 2
  fi
}

log() {
  echo "[$(date -u +%FT%TZ)] $*"
}

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
  esac
done

is_dry_run() { [ "$DRY_RUN" = "1" ]; }
