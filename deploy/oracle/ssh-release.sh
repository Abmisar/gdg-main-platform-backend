#!/usr/bin/env bash
set -euo pipefail
[[ $# == 2 && ( $1 == dev || $1 == prod ) && ( $2 == backend || $2 == frontend ) ]] || exit 64
[[ ${SSH_ORIGINAL_COMMAND:-} =~ ^[0-9a-f]{40}$ ]] || exit 64
export GDG_APP=$2
exec /opt/gdg/oracle/release.sh "$1" "$SSH_ORIGINAL_COMMAND"
