#!/usr/bin/env bash
set -euo pipefail
umask 077
exec systemd-run --user --wait --collect --pipe -p "EnvironmentFile=$HOME/.config/gdg/prod/restore.env" /usr/bin/python3 "/opt/gdg/oracle/snapshot.py" restore "${1:?pass completed snapshot ID}"
