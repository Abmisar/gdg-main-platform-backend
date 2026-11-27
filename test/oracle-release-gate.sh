#!/usr/bin/env bash
set -euo pipefail
release=$(cd "$(dirname "$0")/../deploy/oracle" && pwd)/release.sh
sandbox=$(mktemp -d)
trap 'rm -rf "$sandbox"' EXIT
export HOME="$sandbox" PATH="$sandbox/bin:$PATH"
state="$HOME/.local/state/gdg/prod"
mkdir -p "$HOME/backend/deploy/oracle" "$state/previous" "$sandbox/bin"
touch "$state/previous/tags.env"
cat > "$sandbox/bin/docker" <<'SH'
#!/usr/bin/env bash
echo "$*" >> "$HOME/calls"
case "$*" in
  *"prisma migrate status"*) exit "${MIGRATION_STATUS:-0}";;
esac
SH
for name in id flock; do
  printf '#!/bin/sh\necho 1000\n' > "$sandbox/bin/$name"
done
chmod +x "$sandbox/bin/"*
if MIGRATION_STATUS=1 bash "$release" prod rollback; then exit 1; fi
grep -q 'prisma migrate status' "$HOME/calls"
if grep -q 'up -d' "$HOME/calls"; then exit 1; fi
test ! -e "$state/current"
