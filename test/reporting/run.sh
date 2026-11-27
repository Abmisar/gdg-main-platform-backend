#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
name="gdg-reporting-test-$$"
password=$(openssl rand -hex 24)
docker run -d --name "$name" -p "$(python3 -c 'import socket; print(socket.gethostbyname("localhost"))')::5432" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=gdg postgres:18-bookworm postgres -c log_connections=authorization -c log_disconnections=on >/dev/null
trap 'docker rm -f "$name" >/dev/null' EXIT
sql() { docker exec -i "$name" psql -Xq -v ON_ERROR_STOP=1 -U postgres -d gdg "$@"; }
until docker exec "$name" pg_isready -h localhost -U postgres >/dev/null; do sleep 1; done
for file in prisma/migrations/*/migration.sql; do sql < "$file"; done
sql -c "INSERT INTO field_backfill_verification VALUES (true)"
sql < prisma/deferred/20261127130000_drop_plaintext/migration.sql
sql < docs/sql/field-access.sql
{ echo 'SET ROLE gdg_migrate;'; cat docs/sql/reporting-v1.sql; } | sql
sql < docs/sql/field-access.sql
sql -v pw="$password" <<'SQL'
CREATE TABLE public.reporting_disposable_fixture (created_at timestamptz DEFAULT now());
INSERT INTO public.reporting_disposable_fixture DEFAULT VALUES;
GRANT SELECT ON public.reporting_disposable_fixture TO gdg_app;
ALTER ROLE gdg_app PASSWORD :'pw';
INSERT INTO person (full_name_encrypted) SELECT 'f2.test.' || repeat('a',16) || '.' || repeat('b',22) || '.x' FROM generate_series(1,5);
INSERT INTO member (person_id, join_date) SELECT person_id, current_date FROM person;
INSERT INTO membership_request (person_id, application_data_encrypted) SELECT person_id, to_jsonb(full_name_encrypted) FROM person LIMIT 4;
SET ROLE gdg_reporting;
DO $$ BEGIN
  IF EXISTS (SELECT FROM reporting.fact_applications) THEN RAISE EXCEPTION 'small application group visible'; END IF;
  IF has_schema_privilege(current_user,'public','usage') OR has_schema_privilege(current_user,'reporting_private','usage') THEN RAISE EXCEPTION 'schema leak'; END IF;
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema='reporting' AND column_name ~ '(person_id|member_id|email|encrypted|phone|answer|token|reason|notes|idx)') THEN RAISE EXCEPTION 'personal column'; END IF;
END $$;
RESET ROLE;
INSERT INTO membership_request (person_id, application_data_encrypted) SELECT person_id, to_jsonb(full_name_encrypted) FROM person WHERE person_id NOT IN (SELECT person_id FROM membership_request);
SET ROLE gdg_reporting;
DO $$ BEGIN IF (SELECT applications FROM reporting.fact_applications) IS DISTINCT FROM 5::bigint THEN RAISE EXCEPTION 'five suppressed'; END IF; END $$;
SQL
reader() { docker exec -i "$name" psql -Xq -v ON_ERROR_STOP=1 -U gdg_reporting -d gdg "$@"; }
if reader -c 'SELECT * FROM public.person LIMIT 0'; then exit 1; fi
reader <<'SQL'
DO $$
DECLARE v record;
BEGIN
  IF current_setting('statement_timeout') <> '30s' OR current_setting('default_transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION 'missing reporting session limits';
  END IF;
  FOR v IN SELECT oid FROM pg_class WHERE relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public') AND relkind IN ('r','v','m','p') LOOP
    IF has_table_privilege(current_user,v.oid,'SELECT') THEN RAISE EXCEPTION 'raw table grant'; END IF;
  END LOOP;
  FOR v IN SELECT viewname FROM pg_views WHERE schemaname='reporting' LOOP
    EXECUTE format('SELECT * FROM reporting.%I',v.viewname);
  END LOOP;
END $$;
SQL
port=$(docker inspect -f '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' "$name")
export REPORTING_FIXTURE_URL="postgresql://gdg_app:$password@localhost:$port/gdg"
node_modules/.bin/vitest run --config vitest.config.e2e.ts test/reporting.e2e-spec.ts
sql -c "SET ROLE gdg_reporting; DO \$\$ BEGIN IF EXISTS (SELECT FROM reporting.dim_member_pseudo) THEN RAISE EXCEPTION 'small member cohort visible'; END IF; END \$\$"
