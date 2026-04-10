CREATE TABLE "tool_call_audits" (
  "id" BIGSERIAL PRIMARY KEY,
  "trace_id" VARCHAR(128) NOT NULL,
  "tool_call_id" VARCHAR(128) NULL,
  "user_id" BIGINT NULL,
  "operator_id" BIGINT NULL,
  "tool_name" VARCHAR(128) NOT NULL,
  "result" "AuditResult" NOT NULL,
  "latency_ms" INTEGER NULL,
  "error_message" VARCHAR(1024) NULL,
  "input_json" JSONB NULL,
  "output_json" JSONB NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_tool_call_audits_user" FOREIGN KEY ("user_id") REFERENCES "users"("id"),
  CONSTRAINT "fk_tool_call_audits_operator" FOREIGN KEY ("operator_id") REFERENCES "users"("id")
);

CREATE INDEX "idx_tool_call_audit_trace" ON "tool_call_audits" ("trace_id");
CREATE INDEX "idx_tool_call_audit_tool_time" ON "tool_call_audits" ("tool_name", "created_at");
CREATE INDEX "idx_tool_call_audit_user_time" ON "tool_call_audits" ("user_id", "created_at");

CREATE TABLE "rag_query_audits" (
  "id" BIGSERIAL PRIMARY KEY,
  "trace_id" VARCHAR(128) NOT NULL,
  "user_id" BIGINT NULL,
  "operator_id" BIGINT NULL,
  "dataset_id" VARCHAR(128) NULL,
  "chat_id" VARCHAR(128) NULL,
  "query_text" TEXT NOT NULL,
  "upstream_status" INTEGER NULL,
  "result" "AuditResult" NOT NULL,
  "latency_ms" INTEGER NULL,
  "error_message" VARCHAR(1024) NULL,
  "request_json" JSONB NULL,
  "response_json" JSONB NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_rag_query_audits_user" FOREIGN KEY ("user_id") REFERENCES "users"("id"),
  CONSTRAINT "fk_rag_query_audits_operator" FOREIGN KEY ("operator_id") REFERENCES "users"("id")
);

CREATE INDEX "idx_rag_query_audit_trace" ON "rag_query_audits" ("trace_id");
CREATE INDEX "idx_rag_query_audit_dataset_time" ON "rag_query_audits" ("dataset_id", "created_at");
CREATE INDEX "idx_rag_query_audit_user_time" ON "rag_query_audits" ("user_id", "created_at");
