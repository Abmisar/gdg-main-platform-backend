#!/usr/bin/env bash
set -euo pipefail
governor="$HOME/Library/Application Support/WorkloadGovernor/mode.json"
check_mode() {
  python3 - "$governor" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    mode = json.load(f)["mode"]
if mode in {"LIGHT", "PAUSE-HEAVY"}:
    sys.exit("Build deferred by workload governor: " + mode)
PY
}
d=(/Applications/Kiri.app/Contents/Resources/bin/docker --context kiri)
test "$("${d[@]}" info --format '{{.Architecture}}')" = aarch64
kit=$(cd "$(dirname "$0")" && pwd)
backend=$(cd "$kit/../.." && pwd)
frontend=${1:-$(dirname "$backend")/frontend}
scratch=$(mktemp -d)
export RELEASE_TAG="smoke-$$"
export BACKEND_SOURCE="$scratch/backend" FRONTEND_SOURCE="$scratch/frontend"
export GDG_CONFIG="$scratch" API_PROXY_TARGET=http://gdg-backend:3001
export APP_NETWORK_PREFIX="${APP_NETWORK_PREFIX:-10.253.$((RANDOM % 256))}" CSP_IMAGE_ORIGINS=https://storage.example.invalid NEXT_PUBLIC_API_URL=https://api.example.invalid
export TUNNEL_IMAGE=docker.io/cloudflare/cloudflared@sha256:55c7e3e8d89d5e8d20b75a82f3602cbf98e06db406e73e282073cfdc5a9a3af6
cat > "$scratch/backend.env" <<'ENV'
DATABASE_URL=postgresql://postgres:fixture@db/postgres
BETTER_AUTH_SECRET=abcdefghijklmnopqrstuvwxyz0123456789
TRUST_PROXY_HOPS=0
FRONTEND_URL=https://example.invalid
ENV
echo 'API_PROXY_TARGET=http://gdg-backend:3001' > "$scratch/frontend.env"
echo 'TUNNEL_TOKEN=fixture' > "$scratch/tunnel.env"
cat > "$scratch/smoke.yml" <<'YAML'
services:
  backend:
    container_name: gdg-backend-${RELEASE_TAG}
  db:
    image: postgres:17-alpine
    networks: [app]
    environment:
      POSTGRES_PASSWORD: fixture
    healthcheck:
      test: [CMD, pg_isready, -U, postgres]
      interval: 2s
      timeout: 3s
      retries: 20
YAML
c=("${d[@]}" compose --env-file /dev/null -p "gdg-$RELEASE_TAG" -f "$kit/compose.oracle.yml")
launched=false
cleanup() {
  if $launched; then "${c[@]}" down -v; fi
  python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1])' "$scratch"
}
trap cleanup EXIT
mkdir "$BACKEND_SOURCE" "$FRONTEND_SOURCE"
"${c[@]}" config --quiet
c+=(-f "$scratch/smoke.yml")
"${c[@]}" config --quiet
echo 'Production and smoke Compose configurations validated'
check_mode
for app in backend frontend; do
  check_mode
  git -C "${!app}" archive HEAD | tar -x -C "$scratch/$app"
  "${c[@]}" build "$app"
done
launched=true
"${c[@]}" up -d --wait db
"${c[@]}" up -d --wait --wait-timeout 180 --no-build --pull never backend frontend
"${c[@]}" ps
