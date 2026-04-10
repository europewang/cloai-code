CREATE TYPE "AuditResult" AS ENUM ('success', 'deny', 'fail');

CREATE TABLE "audit_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "trace_id" VARCHAR(128) NOT NULL,
  "user_id" BIGINT NULL,
  "operator_id" BIGINT NULL,
  "action" VARCHAR(128) NOT NULL,
  "resource_type" VARCHAR(64) NULL,
  "resource_id" VARCHAR(128) NULL,
  "result" "AuditResult" NOT NULL,
  "payload_json" JSONB NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_audit_logs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id"),
  CONSTRAINT "fk_audit_logs_operator" FOREIGN KEY ("operator_id") REFERENCES "users"("id")
);

CREATE INDEX "idx_audit_trace" ON "audit_logs" ("trace_id");
CREATE INDEX "idx_audit_user_time" ON "audit_logs" ("user_id", "created_at");
CREATE INDEX "idx_audit_action_time" ON "audit_logs" ("action", "created_at");
