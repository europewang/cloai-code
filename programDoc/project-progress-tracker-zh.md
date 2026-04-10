# cloai-code 统一治理项目进度总览

> 更新时间：2026-04-09（持续更新）  
> 作用：集中跟踪“已完成 / 进行中 / 待完成 / 风险项”，用于每次迭代快速对齐。

## 1. 总体进度概览

1. 规划阶段：已完成
   - 统一治理目标、边界、数据模型、接口、阶段计划、验收标准已固化。
2. 实施准备：已完成
   - OpenAPI 草案、Prisma 草案、Docker 编排、启动规范已落地。
3. Phase 1（治理骨架）：进行中
   - `brain-server` 可运行，健康检查、鉴权主链、用户管理主链已初步可用。
4. Phase 2（权限主干）：进行中
   - `permissions` 数据表与核心授权接口已可用，`audit_logs` 第一版已接入。

## 2. 已完成内容（Done）

### 2.1 文档与规划

1. 完成主规划文档重构为纯 TS 单项目路线。
2. 完成数据模型细化（4.2-4.7）和用途注释增强。
3. 完成任务拆分、差距清单、触发式风险机制。

### 2.2 工程与基础设施

1. 新建 `brain-server` 子工程（Fastify + TypeScript）。
2. 打通 Docker 启动链路：
   - `deploy/docker-compose-brain-ts.yml`
   - `brain-server/Dockerfile`
   - `.env.brain(.example)`
3. 落地启动提速策略：
   - Docker 层缓存、BuildKit 包缓存、Postgres/Redis 持久卷缓存。

### 2.3 数据层与认证

1. 接入 Prisma，完成首批迁移：
   - `users` 表
   - `permissions` 表
   - `memory_profiles` 表
   - `file_assets` 表
   - `file_assets.sha256_hex` 字段
2. 完成 `seedAdmin` 启动种子流程。
3. 登录改为数据库用户校验（`bcrypt` 哈希比对）。
4. `profileId` 已切换为 `memory_profiles` 真实映射（`auth/me` 与 `brain/context` 已联动）。

### 2.4 已可用接口

1. 健康与就绪：
   - `GET /api/health`
   - `GET /api/ready`（真实 DB/Redis 探测）
2. 鉴权：
   - `POST /api/v1/auth/login`
   - `POST /api/v1/auth/refresh`
   - `GET /api/v1/auth/me`
3. 用户管理：
   - `POST /api/v1/admin/users`
   - `PATCH /api/v1/admin/users/{id}`
4. 权限与上下文：
   - `GET /api/v1/brain/context`
   - `POST /api/v1/admin/permissions/datasets`
   - `POST /api/v1/admin/permissions/dataset-owners`
   - `POST /api/v1/admin/permissions/skills`
   - `POST /api/v1/admin/permissions/memory-profiles`
   - `GET /api/v1/admin/users/{id}/permissions`
5. 审计：
   - `GET /api/v1/admin/audits`
   - `admin/users`、`permissions` 写操作自动落 `audit_logs`
6. 外部集成：
   - `GET /api/v1/integrations/ragflow/health`（RagFlow 联通探测）
   - `POST /api/v1/rag/query`（RagFlow 检索代理，带权限与审计）
7. 文件与技能网关：
   - `POST /api/v1/files/upload`
   - `GET /api/v1/files/{fileId}/download`
   - `POST /api/v1/skills/indicator-verification/run`
   - 文件元数据已落库（`file_assets`），不再依赖内存 Map
   - 文件存储后端已支持 S3/MinIO（当前验证通过 MinIO）
   - 上传返回包含 `sha256Hex`，支持后续文件一致性校验

### 2.5 文档治理机制

1. 已将以下文档纳入每次任务固定同步范围：
   - `programDoc/project-progress-tracker-zh.md`
   - `programDoc/project-summary-zh.md`
   - `programDoc/ts-unified-governance-migration-plan-zh.md`
2. 已将固定同步规则写入 `rules-enforcer` Skill，确保新会话可快速加载项目上下文。

### 2.6 技能封装进展

1. 已将 `skills/cad_text_extractor` 补充为可调用技能包：
   - `skills/cad_text_extractor/SKILL.md`
   - `skills/cad_text_extractor/run_skill.py`
2. 支持命令行批量调用，便于后续接入工具路由与权限治理。
3. 已完成指标校核技能实测：
   - 输入目录：`skills/cad_text_extractor/input`
   - 输出目录：`skills/cad_text_extractor/output_test`
   - 成功产出 JSON/DXF/XLSX 文件。
4. 已新增 `rag-query` 运行时技能包：
   - `skills/rag_query/SKILL.md`
   - `skills/rag_query/run_skill.py`
   - `skills/rag_query/requirements.txt`
5. `rag-query` 实测可返回“什么是半面积”知识库答案（结构化 JSON）。

## 3. 进行中内容（In Progress）

1. 权限主干持续完善：
   - 当前已支持按 `DATASET/DATASET_OWNER/SKILL/MEMORY_PROFILE` 授权。
   - `brain/context` 已返回 `allowedDatasets/allowedDatasetOwners/allowedSkills/allowedMemoryProfiles`。
2. 契约与实现对齐：
   - 已修正权限接口入参为 `datasetIds/skillIds`，继续监控接口漂移。
3. 数据模型补齐：
   - `tool_call_audits`、`rag_query_audits` 已落地，下一步转入管理端查询接口补齐。
4. RagFlow 深度接入：
   - 已完成检索代理接口与审计接入，且支持动态 chat 发现（无固定 chatId 也可调用）。
5. 会话调用验证：
   - “请使用rag技能，查找什么是半面积”：已返回真实知识库答案（200）。
   - “请使用指标校核技能”：本地技能链路可执行并生成结果文件。
6. 文件网关验证：
   - `upload -> indicator-verification -> download` 全链路已通过。
7. 部署编排约束：
   - 已执行“先停全部容器，再仅启动 brain + ragflow”，无关容器保持停止。
8. 对象清理：
   - 新增 `ops:cleanup-s3-orphans`，可清理 MinIO/S3 中无 DB 引用对象。
9. 维护任务：
   - 新增 `ops:backfill-file-sha256`（历史哈希回填）
   - 新增 `ops:maintenance-tick`（回填 + 清理组合执行）
   - 新增 `ops:migrate-local-assets-to-s3`（local 路径存量迁移）
   - 新增可选容器 `brain-maintenance`（`profile=maintenance`）
10. 缺失文件治理：
   - `file_assets` 已新增状态字段（`status/status_reason/status_updated_at`）
   - `local->s3` 迁移遇到 ENOENT 时会自动标记为 `missing`
   - 下载与指标校核执行会拒绝 `missing` 文件（返回 410）
   - maintenance-tick 已实测通过（迁移/回填/清理均正常执行）
   - 已新增管理接口：`GET /api/v1/admin/files`、`POST /api/v1/admin/files/{fileId}/status`
   - 支持按 `status/category/ownerUserId` 查询，并支持手动标记 `missing/active`
   - 回切 `active` 前强制做存储可读校验，不可读返回 409
   - 已新增批量更新接口：`POST /api/v1/admin/files/status/batch`
   - 已新增导出接口：`GET /api/v1/admin/files/export`（CSV）
   - 已新增最小回归脚本：`ops:smoke-admin-file-status`（覆盖查询/单条/批量/导出）
   - `brain-maintenance` 已接入周期化 smoke 校验（`MAINTENANCE_ENABLE_SMOKE` 开关，可输出 `[ALERT]` 日志）
11. 权限扩展回归：
   - `DATASET_OWNER` 端到端已验证（grant -> context 命中 `allowedDatasetOwners` -> revoke -> context 移除）。
   - 兼容回归：`ops:smoke-admin-file-status` 再次执行通过（`login/list/single/batch/export` 全 200）。
12. 集成测试目录：
   - 已新增 `brain-server/test/run_governance_e2e.py`，用于 Docker 运行态统一回归（鉴权/权限/context/审计）。
   - 已在 `brain-server/package.json` 增加 `test:e2e-governance`、`test:e2e-all` 脚本入口。
13. 全量回归重跑（按“同步 dist 到容器”路径）：
   - 已执行：`bun run build -> docker cp dist -> docker restart ai4kb-brain-server`。
   - 结果：`test/run_governance_e2e.py` 与 `ops:smoke-admin-file-status` 均通过，`ai4kb-brain-server` 运行状态正常。
14. 策略版本与细分审计（高优先级推进）：
   - `brain/context` 的 `policyVersion` 已改为 Redis 版本号（非 `Date.now()`），并在 `admin.users.update` 与 `admin/permissions*` 变更后自动递增失效。
   - 已落地 `tool_call_audits`、`rag_query_audits` 两张表，并接入 `skills/indicator-verification/run` 与 `rag/query` 链路。
   - 运行态验证通过：治理回归脚本新增 `policyVersion` 变更断言；数据库计数已确认两张细分审计表均有写入。

## 4. 待完成内容（Todo）

### 4.1 高优先级

1. 接口鉴权强化：
   - 令牌轮换策略
   - refreshToken 黑名单或版本戳失效机制

### 4.2 中优先级

1. 管理侧查询能力：
   - 权限查询分页与过滤
   - 审计查询分页与过滤

### 4.3 低优先级

1. 根目录统一工作区启动脚本（减少子工程手动切换）。
2. OpenAPI 自动校验与生成流程（CI 中校验契约一致性）。
3. `IGNORED_TODO`：`[ALERT]` webhook 主动通知（企业微信/钉钉）；当前仅保留日志告警，后续有时间再启用。

## 5. 架构不符合项（持续跟踪）

1. 目前接口测试主要是脚本回归，自动化测试覆盖仍不足。
2. 细分审计表已落地，但管理端尚缺专用查询入口。
3. RagFlow 目前仅做可用性探测，尚未接入受控检索调用链路。
4. 历史 local 存量存在“文件已丢失”场景（当前 `missing=4`），需确认是否做 DB 标记或清理策略。
5. Docker 重建仍受外网 `pip install ezdxf` 影响，当前采用“本地 build + 同步 dist 到容器”作为临时验证方案。

## 6. 下一步建议（按顺序）

1. 接口鉴权强化（令牌轮换、refresh 失效机制）。
2. 为 `tool_call_audits/rag_query_audits` 增加管理端查询接口与分页过滤。
3. 已落地历史 missing 文件处置第五版（自动标记失效 + 业务侧拒绝读取 + 管理端查询/单条更新/批量更新/CSV导出 + 最小自动化回归脚本 + 维护容器周期化 smoke）。
4. 继续扩展 `test/run_governance_e2e.py`（新增 user/admin 边界与 rag/query 权限分支用例）。

## 7. 功能与代码映射（回顾用）

1. 鉴权链路（login/refresh/me）：
   - 业务实现：`brain-server/src/server.ts`
   - 测试代码：`brain-server/test/run_governance_e2e.py`（`auth_login/auth_refresh/auth_me`）
2. 权限授权（DATASET/DATASET_OWNER/SKILL/MEMORY_PROFILE）：
   - 业务实现：`brain-server/src/server.ts`
   - 测试代码：`brain-server/test/run_governance_e2e.py`（`perm_*` 与 revoke）
3. 上下文下发（`allowedDatasets/allowedDatasetOwners/allowedSkills/allowedMemoryProfiles`）：
   - 业务实现：`brain-server/src/server.ts` 的 `GET /api/v1/brain/context`
   - 测试代码：`brain-server/test/run_governance_e2e.py`（`brain_context_after_grant/revoke`）
4. 审计查询（权限动作落库）：
   - 业务实现：`brain-server/src/server.ts` 的 `GET /api/v1/admin/audits`
   - 测试代码：`brain-server/test/run_governance_e2e.py`（`audits_query_dataset_owner`）
5. 文件缺失治理管理接口（list/status/batch/export）：
   - 业务实现：`brain-server/src/server.ts` + `brain-server/src/scripts/smokeAdminFileStatusApis.ts`
   - 测试代码：`brain-server/package.json` 的 `ops:smoke-admin-file-status`
