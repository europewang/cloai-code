ALTER TABLE "file_assets"
ADD COLUMN "sha256_hex" VARCHAR(64) NULL;

CREATE INDEX "idx_file_assets_sha256" ON "file_assets" ("sha256_hex");
