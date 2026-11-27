BEGIN;
DO $$
DECLARE principal text;
BEGIN
  FOREACH principal IN ARRAY ARRAY['gdg_migrate','gdg_app','gdg_audit_reader'] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = principal) THEN
      EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS', principal);
    END IF;
    IF principal <> 'gdg_migrate' AND EXISTS (
      SELECT FROM pg_roles r WHERE r.rolname = principal AND (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls
        OR EXISTS (SELECT FROM pg_auth_members m WHERE m.member = r.oid))
    ) THEN RAISE EXCEPTION 'Runtime login % has existing elevated privileges', principal; END IF;
  END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, gdg_app, gdg_audit_reader;
GRANT USAGE, CREATE ON SCHEMA public TO gdg_migrate;
GRANT USAGE ON SCHEMA public TO gdg_app, gdg_audit_reader;

DO $$
DECLARE
  app_table text;
  seq_name text;
  enum_name text;
BEGIN
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC, gdg_app, gdg_audit_reader', current_database());
  EXECUTE format('GRANT CREATE, TEMPORARY ON DATABASE %I TO gdg_migrate', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO gdg_app, gdg_migrate, gdg_audit_reader', current_database());
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE public._prisma_migrations OWNER TO gdg_migrate;
    REVOKE ALL ON public._prisma_migrations FROM PUBLIC, gdg_app;
  END IF;
  FOR enum_name IN SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = 'public'::regnamespace LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO gdg_migrate', enum_name);
  END LOOP;
  IF to_regprocedure('public.set_people_updated_at()') IS NOT NULL THEN ALTER FUNCTION public.set_people_updated_at() OWNER TO gdg_migrate; END IF;
  IF to_regprocedure('public.stage_deleted_guest_pass()') IS NOT NULL THEN ALTER FUNCTION public.stage_deleted_guest_pass() OWNER TO gdg_migrate; END IF;
  IF to_regprocedure('public.prevent_membership_number_change()') IS NOT NULL THEN ALTER FUNCTION public.prevent_membership_number_change() OWNER TO gdg_migrate; END IF;
  FOREACH app_table IN ARRAY ARRAY[
    'person',
    'role',
    'permission',
    'role_permission',
    'member',
    'skill',
    'member_skill',
    'member_role',
    'committee',
    'committee_permission',
    'member_committee',
    'wallet_membership_link',
    'wallet_barcode_alias',
    'membership_request',
    'membership_request_committee',
    'membership_request_global_role',
    'announcement',
    'non_member_registration',
    'email_verification_challenge',
    'pending_signup',
    'signup_verification',
    'revoked_auth_token',
    'auth_rate_limit_bucket',
    'person_email_identity',
    'committee_task',
    'committee_point_entry',
    'global_point_entry',
    'events',
    'event_questions',
    'event_registrations',
    'wallet_guest_projection',
    'registration_email_delivery',
    'registration_answers',
    'registration_blacklist_entries',
    'auth_user',
    'auth_session',
    'auth_account',
    'auth_verification',
    'better_auth_rate_limit',
    'consent_record', 'rights_audit', 'account_deletion', 'deletion_tombstone', 'manual_rights_request',
    'wallet_guest_withdrawal', 'event_retention_aggregate', 'staff_read_audit'
  ] LOOP
    IF to_regclass(format('public.%I', app_table)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I OWNER TO gdg_migrate', app_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, gdg_app, gdg_audit_reader', app_table);
    IF app_table = 'staff_read_audit' THEN
      GRANT INSERT (actor_member_id, action, status, scope, count, read_at) ON public.staff_read_audit TO gdg_app;
    ELSIF app_table IN ('permission', 'role', 'committee_permission', 'role_permission') THEN
      EXECUTE format('GRANT SELECT ON public.%I TO gdg_app',app_table);
    ELSIF app_table IN ('consent_record','rights_audit','deletion_tombstone') THEN
      EXECUTE format('GRANT SELECT, INSERT ON public.%I TO gdg_app',app_table);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO gdg_app', app_table);
    END IF;
    FOR seq_name IN
      SELECT pg_get_serial_sequence(format('public.%I', app_table), column_name)
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = app_table
    LOOP
      IF seq_name IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, gdg_audit_reader, gdg_app', seq_name);
        IF app_table NOT IN ('permission','role','role_permission','committee_permission') THEN
          EXECUTE format('GRANT USAGE ON SEQUENCE %s TO gdg_app', seq_name);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  IF to_regprocedure('public.retain_audit_logs(timestamptz,boolean)') IS NOT NULL THEN
    ALTER FUNCTION public.retain_audit_logs(timestamptz, boolean) OWNER TO gdg_migrate;
    GRANT EXECUTE ON FUNCTION public.retain_audit_logs(timestamptz, boolean) TO gdg_app;
  END IF;
  IF to_regclass('public.recent_staff_reads') IS NOT NULL THEN
    ALTER VIEW public.recent_staff_reads OWNER TO gdg_migrate;
    REVOKE ALL ON public.recent_staff_reads FROM PUBLIC, gdg_app;
    GRANT SELECT ON public.recent_staff_reads TO gdg_audit_reader;
  END IF;
END $$;
COMMIT;
