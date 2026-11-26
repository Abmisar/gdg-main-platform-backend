#!/usr/bin/env bash
set -euo pipefail
exec systemd-run --user --wait --collect --pipe -p "EnvironmentFile=$HOME/.config/gdg/restore.env" /usr/bin/python3 "$HOME/backend/deploy/oracle/snapshot.py" restore "${1:?pass completed snapshot ID}"
