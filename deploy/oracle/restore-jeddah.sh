#!/usr/bin/env bash
set -euo pipefail
: "${GDG_PROJECT:?set isolated recovery Compose project}"
[[ $GDG_PROJECT != gdg-oracle && $GDG_PROJECT != gdg-prod && $GDG_PROJECT != gdg-dev ]]
: "${RECOVERY_IDENTITY:?set absolute offline identity path}"
test -f "$RECOVERY_IDENTITY"
export GDG_SNAPSHOT_CONFIG="${GDG_CONFIG:?set isolated recovery config}/restore.env"
exec "$(dirname "$0")/snapshot-run.sh" -v "$RECOVERY_IDENTITY:/run/age-identity:ro" -e AGE_IDENTITY_FILE=/run/age-identity backup restore "${1:?pass completed snapshot ID}"
