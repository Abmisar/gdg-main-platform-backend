#!/usr/bin/env bash
set -euo pipefail
release=${GDG_RELEASE_DIR:-$HOME/.local/state/gdg/prod/current}
project=${GDG_PROJECT:-gdg-prod}
exec docker compose --env-file "$release/tags.env" -p "$project" -f "$release/compose.yml" run --no-deps --rm -T --pull never "$@"
