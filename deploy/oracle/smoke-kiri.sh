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
check_mode
d=(/Applications/Kiri.app/Contents/Resources/bin/docker --context kiri)
test "$("${d[@]}" info --format '{{.Architecture}}')" = aarch64
backend=$(cd "$(dirname "$0")/../.." && pwd)
frontend=${1:-$(dirname "$backend")/frontend}
run="gdg-smoke-$$"
contexts=$(mktemp -d)
cleanup() {
  "${d[@]}" rm -f "$run-web" "$run-api" "$run-db" >/dev/null 2>&1 || true
  "${d[@]}" network rm "$run" >/dev/null 2>&1 || true
  python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1])' "$contexts"
}
trap cleanup EXIT
for app in backend frontend; do
  check_mode
  mkdir "$contexts/$app"
  git -C "${!app}" archive HEAD | tar -x -C "$contexts/$app"
  file=Dockerfile
  if [[ $app == frontend ]]; then file=Containerfile; fi
  "${d[@]}" build --platform linux/arm64 -f "$contexts/$app/$file" -t "gdg-$app:smoke" "$contexts/$app"
done
"${d[@]}" network create "$run" >/dev/null
"${d[@]}" run -d --network "$run" --name "$run-db" -e POSTGRES_PASSWORD=fixture postgres:17-alpine >/dev/null
for i in {1..30}; do
  if "${d[@]}" exec "$run-db" pg_isready -U postgres; then break; fi
  sleep 1
done
"${d[@]}" run -d --network "$run" --name "$run-api" -e "DATABASE_URL=postgresql://postgres:fixture@$run-db/postgres" -e BETTER_AUTH_SECRET=abcdefghijklmnopqrstuvwxyz0123456789 -e FRONTEND_URL=https://example.invalid gdg-backend:smoke >/dev/null
"${d[@]}" run -d --network "$run" --name "$run-web" -e API_PROXY_TARGET=https://api.example.invalid gdg-frontend:smoke >/dev/null
for endpoint in "$run-api:3001/health/ready" "$run-web:3000/en"; do
  "${d[@]}" exec "$run-api" node -e 'const url="http://"+process.argv[1]; (async()=>{for(let i=0;i<45;i++){try{if((await fetch(url)).ok)return}catch{} await new Promise(r=>setTimeout(r,1000))}process.exitCode=1})()' "$endpoint"
done
