CREATE TYPE "FileCategory" AS ENUM ('input', 'output');

CREATE TABLE "file_assets" (
  "id" VARCHAR(64) PRIMARY KEY,
  "owner_user_id" BIGINT NOT NULL,
  "storage_path" VARCHAR(1024) NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(128) NULL,
  "size_bytes" BIGINT NOT NULL,
  "category" "FileCategory" NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_file_assets_owner_user" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
);

CREATE INDEX "idx_file_assets_owner_time" ON "file_assets" ("owner_user_id", "created_at");
CREATE INDEX "idx_file_assets_category_time" ON "file_assets" ("category", "created_at");
