BEGIN;
CREATE SCHEMA reporting;
CREATE SCHEMA reporting_private;
CREATE TABLE reporting_private.event_labels (
    event_id integer PRIMARY KEY REFERENCES public.events ON DELETE CASCADE,
    name text NOT NULL, event_type text, location text
);
CREATE TABLE reporting_private.calendar (
    day date PRIMARY KEY,
    hijri text NOT NULL
);
CREATE TABLE reporting_private.member_key (
    member_id integer PRIMARY KEY REFERENCES public.member ON DELETE CASCADE,
    pseudo_id text UNIQUE NOT NULL
);
CREATE TABLE reporting_private.roster (
    semester text NOT NULL,
    member_id integer REFERENCES public.member ON DELETE CASCADE,
    PRIMARY KEY (semester, member_id)
);
CREATE TABLE reporting_private.assignment (
    member_id integer REFERENCES public.member ON DELETE CASCADE,
    committee_id integer REFERENCES public.committee ON DELETE CASCADE,
    PRIMARY KEY (member_id, committee_id)
);
CREATE TABLE reporting_private.change (
    day date NOT NULL,
    member_id integer REFERENCES public.member ON DELETE CASCADE,
    committee_id integer REFERENCES public.committee ON DELETE CASCADE,
    movement text NOT NULL
);
CREATE TABLE reporting_private.run (singleton boolean PRIMARY KEY CHECK (singleton), day date NOT NULL);
CREATE FUNCTION reporting_private.semester(d date) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT CASE WHEN extract(month FROM d) >= 8 THEN extract(year FROM d)::int || '-1'
                ELSE (extract(year FROM d)::int - 1) || '-2' END
$$;
CREATE VIEW reporting.dim_date AS
SELECT day, hijri, extract(year FROM day)::int AS gregorian_year, reporting_private.semester(day) AS semester
FROM reporting_private.calendar;
CREATE VIEW reporting.dim_committee AS
SELECT committee_id, committee_code, committee_name, parent_committee_id FROM public.committee;
CREATE VIEW reporting.dim_event AS
SELECT e.event_id, e.committee_id, l.name, l.event_type, l.location, e.capacity,
       (starts_at AT TIME ZONE 'Asia/Riyadh')::date AS start_day,
       (ends_at AT TIME ZONE 'Asia/Riyadh')::date AS end_day, status::text AS status
FROM public.events e LEFT JOIN reporting_private.event_labels l ON l.event_id=e.event_id
    AND (l.name,l.event_type,l.location) IS NOT DISTINCT FROM (e.name,e.event_type,e.location)
WHERE status IN ('published','completed','cancelled');
CREATE VIEW reporting.dim_application_status AS
SELECT unnest(enum_range(NULL::public."MembershipRequestStatus"))::text AS status;
CREATE VIEW reporting.dim_member_pseudo AS
WITH members AS (
    SELECT k.pseudo_id, reporting_private.semester(m.join_date) AS join_semester,
           CASE WHEN EXISTS (SELECT FROM public.member_role r WHERE r.member_id=m.member_id
                AND (r.starts_on IS NULL OR r.starts_on <= (now() AT TIME ZONE 'Asia/Riyadh')::date)
                AND (r.ends_on IS NULL OR r.ends_on >= (now() AT TIME ZONE 'Asia/Riyadh')::date))
                THEN 'Assigned global role' ELSE 'Member' END AS role_group
    FROM reporting_private.member_key k JOIN public.member m USING (member_id)
), sized AS (SELECT *, count(*) OVER (PARTITION BY join_semester, role_group) AS n FROM members)
SELECT pseudo_id, join_semester, role_group FROM sized WHERE n >= 5;
CREATE VIEW reporting.fact_applications AS
SELECT (created_at AT TIME ZONE 'Asia/Riyadh')::date AS day, status::text, count(*) AS applications
FROM public.membership_request GROUP BY 1,2 HAVING count(DISTINCT person_id)>=5;
CREATE VIEW reporting.fact_decisions AS
SELECT (coalesce(d.decided_at,r.created_at) AT TIME ZONE 'Asia/Riyadh')::date AS day,
       d.committee_id, d.status::text AS decision, count(*) AS decisions
FROM (
    SELECT membership_request_id, committee_id, status, decided_at FROM public.membership_request_committee
    UNION ALL SELECT membership_request_id, NULL, status, decided_at FROM public.membership_request_global_role
) d JOIN public.membership_request r USING (membership_request_id)
GROUP BY 1,2,3 HAVING count(DISTINCT person_id)>=5;
CREATE VIEW reporting.fact_registrations AS
SELECT r.event_id, r.status::text, approved_at IS NOT NULL AS offered, confirmed_at IS NOT NULL AS confirmed,
       checked_in_at IS NOT NULL AS attended, count(*) AS registrations
FROM public.event_registrations r JOIN reporting.dim_event e USING (event_id)
GROUP BY 1,2,3,4,5 HAVING count(DISTINCT person_id)>=5;
CREATE VIEW reporting.fact_attendance AS
SELECT event_id, status, offered, confirmed, registrations AS check_ins
FROM reporting.fact_registrations WHERE attended;
CREATE VIEW reporting.fact_points AS
WITH awards AS (
    SELECT committee_id, member_id, created_at, points_delta FROM public.committee_point_entry
    UNION ALL SELECT NULL, member_id, created_at, points_delta FROM public.global_point_entry
)
SELECT committee_id, (created_at AT TIME ZONE 'Asia/Riyadh')::date AS day, points_delta,
       count(*) AS awards FROM awards GROUP BY 1,2,3 HAVING count(DISTINCT member_id)>=5;
CREATE VIEW reporting.fact_membership_changes AS
SELECT day, committee_id, movement, count(*) AS members FROM reporting_private.change
GROUP BY 1,2,3 HAVING count(DISTINCT member_id)>=5;
CREATE VIEW reporting.fact_retention AS
WITH semesters AS (SELECT DISTINCT reporting_private.semester(day) AS semester FROM reporting_private.run
                   UNION SELECT DISTINCT semester FROM reporting_private.roster),
pairs AS (SELECT semester, CASE right(semester,1) WHEN '1' THEN left(semester,4)||'-2'
          ELSE (left(semester,4)::int+1)||'-1' END AS next_semester FROM semesters)
SELECT p.semester, p.next_semester, n.member_id IS NOT NULL AS retained, count(*) AS members
FROM pairs p JOIN semesters s ON s.semester=p.next_semester
JOIN reporting_private.roster r ON r.semester=p.semester
LEFT JOIN reporting_private.roster n ON n.semester=p.next_semester AND n.member_id=r.member_id
GROUP BY 1,2,3 HAVING count(*)>=5;
CREATE VIEW reporting.fact_email_delivery AS
SELECT (d.created_at AT TIME ZONE 'Asia/Riyadh')::date AS day, d.kind::text, d.state::text,
       count(*) AS deliveries FROM public.registration_email_delivery d
JOIN public.event_registrations r USING (registration_id)
GROUP BY 1,2,3 HAVING count(DISTINCT r.person_id)>=5;
CREATE FUNCTION reporting_private.refresh_roster(d date) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT FROM reporting_private.run WHERE day >= d) THEN RETURN; END IF;
    IF EXISTS (SELECT FROM reporting_private.run) THEN
        INSERT INTO reporting_private.change
        WITH added AS (SELECT member_id, committee_id FROM public.member_committee EXCEPT TABLE reporting_private.assignment),
        removed AS (TABLE reporting_private.assignment EXCEPT SELECT member_id, committee_id FROM public.member_committee)
        SELECT d, a.member_id, a.committee_id, CASE WHEN EXISTS (SELECT FROM removed r WHERE r.member_id=a.member_id)
            THEN 'switch in' ELSE 'joined' END FROM added a
        UNION ALL SELECT d, r.member_id, r.committee_id, CASE WHEN EXISTS (SELECT FROM added a WHERE a.member_id=r.member_id)
            THEN 'switch out' ELSE 'left' END FROM removed r;
    END IF;
    DELETE FROM reporting_private.assignment;
    INSERT INTO reporting_private.assignment SELECT member_id, committee_id FROM public.member_committee;
    DELETE FROM reporting_private.roster WHERE semester=reporting_private.semester(d);
    INSERT INTO reporting_private.roster SELECT reporting_private.semester(d), member_id FROM public.member WHERE is_active;
    DELETE FROM reporting_private.change WHERE day < d - interval '1 year';
    DELETE FROM reporting_private.roster WHERE left(semester,4)::int < extract(year FROM d)-2;
    INSERT INTO reporting_private.run VALUES (true,d) ON CONFLICT (singleton) DO UPDATE SET day=excluded.day;
END $$;
REVOKE ALL ON FUNCTION reporting_private.refresh_roster(date) FROM PUBLIC;
COMMIT;
