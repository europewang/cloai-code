// 统一治理后端 Prisma 草案（Draft）
// 用途：将规划文档中的数据模型转为可迁移的 schema 基线。

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  super_admin
  admin
  user
}

enum UserStatus {
  active
  disabled
}

enum ResourceType {
  DATASET
  DATASET_OWNER
  SKILL
  MEMORY_PROFILE
}

enum SessionStatus {
  active
  archived
  deleted
}

enum MessageRole {
  system
  user
  assistant
  tool
}

enum AuditResult {
  success
  deny
  fail
}

model User {
  id            BigInt      @id @default(autoincrement())
  username      String      @unique @db.VarChar(128)
  passwordHash  String      @map("password_hash") @db.VarChar(255)
  role          Role
  managerUserId BigInt?     @map("manager_user_id")
  status        UserStatus  @default(active)
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")

  // 自关联：admin 管理 user
  manager    User?   @relation("UserManager", fields: [managerUserId], references: [id])
  subordinates User[] @relation("UserManager")

  permissionsGiven Permission[] @relation("PermissionGrantedBy")
  permissionsOwned Permission[] @relation("PermissionOwnedBy")
  memoryProfile    MemoryProfile?
  sessions         UserSession[]
  datasetsOwned    Dataset[] @relation("DatasetOwner")
  skillsCreated    Skill[]   @relation("SkillCreatedBy")
  skillsUpdated    Skill[]   @relation("SkillUpdatedBy")
  auditSubject     AuditLog[] @relation("AuditSubject")
  auditOperator    AuditLog[] @relation("AuditOperator")

  @@index([role], map: "idx_users_role")
  @@index([managerUserId], map: "idx_users_manager")
  @@map("users")
}

model Permission {
  id           BigInt       @id @default(autoincrement())
  userId       BigInt       @map("user_id")
  resourceType ResourceType @map("resource_type")
  resourceId   String       @map("resource_id") @db.VarChar(128)
  grantedBy    BigInt       @map("granted_by")
  createdAt    DateTime     @default(now()) @map("created_at")

  user      User @relation("PermissionOwnedBy", fields: [userId], references: [id])
  granter   User @relation("PermissionGrantedBy", fields: [grantedBy], references: [id])

  @@unique([userId, resourceType, resourceId], map: "uk_perm_user_type_res")
  @@index([userId], map: "idx_perm_user")
  @@index([resourceType, resourceId], map: "idx_perm_res")
  @@map("permissions")
}

model Dataset {
  id                BigInt   @id @default(autoincrement())
  externalDatasetId String   @unique @map("external_dataset_id") @db.VarChar(128)
  name              String   @db.VarChar(255)
  ownerUserId       BigInt   @map("owner_user_id")
  status            String   @db.VarChar(32)
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  owner User @relation("DatasetOwner", fields: [ownerUserId], references: [id])

  @@index([ownerUserId], map: "idx_datasets_owner")
  @@map("datasets")
}

model Skill {
  id          BigInt   @id @default(autoincrement())
  toolCode    String   @unique @map("tool_code") @db.VarChar(128)
  toolName    String   @map("tool_name") @db.VarChar(255)
  description String?  @db.Text
  schemaJson  Json     @map("schema_json")
  status      String   @db.VarChar(32)
  createdBy   BigInt   @map("created_by")
  updatedBy   BigInt   @map("updated_by")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  creator User @relation("SkillCreatedBy", fields: [createdBy], references: [id])
  updater User @relation("SkillUpdatedBy", fields: [updatedBy], references: [id])

  @@index([status], map: "idx_skills_status")
  @@map("skills")
}

model MemoryProfile {
  id         BigInt   @id @default(autoincrement())
  profileId  String   @unique @map("profile_id") @db.VarChar(128)
  userId     BigInt   @unique @map("user_id")
  storageRoot String  @map("storage_root") @db.VarChar(512)
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id])

  @@map("memory_profiles")
}

model UserSession {
  id            BigInt        @id @default(autoincrement())
  sessionId     String        @unique @map("session_id") @db.VarChar(128)
  userId        BigInt        @map("user_id")
  profileId     String        @map("profile_id") @db.VarChar(128)
  title         String?       @db.VarChar(255)
  status        SessionStatus @default(active)
  lastMessageAt DateTime?     @map("last_message_at")
  createdAt     DateTime      @default(now()) @map("created_at")

  user     User             @relation(fields: [userId], references: [id])
  messages SessionMessage[]

  @@index([userId, lastMessageAt(sort: Desc)], map: "idx_sessions_user_last")
  @@index([profileId], map: "idx_sessions_profile")
  @@map("user_sessions")
}

model SessionMessage {
  id             BigInt      @id @default(autoincrement())
  sessionId      String      @map("session_id") @db.VarChar(128)
  userId         BigInt      @map("user_id")
  role           MessageRole
  content        String      @db.Text
  tokenUsageJson Json?       @map("token_usage_json")
  createdAt      DateTime    @default(now()) @map("created_at")

  session UserSession @relation(fields: [sessionId], references: [sessionId])

  @@index([sessionId, createdAt], map: "idx_messages_session_time")
  @@index([userId], map: "idx_messages_user")
  @@map("session_messages")
}

model AuditLog {
  id           BigInt      @id @default(autoincrement())
  traceId      String      @map("trace_id") @db.VarChar(128)
  userId       BigInt?     @map("user_id")
  operatorId   BigInt?     @map("operator_id")
  action       String      @db.VarChar(128)
  resourceType String?     @map("resource_type") @db.VarChar(64)
  resourceId   String?     @map("resource_id") @db.VarChar(128)
  result       AuditResult
  payloadJson  Json?       @map("payload_json")
  createdAt    DateTime    @default(now()) @map("created_at")

  subjectUser  User? @relation("AuditSubject", fields: [userId], references: [id])
  operatorUser User? @relation("AuditOperator", fields: [operatorId], references: [id])

  @@index([traceId], map: "idx_audit_trace")
  @@index([userId, createdAt], map: "idx_audit_user_time")
  @@index([action, createdAt], map: "idx_audit_action_time")
  @@map("audit_logs")
}

model ToolCallAudit {
  id          BigInt   @id @default(autoincrement())
  traceId     String   @map("trace_id") @db.VarChar(128)
  toolCallId  String   @map("tool_call_id") @db.VarChar(128)
  userId      BigInt?  @map("user_id")
  toolCode    String   @map("tool_code") @db.VarChar(128)
  result      AuditResult
  payloadJson Json?    @map("payload_json")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([traceId], map: "idx_tool_audit_trace")
  @@index([toolCode, createdAt], map: "idx_tool_audit_tool_time")
  @@map("tool_call_audits")
}

model RagQueryAudit {
  id              BigInt   @id @default(autoincrement())
  traceId         String   @map("trace_id") @db.VarChar(128)
  userId          BigInt?  @map("user_id")
  datasetId       String?  @map("dataset_id") @db.VarChar(128)
  queryText       String   @map("query_text") @db.Text
  topK            Int?     @map("top_k")
  hitCount        Int?     @map("hit_count")
  latencyMs       Int?     @map("latency_ms")
  payloadJson     Json?    @map("payload_json")
  createdAt       DateTime @default(now()) @map("created_at")

  @@index([traceId], map: "idx_rag_audit_trace")
  @@index([datasetId, createdAt], map: "idx_rag_audit_dataset_time")
  @@map("rag_query_audits")
}
