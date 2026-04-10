ALTER TABLE "file_assets"
ADD COLUMN "status" VARCHAR(32) NOT NULL DEFAULT 'active',
ADD COLUMN "status_reason" VARCHAR(255) NULL,
ADD COLUMN "status_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "file_assets"
SET "status" = 'active'
WHERE "status" IS NULL;

CREATE INDEX "idx_file_assets_status_time" ON "file_assets" ("status", "created_at");
