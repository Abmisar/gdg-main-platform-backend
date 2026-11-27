BEGIN;

ALTER TABLE "announcement" ALTER COLUMN "published_by_member_id" DROP NOT NULL;
ALTER TABLE "committee_task" ALTER COLUMN "created_by_member_id" DROP NOT NULL;

ALTER TABLE "signup_verification" ADD COLUMN     "consent_evidence" JSONB;

CREATE TABLE "consent_record" (
    "id" SERIAL NOT NULL,
    "person_id" INTEGER NOT NULL,
    "document" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "user_agent_hash" TEXT NOT NULL,

    CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rights_audit" (
    "id" SERIAL NOT NULL,
    "person_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rights_audit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "account_deletion" (
    "person_id" INTEGER NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "account_deletion_pkey" PRIMARY KEY ("person_id")
);

CREATE TABLE "deletion_tombstone" (
    "id" SERIAL NOT NULL,
    "completed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deletion_tombstone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "manual_rights_request" (
    "id" SERIAL NOT NULL,
    "person_id" INTEGER,
    "contact_email" TEXT,
    "kind" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "handler_id" INTEGER,
    "resolution" TEXT,

    CONSTRAINT "manual_rights_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consent_record_person_id_idx" ON "consent_record"("person_id");

CREATE INDEX "rights_audit_person_id_idx" ON "rights_audit"("person_id");

CREATE INDEX "account_deletion_due_at_idx" ON "account_deletion"("due_at");

CREATE INDEX "manual_rights_request_status_due_at_idx" ON "manual_rights_request"("status", "due_at");

CREATE INDEX "manual_rights_request_person_id_idx" ON "manual_rights_request"("person_id");

ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rights_audit" ADD CONSTRAINT "rights_audit_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_deletion" ADD CONSTRAINT "account_deletion_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "manual_rights_request" ADD CONSTRAINT "manual_rights_request_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "manual_rights_request" ADD CONSTRAINT "manual_rights_request_handler_id_fkey" FOREIGN KEY ("handler_id") REFERENCES "person"("person_id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
