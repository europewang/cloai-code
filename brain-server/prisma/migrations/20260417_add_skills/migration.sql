-- Migration: Add Skill model with MongoDB integration
-- Stores skill metadata in PostgreSQL, SKILL.md content in MongoDB

-- Create skills table
CREATE TABLE "skills" (
    "id" BIGSERIAL PRIMARY KEY,
    "name" VARCHAR(128) NOT NULL UNIQUE,
    "display_name" VARCHAR(256),
    "mongo_doc_id" VARCHAR(64),
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "allowed_roles" TEXT[] NOT NULL DEFAULT ARRAY['user'::TEXT],
    "script_path" VARCHAR(512),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_skills_name" ON "skills"("name");
CREATE INDEX "idx_skills_status" ON "skills"("status");

-- Create skill_shortcuts table for predefined skill invocations
CREATE TABLE "skill_shortcuts" (
    "id" BIGSERIAL PRIMARY KEY,
    "skill_id" BIGINT NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
    "name" VARCHAR(128) NOT NULL,
    "display_name" VARCHAR(256),
    "fixed_params" JSONB,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_skill_shortcuts_skill_id" ON "skill_shortcuts"("skill_id");
CREATE INDEX "idx_skill_shortcuts_name" ON "skill_shortcuts"("name");
