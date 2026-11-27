BEGIN;
LOCK TABLE manual_rights_request, person, member_role, membership_request, non_member_registration, email_verification_challenge, pending_signup, signup_verification, person_email_identity, committee_task, committee_point_entry, global_point_entry, event_registrations, registration_answers, registration_blacklist_entries, auth_user, auth_session, auth_account, auth_verification, better_auth_rate_limit IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN IF NOT EXISTS (SELECT FROM field_backfill_verification WHERE verified) THEN RAISE EXCEPTION 'Backfill verification required'; END IF; END $$;
DROP TRIGGER field_data_changed ON person;
DROP TRIGGER field_data_changed ON member_role;
DROP TRIGGER field_data_changed ON membership_request;
DROP TRIGGER field_data_changed ON non_member_registration;
DROP TRIGGER field_data_changed ON email_verification_challenge;
DROP TRIGGER field_data_changed ON pending_signup;
DROP TRIGGER field_data_changed ON signup_verification;
DROP TRIGGER field_data_changed ON person_email_identity;
DROP TRIGGER field_data_changed ON committee_task;
DROP TRIGGER field_data_changed ON committee_point_entry;
DROP TRIGGER field_data_changed ON global_point_entry;
DROP TRIGGER field_data_changed ON event_registrations;
DROP TRIGGER field_data_changed ON registration_answers;
DROP TRIGGER field_data_changed ON registration_blacklist_entries;
DROP TRIGGER field_data_changed ON auth_user;
DROP TRIGGER field_data_changed ON auth_session;
DROP TRIGGER field_data_changed ON auth_account;
DROP TRIGGER field_data_changed ON auth_verification;
DROP TRIGGER field_data_changed ON better_auth_rate_limit;
DROP TRIGGER field_data_changed ON manual_rights_request;
ALTER TABLE manual_rights_request DROP COLUMN contact_email, DROP COLUMN details, DROP COLUMN resolution;
DROP FUNCTION invalidate_field_verification();
DROP TABLE field_backfill_verification;
DO $$ BEGIN IF EXISTS (SELECT FROM "person" WHERE ("full_name" IS NULL) <> ("full_name_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: person.full_name'; END IF; END $$;
ALTER TABLE "person" ALTER COLUMN "full_name_encrypted" SET NOT NULL;
ALTER TABLE "person" DROP COLUMN "full_name";
DO $$ BEGIN IF EXISTS (SELECT FROM "person" WHERE ("email_personal" IS NULL) <> ("email_personal_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: person.email_personal'; END IF; END $$;
ALTER TABLE "person" DROP COLUMN "email_personal";
DO $$ BEGIN IF EXISTS (SELECT FROM "person" WHERE ("email_university" IS NULL) <> ("email_university_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: person.email_university'; END IF; END $$;
ALTER TABLE "person" DROP COLUMN "email_university";
DO $$ BEGIN IF EXISTS (SELECT FROM "person" WHERE ("phone_number" IS NULL) <> ("phone_number_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: person.phone_number'; END IF; END $$;
ALTER TABLE "person" DROP COLUMN "phone_number";
DO $$ BEGIN IF EXISTS (SELECT FROM "person" WHERE ("university" IS NULL) <> ("university_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: person.university'; END IF; END $$;
ALTER TABLE "person" DROP COLUMN "university";
DO $$ BEGIN IF EXISTS (SELECT FROM "person" WHERE ("branch" IS NULL) <> ("branch_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: person.branch'; END IF; END $$;
ALTER TABLE "person" DROP COLUMN "branch";
DO $$ BEGIN IF EXISTS (SELECT FROM "person" WHERE ("major" IS NULL) <> ("major_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: person.major'; END IF; END $$;
ALTER TABLE "person" DROP COLUMN "major";
DO $$ BEGIN IF EXISTS (SELECT FROM "person" WHERE ("gender" IS NULL) <> ("gender_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: person.gender'; END IF; END $$;
ALTER TABLE "person" DROP COLUMN "gender";
DO $$ BEGIN IF EXISTS (SELECT FROM "person" WHERE ("profile_image_url" IS NULL) <> ("profile_image_url_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: person.profile_image_url'; END IF; END $$;
ALTER TABLE "person" DROP COLUMN "profile_image_url";
DO $$ BEGIN IF EXISTS (SELECT FROM "person" WHERE ("bio" IS NULL) <> ("bio_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: person.bio'; END IF; END $$;
ALTER TABLE "person" DROP COLUMN "bio";
DO $$ BEGIN IF EXISTS (SELECT FROM "person" WHERE ("github_url" IS NULL) <> ("github_url_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: person.github_url'; END IF; END $$;
ALTER TABLE "person" DROP COLUMN "github_url";
DO $$ BEGIN IF EXISTS (SELECT FROM "person" WHERE ("portfolio_url" IS NULL) <> ("portfolio_url_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: person.portfolio_url'; END IF; END $$;
ALTER TABLE "person" DROP COLUMN "portfolio_url";
DO $$ BEGIN IF EXISTS (SELECT FROM "person" WHERE ("x_url" IS NULL) <> ("x_url_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: person.x_url'; END IF; END $$;
ALTER TABLE "person" DROP COLUMN "x_url";
DO $$ BEGIN IF EXISTS (SELECT FROM "member_role" WHERE ("notes" IS NULL) <> ("notes_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: member_role.notes'; END IF; END $$;
ALTER TABLE "member_role" DROP COLUMN "notes";
DO $$ BEGIN IF EXISTS (SELECT FROM "membership_request" WHERE ("application_data" IS NULL) <> ("application_data_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: membership_request.application_data'; END IF; END $$;
ALTER TABLE "membership_request" ALTER COLUMN "application_data_encrypted" SET NOT NULL;
ALTER TABLE "membership_request" DROP COLUMN "application_data";
DO $$ BEGIN IF EXISTS (SELECT FROM "non_member_registration" WHERE ("application_data" IS NULL) <> ("application_data_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: non_member_registration.application_data'; END IF; END $$;
ALTER TABLE "non_member_registration" ALTER COLUMN "application_data_encrypted" SET NOT NULL;
ALTER TABLE "non_member_registration" DROP COLUMN "application_data";
DO $$ BEGIN IF EXISTS (SELECT FROM "email_verification_challenge" WHERE ("email" IS NULL) <> ("email_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: email_verification_challenge.email'; END IF; END $$;
ALTER TABLE "email_verification_challenge" ALTER COLUMN "email_encrypted" SET NOT NULL;
ALTER TABLE "email_verification_challenge" DROP COLUMN "email";
DO $$ BEGIN IF EXISTS (SELECT FROM "pending_signup" WHERE ("application_data" IS NULL) <> ("application_data_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: pending_signup.application_data'; END IF; END $$;
ALTER TABLE "pending_signup" ALTER COLUMN "application_data_encrypted" SET NOT NULL;
ALTER TABLE "pending_signup" DROP COLUMN "application_data";
DO $$ BEGIN IF EXISTS (SELECT FROM "signup_verification" WHERE ("full_name" IS NULL) <> ("full_name_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: signup_verification.full_name'; END IF; END $$;
ALTER TABLE "signup_verification" ALTER COLUMN "full_name_encrypted" SET NOT NULL;
ALTER TABLE "signup_verification" DROP COLUMN "full_name";
DO $$ BEGIN IF EXISTS (SELECT FROM "signup_verification" WHERE ("email_personal" IS NULL) <> ("email_personal_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: signup_verification.email_personal'; END IF; END $$;
ALTER TABLE "signup_verification" ALTER COLUMN "email_personal_encrypted" SET NOT NULL;
ALTER TABLE "signup_verification" DROP COLUMN "email_personal";
DO $$ BEGIN IF EXISTS (SELECT FROM "signup_verification" WHERE ("email_university" IS NULL) <> ("email_university_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: signup_verification.email_university'; END IF; END $$;
ALTER TABLE "signup_verification" DROP COLUMN "email_university";
DO $$ BEGIN IF EXISTS (SELECT FROM "signup_verification" WHERE ("application_data" IS NULL) <> ("application_data_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: signup_verification.application_data'; END IF; END $$;
ALTER TABLE "signup_verification" ALTER COLUMN "application_data_encrypted" SET NOT NULL;
ALTER TABLE "signup_verification" DROP COLUMN "application_data";
DO $$ BEGIN IF EXISTS (SELECT FROM "person_email_identity" WHERE ("email" IS NULL) <> ("email_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: person_email_identity.email'; END IF; END $$;
ALTER TABLE "person_email_identity" ALTER COLUMN "email_encrypted" SET NOT NULL;
ALTER TABLE "person_email_identity" DROP COLUMN "email";
DO $$ BEGIN IF EXISTS (SELECT FROM "committee_task" WHERE ("title" IS NULL) <> ("title_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: committee_task.title'; END IF; END $$;
ALTER TABLE "committee_task" ALTER COLUMN "title_encrypted" SET NOT NULL;
ALTER TABLE "committee_task" DROP COLUMN "title";
DO $$ BEGIN IF EXISTS (SELECT FROM "committee_task" WHERE ("description" IS NULL) <> ("description_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: committee_task.description'; END IF; END $$;
ALTER TABLE "committee_task" ALTER COLUMN "description_encrypted" SET NOT NULL;
ALTER TABLE "committee_task" DROP COLUMN "description";
DO $$ BEGIN IF EXISTS (SELECT FROM "committee_point_entry" WHERE ("reason" IS NULL) <> ("reason_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: committee_point_entry.reason'; END IF; END $$;
ALTER TABLE "committee_point_entry" ALTER COLUMN "reason_encrypted" SET NOT NULL;
ALTER TABLE "committee_point_entry" DROP COLUMN "reason";
DO $$ BEGIN IF EXISTS (SELECT FROM "global_point_entry" WHERE ("reason" IS NULL) <> ("reason_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: global_point_entry.reason'; END IF; END $$;
ALTER TABLE "global_point_entry" ALTER COLUMN "reason_encrypted" SET NOT NULL;
ALTER TABLE "global_point_entry" DROP COLUMN "reason";
DO $$ BEGIN IF EXISTS (SELECT FROM "event_registrations" WHERE ("excuse_reason" IS NULL) <> ("excuse_reason_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: event_registrations.excuse_reason'; END IF; END $$;
ALTER TABLE "event_registrations" DROP COLUMN "excuse_reason";
DO $$ BEGIN IF EXISTS (SELECT FROM "registration_answers" WHERE ("answer_text" IS NULL) <> ("answer_text_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: registration_answers.answer_text'; END IF; END $$;
ALTER TABLE "registration_answers" ALTER COLUMN "answer_text_encrypted" SET NOT NULL;
ALTER TABLE "registration_answers" DROP COLUMN "answer_text";
DO $$ BEGIN IF EXISTS (SELECT FROM "registration_blacklist_entries" WHERE ("resolution_reason" IS NULL) <> ("resolution_reason_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: registration_blacklist_entries.resolution_reason'; END IF; END $$;
ALTER TABLE "registration_blacklist_entries" DROP COLUMN "resolution_reason";
DO $$ BEGIN IF EXISTS (SELECT FROM "auth_user" WHERE ("name" IS NULL) <> ("name_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: auth_user.name'; END IF; END $$;
ALTER TABLE "auth_user" ALTER COLUMN "name_encrypted" SET NOT NULL;
ALTER TABLE "auth_user" DROP COLUMN "name";
DO $$ BEGIN IF EXISTS (SELECT FROM "auth_user" WHERE ("email" IS NULL) <> ("email_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: auth_user.email'; END IF; END $$;
ALTER TABLE "auth_user" ALTER COLUMN "email_encrypted" SET NOT NULL;
ALTER TABLE "auth_user" DROP COLUMN "email";
DO $$ BEGIN IF EXISTS (SELECT FROM "auth_user" WHERE ("image" IS NULL) <> ("image_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: auth_user.image'; END IF; END $$;
ALTER TABLE "auth_user" DROP COLUMN "image";
DO $$ BEGIN IF EXISTS (SELECT FROM "auth_session" WHERE ("ipAddress" IS NULL) <> ("ipAddress_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: auth_session.ipAddress'; END IF; END $$;
ALTER TABLE "auth_session" DROP COLUMN "ipAddress";
DO $$ BEGIN IF EXISTS (SELECT FROM "auth_session" WHERE ("userAgent" IS NULL) <> ("userAgent_encrypted" IS NULL)) THEN RAISE EXCEPTION 'Incomplete backfill: auth_session.userAgent'; END IF; END $$;
ALTER TABLE "auth_session" DROP COLUMN "userAgent";
ALTER TABLE "event_registrations" ADD CONSTRAINT "registrations_excuse_check" CHECK (
        (CASE
            WHEN "status" = 'EXCUSED' THEN
                "excused_at" IS NOT NULL
                AND "excuse_reason_encrypted" IS NOT NULL AND btrim("excuse_reason_encrypted") <> ''
            ELSE "excused_at" IS NULL AND "excused_by_member_id" IS NULL AND "excuse_reason_encrypted" IS NULL
        END) IS TRUE
    );
ALTER TABLE "registration_blacklist_entries" ADD CONSTRAINT "blacklist_resolution_check" CHECK (
        (
            ("resolved_at" IS NULL AND "resolved_by_member_id" IS NULL AND "resolution_reason_encrypted" IS NULL)
            OR (
                "resolved_at" IS NOT NULL
                AND "resolution_reason_encrypted" IS NOT NULL AND btrim("resolution_reason_encrypted") <> ''
                AND "resolved_at" >= "created_at"
            )
        ) IS TRUE
    );
ALTER TABLE "auth_account" DROP COLUMN "accessToken";
ALTER TABLE "auth_account" DROP COLUMN "refreshToken";
ALTER TABLE "auth_account" DROP COLUMN "idToken";
ALTER TABLE "auth_verification" ALTER COLUMN "identifier_encrypted" SET NOT NULL;
ALTER TABLE "auth_verification" DROP COLUMN "identifier";
ALTER TABLE "auth_verification" ALTER COLUMN "value_encrypted" SET NOT NULL;
ALTER TABLE "auth_verification" DROP COLUMN "value";
ALTER TABLE "better_auth_rate_limit" ALTER COLUMN "key_encrypted" SET NOT NULL;
ALTER TABLE "better_auth_rate_limit" DROP COLUMN "key";
DROP INDEX "person_email_personal_idx_key";
CREATE UNIQUE INDEX "person_email_personal_idx_key" ON "person" ("email_personal_idx");
DROP INDEX "signup_verification_email_personal_idx_key";
CREATE UNIQUE INDEX "signup_verification_email_personal_idx_key" ON "signup_verification" ("email_personal_idx");
DROP INDEX personal_identity_blind_unique;
CREATE UNIQUE INDEX personal_identity_blind_unique ON person_email_identity (email_idx) WHERE kind = 'PERSONAL';
DROP INDEX "auth_user_email_idx_key";
CREATE UNIQUE INDEX "auth_user_email_idx_key" ON "auth_user" ("email_idx");
DROP INDEX "better_auth_rate_limit_key_idx_key";
CREATE UNIQUE INDEX "better_auth_rate_limit_key_idx_key" ON "better_auth_rate_limit" ("key_idx");
COMMIT;
