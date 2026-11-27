#!/usr/bin/env bash
set -euo pipefail
unset API_PROXY_TARGET CSP_IMAGE_ORIGINS CSP_REPORT_URI NEXT_PUBLIC_API_URL APP_NETWORK_PREFIX
cd "$(dirname "$0")"
target=${1:?pass dev or prod}
revision=${2:?pass a main commit or rollback}
[[ ( $# == 2 || ( $# == 3 && $target == prod && ( $revision == activate || $revision == enable-jobs ) ) ) && ( $target == dev || $target == prod ) ]] || exit 64
export GDG_CONFIG="$HOME/.config/gdg/$target"
umask 077
test "$(id -u)" != 0
state="$HOME/.local/state/gdg/$target"
install -d -m 700 "$state"
exec 9>"$state/../release.lock"
flock 9
config_dir() {
  local dir=$1
  local config_dir="$HOME/.config/gdg/$target"
  if [[ -f "$dir/config-dir" ]]; then config_dir=$(cat "$dir/config-dir"); fi
  printf '%s\n' "$config_dir"
}
compose() {
  local dir=$1
  shift
  GDG_CONFIG="$(config_dir "$dir")" docker compose --env-file "$dir/tags.env" -p "gdg-$target" -f "$dir/compose.yml" "$@"
}
activate() {
  compose "$1" up -d --no-build --pull never --wait --wait-timeout 180
}
point() {
  ln -sfn "$2" "$state/$1.next"
  mv -Tf "$state/$1.next" "$state/$1"
}
current=$(readlink -f "$state/current" || true)
images() {
  compose "$1" --profile maintenance config --images | sort -u | while read -r image; do
    docker image inspect --format '{{.Id}}' "$image" | xargs printf '%s %s\n' "$image"
  done
}
case $revision in
  activate|enable-jobs)
    [[ ${3:-} =~ ^[0-9]{8}T[0-9]{6}Z-[[:alnum:]]+$ ]]
    candidate="$state/$3"
    images "$candidate" | diff "$candidate/images" -
    expected=false
    if [[ $revision == enable-jobs ]]; then
      [[ $current == "$candidate" ]]
      expected=true
    fi
    compose "$candidate" config --format json | python3 -c 'import json,sys; sys.exit(json.load(sys.stdin)["services"]["backend"]["environment"].get("SCHEDULERS_ENABLED") != sys.argv[1])' "$expected"
    compose "$candidate" run --rm --no-deps --env-from-file "$(config_dir "$candidate")/migration.env" backend ./node_modules/.bin/prisma migrate status --config prisma7.config.ts
    if [[ -f "$(config_dir "$candidate")/pitr.env" && -f "$candidate/pitr-ops.py" ]]; then python3 "$candidate/pitr-ops.py" check; fi
    activate "$candidate"
    if [[ $revision == activate && $current != "$candidate" ]]; then
      if [[ -f "$current/tags.env" ]]; then point previous "$current"; fi
      point current "$candidate"
    fi
    if [[ $revision == enable-jobs ]]; then
      install -d "$HOME/.config/systemd/user"
      install -m 644 "$candidate/gdg-backup-jeddah.service" "$HOME/.config/systemd/user/gdg-backup.service"
      systemctl --user daemon-reload
      systemctl --user enable --now gdg-backup.timer
      if [[ -f "$(config_dir "$candidate")/pitr.env" && -f "$candidate/pitr-ops.py" ]]; then
        install -m 644 "$candidate/"gdg-pitr-* "$HOME/.config/systemd/user/"
        systemctl --user daemon-reload
        systemctl --user enable --now gdg-pitr-backup.timer gdg-pitr-check.timer
      fi
    fi
    exit
    ;;
esac
if [[ $revision == rollback ]]; then
  test -f "$state/previous/tags.env"
  candidate=$(readlink -f "$state/previous")
else
  regional=false
  templates=(backend frontend network)
  if [[ $target == prod && ( -f "$GDG_CONFIG/prepare-jeddah" || -f "$current/images" ) ]]; then
    regional=true
    export GDG_CONFIG="$GDG_CONFIG/jeddah"
    templates=(backend.jeddah frontend network postgres backup.jeddah migration)
    if [[ -f "$GDG_CONFIG/pitr.env" ]]; then templates+=(pitr.jeddah); fi
  fi
  for name in "${templates[@]}"; do
    file="$GDG_CONFIG/${name%%.*}.env"
    while IFS='=' read -r key _; do
      if [[ $key == CSP_REPORT_URI ]]; then continue; fi
      grep -qE "^$key=.+" "$file" || { echo "Missing $key in $name.env" >&2; exit 1; }
    done < "env/$name.env.example"
  done
  [[ $revision =~ ^[0-9a-f]{40}$ && ( $GDG_APP == backend || $GDG_APP == frontend ) ]] || exit 64
  candidate=$(mktemp -d "$state/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
  printf '%s\n' "$GDG_CONFIG" > "$candidate/config-dir"
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
  if $regional; then
    cp compose.jeddah.yml "$candidate/compose.yml"
    cp init-postgres.sh snapshot-run.sh gdg-backup-jeddah.service "$candidate/"
    cp pitr-ops.py systemd/gdg-pitr-* "$candidate/"
    compose "$candidate" build --pull postgres backup
  fi
  compose "$candidate" config --quiet
  for app in backend frontend; do compose "$candidate" build --pull "$app"; done
  if $regional; then
    images "$candidate" > "$candidate/images"
    if [[ -f "$HOME/.config/gdg/prod/prepare-jeddah" ]]; then
      echo "Prepared release ${candidate##*/}"
      exit 0
    fi
  fi

fi
compose "$candidate" run --rm --no-deps --env-from-file "$(config_dir "$candidate")/migration.env" backend ./node_modules/.bin/prisma migrate status --config prisma7.config.ts
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
