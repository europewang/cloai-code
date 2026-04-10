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
   - `POST /api/v1/admin/permissions/skills`
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
   - 当前已支持按 `DATASET/SKILL` 授权，待补齐更多资源类型策略。
2. 契约与实现对齐：
   - 已修正权限接口入参为 `datasetIds/skillIds`，继续监控接口漂移。
3. 数据模型补齐：
   - `tool_call_audits`、`rag_query_audits` 尚未落地，正在规划下一批迁移。
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

## 4. 待完成内容（Todo）

### 4.1 高优先级

1. `permissions` 资源类型扩展：
   - `DATASET_OWNER`
   - `MEMORY_PROFILE`
2. 补齐 `brain/context` 的策略版本与缓存失效策略（可观测、可追踪）。
3. 接口鉴权强化：
   - 令牌轮换策略
   - refreshToken 黑名单或版本戳失效机制

### 4.2 中优先级

1. 审计链路扩展：
   - `tool_call_audits`、`rag_query_audits`
   - 关键动作统一落审计中间件（现已覆盖 admin/users 与 permissions）
2. 管理侧查询能力：
   - 权限查询分页与过滤
   - 审计查询分页与过滤

### 4.3 低优先级

1. 根目录统一工作区启动脚本（减少子工程手动切换）。
2. OpenAPI 自动校验与生成流程（CI 中校验契约一致性）。

## 5. 架构不符合项（持续跟踪）

1. 审计细分表尚未接入，不满足工具与检索明细追踪要求。
2. 目前接口测试主要是脚本回归，自动化测试覆盖仍不足。
3. RagFlow 目前仅做可用性探测，尚未接入受控检索调用链路。
3. 仍需补“历史存量文件回填哈希”与自动化周期清理任务（当前为手动脚本）。

## 6. 下一步建议（按顺序）

1. 扩展 `permissions` 到 `DATASET_OWNER`、`MEMORY_PROFILE` 两类资源。
2. 落地 `tool_call_audits`、`rag_query_audits` 两张细分审计表。
3. 增加历史 `file_assets` 的 `sha256` 回填任务与定时清理作业。
4. 增加最小 API 回归测试脚本集合（登录、鉴权、权限边界、上下文返回）。
