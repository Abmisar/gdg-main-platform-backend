ALTER TABLE "auth_user" ADD COLUMN "last_sign_in_at" TIMESTAMPTZ(3);
UPDATE "auth_user" AS u SET "last_sign_in_at" = s.last_sign_in
FROM (SELECT "userId", MAX("createdAt") AS last_sign_in FROM "auth_session" GROUP BY "userId") AS s
WHERE u.id = s."userId";
ALTER TABLE "registration_email_delivery" ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE "event_retention_aggregate" (
  "event_id" INTEGER NOT NULL,
  "registered_count" INTEGER NOT NULL,
  "attended_count" INTEGER NOT NULL,
  "computed_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "event_retention_aggregate_pkey" PRIMARY KEY ("event_id"),
  CONSTRAINT "event_retention_aggregate_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE
);
