#!/usr/bin/env bash
# Phase 0 / FE-WIN #1 — Upload provinces GeoJSON as a static asset so the
# frontend can fetch it from CloudFront instead of blowing past DynamoDB's
# 400 KB item limit.
#
# Source of truth for provinces today is the `Metadata._id='provinces'`
# document in DocumentDB. This script:
#   1. Exports that document's `.data` field to a local file.
#   2. Gzips it.
#   3. Uploads to s3://chronas-static-<account>/geo/provinces.geojson.gz
#      with Content-Encoding: gzip and a long Cache-Control.
#
# Stubbed for now — fill in once AWS access is available (tomorrow).

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "$HERE/_lib.sh"

REGION="${AWS_REGION:-eu-west-1}"
BUCKET="${PROVINCES_BUCKET:-}"

assert_profile

if [ -z "$BUCKET" ]; then
  log "NOTICE: PROVINCES_BUCKET not set — will default to the chronas-static bucket once created."
fi

log "=== FE-WIN #1 provinces static-asset upload (stub) ==="
log "TODO: export provinces.data from DocDB, gzip, upload to S3."
log "TODO: invalidate CloudFront cache for /geo/provinces.geojson.gz."
log "Done (no-op)."
