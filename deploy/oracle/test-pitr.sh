#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
fixture=$(mktemp -d "$HOME/.gdg-pitr.XXXXXXXX")
export GDG_CONFIG="$fixture" GDG_RECOVERY_CONFIG="$fixture" BACKEND_SOURCE="$(cd ../.. && pwd)"
export RELEASE_TAG="drill-$(date +%s)-$$" APP_NETWORK_PREFIX=172.31.125 API_PROXY_TARGET=http://gdg-backend:3001 CSP_IMAGE_ORIGINS=https://assets.invalid NEXT_PUBLIC_API_URL=https://api.invalid
export BACKEND_PORT=3001 FRONTEND_PORT=3000 APP_CPUS=1 APP_MEMORY=256m
project="pitr-$RELEASE_TAG"
primary() { docker compose -p "$project" -f compose.jeddah.yml -f "$fixture/store.yml" "$@"; }
recovery() { docker compose -p "$project-recovery" -f compose.pitr-recovery.yml -f "$fixture/recovery.yml" "$@"; }
cleanup() {
  recovery down -v
  primary down -v
  rm -rf "$fixture"
}
trap cleanup EXIT
umask 077
touch "$fixture"/{backend,frontend,backup}.env
for key in POSTGRES_PASSWORD APP_PASSWORD MIGRATION_PASSWORD BACKUP_PASSWORD; do
  echo "$key=$(openssl rand -hex 20)"
done > "$fixture/postgres.env"
access=$(openssl rand -hex 10)
secret=$(openssl rand -hex 20)
cat > "$fixture/pitr.env" <<ENV
PGBACKREST_REPO1_S3_ENDPOINT=store
PGBACKREST_REPO1_STORAGE_PORT=9000
PGBACKREST_REPO1_STORAGE_VERIFY_TLS=n
PGBACKREST_REPO1_S3_KEY=$access
PGBACKREST_REPO1_S3_KEY_SECRET=$secret
PGBACKREST_REPO1_S3_BUCKET=drill
PGBACKREST_REPO1_CIPHER_PASS=$(openssl rand -hex 32)
ENV
mkdir "$fixture/certs"
openssl req -new -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=store -keyout "$fixture/certs/private.key" -out "$fixture/certs/public.crt" 2>/dev/null
cat > "$fixture/store.yml" <<YAML
services:
  store:
    image: bitnamilegacy/minio@sha256:6dabb4a2088c9a79908de3bc05f4586c23ad2182c8908e7e3acbf61c1467fb20
    user: root
    entrypoint: [minio]
    command: [server, /data, --certs-dir, /certs]
    environment:
      MINIO_ROOT_USER: "$access"
      MINIO_ROOT_PASSWORD: "$secret"
    volumes:
      - "$fixture/certs:/certs:ro"
    networks: [archive_egress]
  client:
    image: bitnamilegacy/minio-client@sha256:73bd39f7899a0cef12b8dd5df13aa93a3ed1aaa44236542442e9ac76819ac158
    entrypoint: [mc]
    networks: [archive_egress]
    environment:
      MC_HOST_drill: "https://$access:$secret@store:9000"
YAML
cat > "$fixture/recovery.yml" <<YAML
services:
  recovery:
    networks: [store]
networks:
  store:
    external: true
    name: ${project}_archive_egress
YAML
primary up -d store
primary run --rm --no-deps client --insecure mb --ignore-existing drill/drill
primary up -d --build --wait postgres
pg() { primary exec -T -u postgres postgres "$@"; }
sql() { pg psql -XAt -v ON_ERROR_STOP=1 -d gdg -c "$1"; }
backrest() { pg pgbackrest --stanza=gdg "$@"; }
backrest stanza-create
sql 'create table drill(id integer primary key); insert into drill values (1)'
backrest check
backrest --type=full backup
sleep 2
backrest --type=diff backup
sleep 2
sql 'insert into drill values (2)'
target=$(sql 'select clock_timestamp()')
sql 'delete from drill where id=1; insert into drill values (3)'
query="select string_agg(id::text, ',' order by id) from drill"
test "$(sql "$query")" = 2,3
backrest check
recovery run --rm --no-deps recovery pgbackrest --stanza=gdg --type=time --target="$target" --target-action=pause restore
recovery up -d
for ((i=0;i<90;i++)); do
  if [[ $(recovery exec -T recovery psql -XAt -d gdg -c 'select pg_get_wal_replay_pause_state()' 2>/dev/null) == paused ]]; then break; fi
  sleep 1
done
test "$(recovery exec -T recovery psql -XAt -d gdg -c 'select pg_get_wal_replay_pause_state()')" = paused
actual=$(recovery exec -T recovery psql -XAt -d gdg -c "$query")
test "$actual" = 1,2
recovery exec -T recovery psql -XAt -v ON_ERROR_STOP=1 -d gdg -c 'select pg_wal_replay_resume()'
for ((i=0;i<30;i++)); do
  if [[ $(recovery exec -T recovery psql -XAt -d gdg -c 'select pg_is_in_recovery()') == f ]]; then break; fi
  sleep 1
done
test "$(recovery exec -T recovery psql -XAt -d gdg -c 'select pg_is_in_recovery()')" = f
echo "UTC target $target; live rows 2,3; recovered rows $actual; pause and promotion verified"
