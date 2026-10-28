# Helpers for infra/api-edge scripts. Sourced, not executed.
# Every script is read-only unless called with --apply and the exact
# confirmation phrase it prints, and checks the AWS account first.

set -euo pipefail

EDGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$EDGE_DIR/../.." && pwd)"
# shellcheck source=constants.sh
source "$EDGE_DIR/constants.sh"

APPLY="no"
CONFIRM=""
ARGS=()

log() { printf '\033[1;34m==>\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33mWARN\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mERROR\033[0m %s\n' "$*" >&2; exit 1; }

aws_cli() { aws --profile "$PROFILE" "$@"; }

# Splits --apply / --confirm "<phrase>" from the remaining arguments (ARGS).
parse_common_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --apply) APPLY="yes" ;;
      --confirm) CONFIRM="${2:-}"; shift ;;
      *) ARGS+=("$1") ;;
    esac
    shift
  done
}

require_identity() {
  local account
  account="$(aws_cli sts get-caller-identity --query Account --output text)"
  [[ "$account" == "$ACCOUNT_ID" ]] || die "credentials are for account $account, expected $ACCOUNT_ID"
}

# Dry run unless --apply was given with exactly this phrase.
confirmed() {
  local phrase="$1"
  if [[ "$APPLY" != "yes" ]]; then
    log "Dry run. To apply, re-run with: --apply --confirm \"$phrase\""
    return 1
  fi
  [[ "$CONFIRM" == "$phrase" ]] || die "confirmation phrase mismatch; expected exactly: $phrase"
  return 0
}

# Snapshots go to the gitignored infra/backups/api-edge/ (and CI artifacts),
# or below EDGE_BACKUP_DIR, an existing directory, when that is set (the tests
# use a temporary one; the API edge workflow uploads only infra/backups/).
# Inside this repository, or any other git work tree, the directory must be
# gitignored, so a snapshot can never be committed. Checked before anything
# is created.
backup_dir() {
  local base="$REPO_ROOT/infra/backups/api-edge" dir
  if [[ -z "${EDGE_BACKUP_DIR:-}" ]]; then
    git -C "$REPO_ROOT" check-ignore -q "$REPO_ROOT/infra/backups/x" || die "infra/backups/ must be gitignored"
  else
    base="$(cd "$EDGE_BACKUP_DIR" 2>/dev/null && pwd -P)" || die "EDGE_BACKUP_DIR is not a directory: $EDGE_BACKUP_DIR"
    if [[ "$base/" == "$(cd "$REPO_ROOT" && pwd -P)/"* \
          || "$(git -C "$base" rev-parse --is-inside-work-tree 2>/dev/null)" == "true" ]]; then
      git -C "$base" check-ignore -q "$base/x" || die "EDGE_BACKUP_DIR $base is in a git work tree and not gitignored"
    fi
  fi
  dir="$base/$(date -u +%Y%m%dT%H%M%SZ)-$1"
  mkdir -p "$dir"
  echo "$dir"
}

edge_config() { node "$EDGE_DIR/edge-config.mjs" "$@"; }

# Name of a cache policy spec (dynamic, public, publicV3) in edge-config.mjs.
policy_name() { edge_config policy-spec "$1" | jq -r .Name; }

# Prints "<dynamic-id> <public-id>"; fails if either policy is missing or differs.
# Call it as POLICY_IDS="$(policy_ids)" || exit 1: a failure inside $(…) only
# ends the subshell.
policy_ids() {
  local dynamic public
  dynamic="$(policy_id_by_name "$(policy_name dynamic)")"
  public="$(policy_id_by_name "$(policy_name public)")"
  [[ -n "$dynamic" && -n "$public" ]] || die "cache policies missing; run policies.sh first"
  check_policy "$dynamic" dynamic
  check_policy "$public" public
  echo "$dynamic $public"
}

policy_id_by_name() {
  aws_cli cloudfront list-cache-policies --type custom \
    --query "CachePolicyList.Items[?CachePolicy.CachePolicyConfig.Name=='$1'].CachePolicy.Id | [0]" --output text \
    | sed 's/^None$//'
}

check_policy() {
  local tmp
  tmp="$(mktemp)"
  aws_cli cloudfront get-cache-policy-config --id "$1" --query CachePolicyConfig --output json > "$tmp"
  edge_config check-policy --spec "$2" --config "$tmp" >&2
  rm -f "$tmp"
}

wait_deployed() {
  log "Waiting for distribution $1 to be Deployed"
  aws_cli cloudfront wait distribution-deployed --id "$1"
}

invalidate_and_wait() {
  local id
  id="$(aws_cli cloudfront create-invalidation --distribution-id "$1" --paths '/v1/*' --query Invalidation.Id --output text)"
  log "Invalidation $id created; waiting"
  aws_cli cloudfront wait invalidation-completed --distribution-id "$1" --id "$id"
}

web_cli() { "${AWS_WEB_CLI:-aws}" --profile "$PROFILE" --region "$REGION" lambda-web "$@"; }

require_web_cli() {
  web_cli help >/dev/null 2>&1 || die "this AWS CLI has no 'lambda-web' (needs >= 2.37.13); set AWS_WEB_CLI"
}
