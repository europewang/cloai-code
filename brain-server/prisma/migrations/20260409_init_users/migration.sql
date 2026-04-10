-- Create enums
CREATE TYPE "Role" AS ENUM ('super_admin', 'admin', 'user');
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled');

-- Create users table
CREATE TABLE "users" (
  "id" BIGSERIAL PRIMARY KEY,
  "username" VARCHAR(128) NOT NULL UNIQUE,
  "password_hash" VARCHAR(255) NOT NULL,
  "role" "Role" NOT NULL,
  "manager_user_id" BIGINT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_users_manager" FOREIGN KEY ("manager_user_id") REFERENCES "users"("id"),
  CONSTRAINT "chk_users_role_manager" CHECK (
    ("role" = 'user' AND "manager_user_id" IS NOT NULL) OR
    ("role" IN ('admin', 'super_admin') AND "manager_user_id" IS NULL)
  )
);

CREATE INDEX "idx_users_role" ON "users" ("role");
CREATE INDEX "idx_users_manager" ON "users" ("manager_user_id");
