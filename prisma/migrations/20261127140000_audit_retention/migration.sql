BEGIN;
CREATE FUNCTION public.retain_audit_logs(requested_cutoff timestamptz, dry_run boolean)
RETURNS TABLE ("staffLogs" integer, "rightsLogs" integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  cutoff timestamptz := LEAST(requested_cutoff, CURRENT_TIMESTAMP - INTERVAL '12 months');
BEGIN
  IF dry_run IS NOT FALSE THEN
    SELECT count(*) INTO "staffLogs" FROM (SELECT 1 FROM public.staff_read_audit WHERE read_at <= cutoff LIMIT 100) eligible;
    SELECT count(*) INTO "rightsLogs" FROM (SELECT 1 FROM public.rights_audit WHERE created_at <= cutoff LIMIT 100) eligible;
  ELSE
    DELETE FROM public.staff_read_audit WHERE id IN (
      SELECT id FROM public.staff_read_audit WHERE read_at <= cutoff ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS "staffLogs" = ROW_COUNT;
    DELETE FROM public.rights_audit WHERE id IN (
      SELECT id FROM public.rights_audit WHERE created_at <= cutoff ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS "rightsLogs" = ROW_COUNT;
  END IF;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.retain_audit_logs(timestamptz, boolean) FROM PUBLIC;
COMMIT;
