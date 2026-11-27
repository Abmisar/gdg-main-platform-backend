#!/usr/bin/env bash
set -euo pipefail
unset API_PROXY_TARGET CSP_IMAGE_ORIGINS CSP_REPORT_URI NEXT_PUBLIC_API_URL APP_NETWORK_PREFIX
cd "$(dirname "$0")"
target=${1:?pass dev or prod}
revision=${2:?pass a main commit or rollback}
[[ $# == 2 && ( $target == dev || $target == prod ) ]] || exit 64
export GDG_CONFIG="$HOME/.config/gdg/$target"
umask 077
test "$(id -u)" != 0
state="$HOME/.local/state/gdg/$target"
install -d -m 700 "$state"
exec 9>"$state/../release.lock"
flock 9
compose() {
  local dir=$1
  shift
  docker compose --env-file "$dir/tags.env" -p "gdg-$target" -f "$dir/compose.yml" "$@"
}
activate() {
  compose "$1" up -d --no-build --pull never --wait --wait-timeout 180
}
point() {
  ln -sfn "$2" "$state/$1.next"
  mv -Tf "$state/$1.next" "$state/$1"
}
current=$(readlink -f "$state/current" || true)
if [[ $revision == rollback ]]; then
  test -f "$state/previous/tags.env"
  candidate=$(readlink -f "$state/previous")
else
  for name in backend frontend network; do
    file="$GDG_CONFIG/$name.env"
    while IFS='=' read -r key _; do
      if [[ $key == CSP_REPORT_URI ]]; then continue; fi
      grep -qE "^$key=.+" "$file" || { echo "Missing $key in $name.env" >&2; exit 1; }
    done < "env/$name.env.example"
  done
  [[ $revision =~ ^[0-9a-f]{40}$ && ( $GDG_APP == backend || $GDG_APP == frontend ) ]] || exit 64
  candidate=$(mktemp -d "$state/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
  cp compose.oracle.yml "$candidate/compose.yml"
  if [[ $target == dev ]]; then
    settings=(13000 13001 0.5 768m)
  else
    settings=(3000 3001 1.5 2g)
  fi
  printf 'FRONTEND_PORT=%s\nBACKEND_PORT=%s\nAPP_CPUS=%s\nAPP_MEMORY=%s\n' "${settings[@]}" > "$candidate/tags.env"
  printf 'RELEASE_TAG=%s-%s\nGDG_CONFIG=%s\n' "$target" "${candidate##*/}" "$GDG_CONFIG" >> "$candidate/tags.env"
  for app in backend frontend; do
    repo="$HOME/$app"
    git -C "$repo" fetch origin +refs/heads/main:refs/remotes/origin/main
    if [[ $app == "$GDG_APP" ]]; then
      sha=$revision
      if [[ $target == dev ]]; then
        [[ $sha == "$(git -C "$repo" rev-parse origin/main)" ]] || { echo "Superseded dev release"; exit 0; }
      fi
    elif [[ -f "$current/$app.sha" ]]; then
      sha=$(cat "$current/$app.sha")
    else
      sha=$(cat "$GDG_CONFIG/$app.sha")
    fi
    [[ $sha =~ ^[0-9a-f]{40}$ ]] || exit 64
    git -C "$repo" merge-base --is-ancestor "$sha" origin/main
    printf '%s\n' "$sha" > "$candidate/$app.sha"
    mkdir "$candidate/$app"
    git -C "$repo" archive "$sha" | tar -x -C "$candidate/$app"
    printf '%s_SOURCE=%s/%s\n' "${app^^}" "$candidate" "$app" >> "$candidate/tags.env"
  done
  python3 - "$GDG_CONFIG" "$candidate/tags.env" <<'PYCONFIG'
from pathlib import Path
import sys

root = Path(sys.argv[1])
with Path(sys.argv[2]).open("a") as out:
    for name, keys in (("network", ("APP_NETWORK_PREFIX",)),
                       ("frontend", ("API_PROXY_TARGET", "CSP_IMAGE_ORIGINS", "CSP_REPORT_URI", "NEXT_PUBLIC_API_URL"))):
        values = dict(line.split("=", 1) for line in (root / (name + ".env")).read_text().splitlines()
                      if "=" in line)
        for key in keys:
            value = values.get(key, "")
            if any(char in value for char in ("'", chr(92), chr(0), chr(13))):
                raise ValueError("Invalid Compose value for " + key)
            if key == "API_PROXY_TARGET" and value != "http://gdg-backend:3001":
                raise ValueError("Oracle rewrites require the internal API target")
            out.write(f"{key}='{value}'\n")
PYCONFIG
  compose "$candidate" config --quiet
  for app in backend frontend; do compose "$candidate" build --pull "$app"; done

fi
if ! activate "$candidate"; then
  if [[ -f "$current/tags.env" ]]; then
    echo 'Activation failed. Restoring the last healthy release.' >&2
    activate "$current"
  else
    compose "$candidate" stop
  fi
  exit 1
fi
if [[ -f "$current/tags.env" ]]; then point previous "$current"; fi
point current "$candidate"
