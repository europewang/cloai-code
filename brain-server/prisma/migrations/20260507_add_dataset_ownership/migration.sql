-- Track which user owns which RagFlow dataset (tenant isolation).
-- RagFlow itself doesn't expose creator info in list responses, so we maintain it locally.
CREATE TABLE "dataset_ownerships" (
  "id" BIGSERIAL PRIMARY KEY,
  "dataset_id" VARCHAR(128) NOT NULL UNIQUE,
  "owner_user_id" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_do_owner" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "idx_do_owner" ON "dataset_ownerships" ("owner_user_id");
CREATE INDEX "idx_do_dataset" ON "dataset_ownerships" ("dataset_id");

-- Populate from existing permissions where resource_type = 'DATASET_OWNER'
INSERT INTO "dataset_ownerships" ("dataset_id", "owner_user_id")
  SELECT p."resource_id", p."user_id"
  FROM "permissions" p
  WHERE p."resource_type" = 'DATASET_OWNER'
  ON CONFLICT ("dataset_id") DO NOTHING;
