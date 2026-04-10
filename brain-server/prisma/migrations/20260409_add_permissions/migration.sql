-- Create resource type enum
CREATE TYPE "ResourceType" AS ENUM ('DATASET', 'DATASET_OWNER', 'SKILL', 'MEMORY_PROFILE');

-- Create permissions table
CREATE TABLE "permissions" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" BIGINT NOT NULL,
  "resource_type" "ResourceType" NOT NULL,
  "resource_id" VARCHAR(128) NOT NULL,
  "granted_by" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_permissions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id"),
  CONSTRAINT "fk_permissions_granted_by" FOREIGN KEY ("granted_by") REFERENCES "users"("id")
);

CREATE UNIQUE INDEX "uk_perm_user_type_res" ON "permissions" ("user_id", "resource_type", "resource_id");
CREATE INDEX "idx_perm_user" ON "permissions" ("user_id");
CREATE INDEX "idx_perm_res" ON "permissions" ("resource_type", "resource_id");
