\getenv migrate_password GDG_MIGRATION_PASSWORD
\getenv app_password GDG_APP_PASSWORD
\getenv reader_password GDG_AUDIT_READER_PASSWORD
ALTER ROLE gdg_migrate PASSWORD :'migrate_password';
ALTER ROLE gdg_app PASSWORD :'app_password';
ALTER ROLE gdg_audit_reader PASSWORD :'reader_password';
