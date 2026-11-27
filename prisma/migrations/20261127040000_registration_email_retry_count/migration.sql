ALTER TABLE "registration_email_delivery"
ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0;
