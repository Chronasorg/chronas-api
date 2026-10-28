#!/usr/bin/env bash
# The JWT signing secret as an SSM Parameter Store SecureString (standard
# tier, AWS managed key aws/ssm), read by the app through JWT_SECRET_PARAMETER
# (config/bootstrap.js) instead of the Secrets Manager secret /chronas/secrets.
# The copy holds the same value, so every token issued so far stays valid.
#
#   ./jwt-secret-ssm.sh verify    SHA-256 of both values; prints "match" or "mismatch" (exit 1)
#   ./jwt-secret-ssm.sh copy      [--apply --confirm "copy jwt secret to ssm"]
#
# The value never reaches the terminal, a log, a snapshot or a command line:
# it only passes through 0600 files in a private temporary directory that is
# removed on exit, and the digests are compared as files, never printed.
# copy refuses to overwrite an existing parameter that holds another value.
set +x
umask 077
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
export AWS_PAGER=""
parse_common_args "$@"
set -- "${ARGS[@]+"${ARGS[@]}"}"
ACTION="${1:-}"
case "$ACTION" in
  copy|verify) ;;
  *) die "usage: jwt-secret-ssm.sh verify | copy [--apply --confirm \"copy jwt secret to ssm\"]" ;;
esac
require_identity

PARAMETER_NAME="/chronas/jwt-secret"
PARAMETER_KEY="alias/aws/ssm"

# AWS CLI history (cli_history = enabled) would store request and response
# bodies, the value included, in ~/.aws/cli/history.
if [[ "$(aws configure get cli_history --profile "$PROFILE" 2>/dev/null || true)" == "enabled" ]]; then
  die "cli_history is enabled for profile $PROFILE; it would store the value. Disable it first."
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/jwt-secret-ssm.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# The JWT_SECRET field of the Secrets Manager secret, as raw bytes in $1.
read_secret_value() {
  aws_cli secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET_ARN" \
    --query SecretString --output json > "$WORK/secret-string.json" || die "could not read $SECRET_ARN"
  # Error messages of fromjson quote their input, so jq's stderr is dropped.
  jq -j 'fromjson | .JWT_SECRET | if type == "string" and length > 0 then . else error("no JWT_SECRET") end' \
    "$WORK/secret-string.json" > "$1" 2>/dev/null \
    || die "$SECRET_ARN has no JWT_SECRET string (value not shown)"
  rm -f "$WORK/secret-string.json"
}

# The decrypted parameter value, as raw bytes in $1.
read_parameter_value() {
  aws_cli ssm get-parameter --region "$REGION" --name "$PARAMETER_NAME" --with-decryption \
    --query Parameter.Value --output json > "$WORK/parameter-value.json" || die "could not read $PARAMETER_NAME"
  jq -j 'if type == "string" then . else error("no value") end' "$WORK/parameter-value.json" > "$1" 2>/dev/null \
    || die "$PARAMETER_NAME has no value"
  rm -f "$WORK/parameter-value.json"
}

# Metadata only, no value: "<Type> <KeyId> <Tier> <Version>"; empty when the
# parameter does not exist.
parameter_metadata() {
  aws_cli ssm describe-parameters --region "$REGION" \
    --parameter-filters "Key=Name,Option=Equals,Values=$PARAMETER_NAME" \
    --query 'Parameters[0].[Type, KeyId, Tier, Version]' --output text | sed 's/^None$//'
}

# SHA-256 of file $1 into file $2.
digest() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum < "$1" | cut -d' ' -f1 > "$2"
  else
    shasum -a 256 < "$1" | cut -d' ' -f1 > "$2"
  fi
  grep -Eqx '[0-9a-f]{64}' "$2" || die "could not hash a value (needs sha256sum or shasum)"
}

# Succeeds when files $1 and $2 have the same SHA-256.
same_value() {
  digest "$1" "$WORK/a.sha256"
  digest "$2" "$WORK/b.sha256"
  cmp -s "$WORK/a.sha256" "$WORK/b.sha256"
}

verify() {
  local meta type key tier version
  meta="$(parameter_metadata)"
  [[ -n "$meta" ]] || die "$PARAMETER_NAME does not exist; run: ./jwt-secret-ssm.sh copy"
  read -r type key tier version <<< "$meta"
  log "$PARAMETER_NAME: $type, key $key, $tier tier, version $version"
  [[ "$type" == "SecureString" ]] || die "$PARAMETER_NAME is $type, expected SecureString"
  # The role reads it without a kms:Decrypt statement only under aws/ssm
  # (reported as its alias name, or its alias ARN).
  [[ "$key" == "$PARAMETER_KEY" || "$key" == *":$PARAMETER_KEY" ]] \
    || die "$PARAMETER_NAME is encrypted with $key, expected $PARAMETER_KEY"
  read_secret_value "$WORK/secret.value"
  read_parameter_value "$WORK/parameter.value"
  if same_value "$WORK/secret.value" "$WORK/parameter.value"; then
    echo "match"
  else
    echo "mismatch"
    exit 1
  fi
}

copy() {
  local meta
  read_secret_value "$WORK/secret.value"
  meta="$(parameter_metadata)"
  if [[ -n "$meta" ]]; then
    read_parameter_value "$WORK/parameter.value"
    same_value "$WORK/secret.value" "$WORK/parameter.value" \
      || die "$PARAMETER_NAME already exists with a different value; refusing to overwrite it"
    log "$PARAMETER_NAME already holds the same value; nothing to copy"
    verify
    return
  fi

  log "Plan: create $PARAMETER_NAME (SecureString, $PARAMETER_KEY, Standard tier: no charge),"
  log "      holding the JWT_SECRET field of $SECRET_ARN (value not shown)."
  confirmed "copy jwt secret to ssm" || return 0

  # No Overwrite: PutParameter fails if the parameter appeared meanwhile.
  jq -n --rawfile value "$WORK/secret.value" --arg name "$PARAMETER_NAME" --arg key "$PARAMETER_KEY" '{
    Name: $name,
    Description: "chronas-api JWT signing secret (JWT_SECRET_PARAMETER)",
    Value: $value,
    Type: "SecureString",
    KeyId: $key,
    Tier: "Standard",
    Tags: [{Key: "app", Value: "chronas"}]
  }' > "$WORK/put-parameter.json"
  aws_cli ssm put-parameter --region "$REGION" --cli-input-json "file://$WORK/put-parameter.json" \
    --query Version --output text > "$WORK/version.txt"
  rm -f "$WORK/put-parameter.json"
  log "Created $PARAMETER_NAME version $(cat "$WORK/version.txt"); checking the copy"

  # Metadata only (no value) for the record.
  local dir
  dir="$(backup_dir jwt-secret-ssm)"
  aws_cli ssm describe-parameters --region "$REGION" \
    --parameter-filters "Key=Name,Option=Equals,Values=$PARAMETER_NAME" --output json > "$dir/parameter-metadata.json"
  log "Snapshot (metadata only): $dir/parameter-metadata.json"
  verify
}

"$ACTION"
