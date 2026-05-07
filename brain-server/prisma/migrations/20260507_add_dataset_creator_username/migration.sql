-- Add creator_username to track who created the dataset (for display in UI).
ALTER TABLE "dataset_ownerships" ADD COLUMN "creator_username" VARCHAR(128);

-- Backfill from existing RagFlow's created_at (via RagFlow dataset list) for existing records.
-- The creator_username will be populated when the dataset list endpoint is queried and joined.
-- New records will have it set on INSERT by the backend.
