#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/backend/deploy/oracle"
test "$(id -u)" != 0
state="$HOME/.local/state/gdg"
install -d -m 700 "$state"
exec 9>"$state/release.lock"
flock -n 9
compose() {
  local dir=$1
  shift
  docker compose --env-file "$dir/tags.env" -p gdg-oracle -f "$dir/compose.yml" "$@"
}
activate() {
  compose "$1" up -d --no-build --pull never --wait --wait-timeout 180
}
point() {
  ln -sfn "$2" "$state/$1.next"
  mv -Tf "$state/$1.next" "$state/$1"
}
current=$(readlink -f "$state/current" || true)
if [[ ${1:-} == rollback ]]; then
  test -f "$state/previous/tags.env"
  candidate=$(readlink -f "$state/previous")
else
  for name in backend frontend tunnel backup; do
    file="$HOME/.config/gdg/$name.env"
    while IFS='=' read -r key _; do
      grep -qE "^$key=.+" "$file" || { echo "Missing $key in $name.env" >&2; exit 1; }
    done < "env/$name.env.example"
  done
  tunnel_image=${1:-docker.io/cloudflare/cloudflared@sha256:55c7e3e8d89d5e8d20b75a82f3602cbf98e06db406e73e282073cfdc5a9a3af6}
  [[ $tunnel_image =~ ^docker.io/cloudflare/cloudflared@sha256:[a-f0-9]{64}$ ]]
  candidate=$(mktemp -d "$state/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
  cp compose.oracle.yml "$candidate/compose.yml"
  printf 'RELEASE_TAG=%s\nTUNNEL_IMAGE=%s\n' "${candidate##*/}" "$tunnel_image" > "$candidate/tags.env"
  for app in backend frontend; do git -C "$HOME/$app" rev-parse HEAD; done > "$candidate/commits"
  compose "$candidate" config --quiet
  compose "$candidate" pull cloudflared
  for app in backend frontend; do compose "$candidate" build --pull "$app"; done
  install -d "$HOME/.config/systemd/user"
  install -m 644 systemd/* "$HOME/.config/systemd/user/"
  systemctl --user daemon-reload
  systemctl --user enable --now gdg-backup.timer
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
