BEGIN;

ALTER TABLE "event_registrations"
    DROP CONSTRAINT "registrations_excuse_check",
    ADD CONSTRAINT "registrations_excuse_check" CHECK (
        (CASE
            WHEN "status" = 'EXCUSED' THEN
                "excused_at" IS NOT NULL
                AND "excuse_reason" IS NOT NULL AND btrim("excuse_reason") <> ''
            ELSE "excused_at" IS NULL AND "excused_by_member_id" IS NULL AND "excuse_reason" IS NULL
        END) IS TRUE
    );

ALTER TABLE "event_registrations"
    DROP CONSTRAINT "registrations_check_in_check",
    ADD CONSTRAINT "registrations_check_in_check" CHECK (
        (
            ("checked_in_at" IS NULL AND "checked_in_by_member_id" IS NULL)
            OR (
                "status" = 'CONFIRMED'
                AND "confirmed_at" IS NOT NULL
                AND "checked_in_at" IS NOT NULL
                AND "checked_in_at" >= "confirmed_at"
            )
        ) IS TRUE
    );

ALTER TABLE "registration_blacklist_entries"
    DROP CONSTRAINT "blacklist_resolution_check",
    ADD CONSTRAINT "blacklist_resolution_check" CHECK (
        (
            ("resolved_at" IS NULL AND "resolved_by_member_id" IS NULL AND "resolution_reason" IS NULL)
            OR (
                "resolved_at" IS NOT NULL
                AND "resolution_reason" IS NOT NULL AND btrim("resolution_reason") <> ''
                AND "resolved_at" >= "created_at"
            )
        ) IS TRUE
    );

ALTER TABLE "membership_request_committee" DROP CONSTRAINT "membership_request_committee_decision_check",
    ADD CONSTRAINT "membership_request_committee_decision_check" CHECK (
      ("status" = 'PENDING' AND "decided_by_member_id" IS NULL AND "decided_at" IS NULL)
      OR ("status" IN ('APPROVED', 'REJECTED') AND "decided_at" IS NOT NULL)
    );

ALTER TABLE "membership_request_global_role" DROP CONSTRAINT "membership_request_global_role_decision_check",
    ADD CONSTRAINT "membership_request_global_role_decision_check" CHECK (
      ("status" = 'PENDING' AND "decided_by_member_id" IS NULL AND "decided_at" IS NULL)
      OR ("status" IN ('APPROVED', 'REJECTED') AND "decided_at" IS NOT NULL)
    );

CREATE TABLE wallet_guest_withdrawal (
    registration_id INTEGER PRIMARY KEY,
    committee_code TEXT NOT NULL,
    revision INTEGER NOT NULL
);

CREATE FUNCTION stage_deleted_guest_pass() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO wallet_guest_withdrawal (registration_id, committee_code, revision)
    SELECT OLD.registration_id, c.committee_code, p.revision + 1
      FROM wallet_guest_projection p
      JOIN events e ON e.event_id = OLD.event_id
      JOIN committee c ON c.committee_id = e.committee_id
     WHERE p.registration_id = OLD.registration_id AND (p.active OR p.pending);
    RETURN OLD;
END;
$$;

CREATE TRIGGER withdraw_guest_pass_before_erasure BEFORE DELETE ON event_registrations
FOR EACH ROW EXECUTE FUNCTION stage_deleted_guest_pass();

COMMIT;
