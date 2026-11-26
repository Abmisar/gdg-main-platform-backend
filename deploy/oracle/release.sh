#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/backend/deploy/oracle"
test "$(id -u)" != 0
tunnel_image=${1:-docker.io/cloudflare/cloudflared@sha256:55c7e3e8d89d5e8d20b75a82f3602cbf98e06db406e73e282073cfdc5a9a3af6}
[[ $tunnel_image =~ ^docker.io/cloudflare/cloudflared@sha256:[a-f0-9]{64}$ ]]
for name in backend frontend tunnel backup; do
  file="$HOME/.config/gdg/$name.env"
  test -s "$file"
  while IFS='=' read -r key _; do
    grep -qE "^$key=.+" "$file" || { echo "Missing $key in $name.env" >&2; exit 1; }
  done < "env/$name.env.example"
done
test "$(podman info --format '{{.Host.NetworkBackend}}')" = netavark
podman build --platform linux/arm64 -t "localhost/gdg-backend:$(git -C "$HOME/backend" rev-parse HEAD)" -f "$HOME/backend/Dockerfile" "$HOME/backend"
podman build --platform linux/arm64 -t "localhost/gdg-frontend:$(git -C "$HOME/frontend" rev-parse HEAD)" --build-arg API_PROXY_TARGET=https://api.gdguj.org -f "$HOME/frontend/Containerfile" "$HOME/frontend"
podman pull "$tunnel_image"
for name in backend frontend tunnel; do
  tag="localhost/gdg-$name"
  image="$tunnel_image"
  if [[ $name != tunnel ]]; then image="$tag:$(git -C "$HOME/$name" rev-parse HEAD)"; fi
  if podman image exists "$tag:active"; then podman tag "$tag:active" "$tag:previous"; fi
  podman tag "$image" "$tag:active"
done
install -d "$HOME/.config/containers/systemd" "$HOME/.config/systemd/user"
install -m 644 quadlet/* "$HOME/.config/containers/systemd/"
install -m 644 systemd/* "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user restart gdg-backend.service gdg-frontend.service gdg-tunnel.service
systemctl --user enable --now gdg-backup.timer
