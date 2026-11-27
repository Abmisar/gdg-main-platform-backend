#!/bin/sh
set -eu
psql -X --username postgres --dbname gdg -v ON_ERROR_STOP=1 <<'SQL'
\getenv app_password APP_PASSWORD
\getenv backup_password BACKUP_PASSWORD
\getenv migration_password MIGRATION_PASSWORD
CREATE ROLE gdg_app LOGIN PASSWORD :'app_password';
CREATE ROLE gdg_backup LOGIN PASSWORD :'backup_password';
CREATE ROLE gdg_migrate LOGIN PASSWORD :'migration_password';
REVOKE ALL ON DATABASE gdg FROM PUBLIC;
GRANT CONNECT ON DATABASE gdg TO gdg_migrate, gdg_app, gdg_backup;
GRANT TEMPORARY ON DATABASE gdg TO gdg_migrate;
CREATE SCHEMA migration_audit AUTHORIZATION gdg_migrate;
SET ROLE gdg_migrate;
CREATE TABLE migration_audit.asset_urls (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name text NOT NULL,
    row_key text NOT NULL,
    old_url text NOT NULL,
    new_url text NOT NULL,
    reversed_at timestamptz
);
RESET ROLE;
ALTER SCHEMA public OWNER TO gdg_migrate;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gdg_app, gdg_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO gdg_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO gdg_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE gdg_migrate IN SCHEMA public GRANT SELECT ON TABLES TO gdg_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE gdg_migrate IN SCHEMA public GRANT SELECT ON SEQUENCES TO gdg_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE gdg_migrate IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gdg_app;
ALTER DEFAULT PRIVILEGES FOR ROLE gdg_migrate IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO gdg_app;
SQL
