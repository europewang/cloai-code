CREATE TABLE "memory_profiles" (
  "id" BIGSERIAL PRIMARY KEY,
  "profile_id" VARCHAR(128) NOT NULL UNIQUE,
  "user_id" BIGINT NOT NULL UNIQUE,
  "storage_root" VARCHAR(512) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_memory_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id")
);
