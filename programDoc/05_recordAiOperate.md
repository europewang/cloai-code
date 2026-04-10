# AI 操作记录

## 迭代记录 2026-04-09

- 目标：将 `ts-unified-governance-migration-plan-zh.md` 重构为纯 TS 单项目统一治理方案。
- 变更范围：重写治理目标、架构边界、阶段计划、验收标准，去除旧系统迁移叙事依赖。
- 关键文件：`programDoc/ts-unified-governance-migration-plan-zh.md`
- 接口影响：明确保留并扩展 `auth`、`brain/context`、`health/ready`、审计接口规划。
- 风险与处理：补充“待确认决策”章节，锁定鉴权策略、审计阻断级别、缓存一致性与性能基线。
- 验证结果：文档已更新为“纯 TS 单项目版”，结构与落地路径可直接执行。
- 下步计划：按两周落地清单启动 `brain-server` 骨架、首批 Prisma 模型及最小接口实现。

## 迭代记录 2026-04-09（补充）

- 目标：恢复并强化数据模型细化章节，确保文档具备直接落库实现的规格说明。
- 变更范围：在统一治理方案中恢复 `4.2-4.7`（字段设计、ER、权限边界、索引、生命周期、目录命名空间）。
- 关键文件：`programDoc/ts-unified-governance-migration-plan-zh.md`
- 接口影响：无新增接口，仅增强数据与权限设计的可执行约束。
- 风险与处理：避免“只有原则、缺少表结构细节”的执行偏差，降低后续 Prisma/SQL 反复改动风险。
- 验证结果：`4.2-4.7` 已恢复，且保持纯 TS 单项目语境。
- 下步计划：基于恢复后的字段设计直接输出 Prisma schema 初稿与迁移脚本清单。

## 迭代记录 2026-04-09（用途备注增强）

- 目标：为统一治理文档中的设计项补齐“参数/接口用途详解”，降低实现歧义。
- 变更范围：补充治理范围、组件职责、职责边界、数据实体、字段用途、ER 语义、权限边界、索引策略、生命周期、命名空间、全部 API 的用途说明。
- 关键文件：`programDoc/ts-unified-governance-migration-plan-zh.md`
- 接口影响：无新增接口，增强现有接口的入参/出参/鉴权/注意事项描述。
- 风险与处理：避免开发阶段出现“字段命名一致但语义不一致”的问题，统一了字段职责口径。
- 验证结果：文档已具备“可直接实现”的注释级规格，便于后续 Prisma、Service、Controller 对齐。
- 下步计划：按当前备注输出 OpenAPI 草案与 Prisma schema 初稿，做到接口与模型双向一致。

## 迭代记录 2026-04-09（任务规划与差距清单）

- 目标：在统一治理文档中补充不含人天的任务拆分，并明确现状架构与目标架构不符合项。
- 变更范围：新增第 14 章（任务规划与划分）与第 15 章（不符合项与整改建议），覆盖 Phase 0-5 的输入/输出/验收。
- 关键文件：`programDoc/ts-unified-governance-migration-plan-zh.md`
- 接口影响：无新增接口定义，强化了接口落地顺序、依赖关系和验收路径。
- 风险与处理：提前暴露“CLI 形态、jsonl 持久化、RBAC 真源缺失、治理依赖栈缺失”等差距，降低中后期返工风险。
- 验证结果：文档已形成“规划 + 拆分 + 差距 + 触发式风险处理”闭环。
- 下步计划：输出第 14 章对应的 OpenAPI 草案目录与 Prisma 模型模板，进入实现准备态。

## 迭代记录 2026-04-09（契约草案落地）

- 目标：把规划文档转成可直接执行的接口契约与数据模型草案。
- 变更范围：新增 OpenAPI 草案、Prisma schema 草案；在主规划中回挂产物路径并补充恢复态完整性风险项。
- 关键文件：`programDoc/brain-server-openapi-v1-draft.yaml`、`programDoc/brain-server-prisma-schema-draft.prisma`、`programDoc/ts-unified-governance-migration-plan-zh.md`
- 接口影响：V1 接口结构、鉴权与请求响应 schema 已冻结为草案版本。
- 风险与处理：识别到恢复态缺失依赖可能阻断构建，新增触发式处置规则（先清阻断再加功能）。
- 验证结果：规划、任务、差距、契约四层文档已对齐，进入实现准备态。
- 下步计划：基于草案启动 `brain-server` 代码骨架与首批 migration 文件。

## 迭代记录 2026-04-09（brain-server 骨架落地）

- 目标：将规划推进到可运行代码层，创建 `brain-server` 最小工程骨架。
- 变更范围：新增 `brain-server` 子工程与 `health/ready` 基础接口，实现配置加载与服务启动入口。
- 关键文件：`brain-server/package.json`、`brain-server/tsconfig.json`、`brain-server/.env.example`、`brain-server/src/config.ts`、`brain-server/src/server.ts`、`brain-server/src/index.ts`
- 接口影响：新增占位接口 `GET /api/health`、`GET /api/ready`（用于基础可用性验证）。
- 风险与处理：识别“工作区编排未统一、依赖探测仍占位、治理接口未接入主链”三项差距，已同步写入主规划第 17 章。
- 验证结果：`bun install` 成功，`bun run build` 成功，骨架可进入下一阶段实现。
- 下步计划：实现 `auth/login/refresh/me` 与 JWT 中间件，并接入真实 `ready` 依赖探测。

## 迭代记录 2026-04-09（Docker 启动与缓存优化）

- 目标：使用 Docker 启动并测试 `brain-server`，同时增加环境缓存以提升后续启动速度。
- 变更范围：新增 `brain-server/Dockerfile`、`brain-server/.dockerignore`、`deploy/docker-compose-brain-ts.yml`、`.env.brain.example`；本地创建 `.env.brain` 进行联调；`.gitignore` 增加 `.env.brain` 忽略规则。
- 关键文件：`deploy/docker-compose-brain-ts.yml`、`brain-server/Dockerfile`、`.gitignore`
- 接口影响：容器内 `GET /api/health`、`GET /api/ready` 已可访问并返回 `ok`。
- 风险与处理：识别到同机存在其他 compose 服务，出现 orphan 提示；当前为提示级，不影响本次服务启动与验证。
- 验证结果：`docker compose up -d --build` 成功，`ps` 状态正常，`curl` 与 `logs` 验证通过。
- 下步计划：把 `/api/ready` 从占位检查升级为真实 DB/Redis 探测，并继续接入 `auth/login/refresh/me`。

    缓存与提速策略（已落地）

    - Docker 层缓存： Dockerfile 先复制 package.json + bun.lock 后安装依赖，提升缓存命中。
    - BuildKit 包缓存：使用 --mount=type=cache 缓存 Bun 下载目录，重建更快。
    - 数据持久卷缓存： brain_postgres_data 与 brain_redis_data 保留运行数据，避免重复初始化。
    - 启动建议：
    - 首次或改 Dockerfile： up -d --build
    - 仅重启： up -d （更快）

## 迭代记录 2026-04-09（ready 真探测 + auth 链路）

- 目标：继续推进到“接口可测”阶段，完成 `ready` 真实探测与最小认证闭环。
- 变更范围：`brain-server` 新增 `pg/ioredis/jsonwebtoken` 依赖；`/api/ready` 改为真实探测 PostgreSQL 与 Redis；新增 `auth/login/refresh/me` 三个接口。
- 关键文件：`brain-server/src/server.ts`、`brain-server/src/config.ts`、`brain-server/package.json`、`.env.brain.example`、`.env.brain`
- 接口影响：新增可用接口 `POST /api/v1/auth/login`、`POST /api/v1/auth/refresh`、`GET /api/v1/auth/me`；`/api/ready` 现在会在依赖异常时返回失败状态。
- 风险与处理：当前认证用户源仍为 bootstrap 环境变量账号，不满足正式 RBAC；已在主规划标注为不符合项，后续切换到 `users` 表 + `password_hash`。
- 验证结果：Docker 重建成功，`ready` 返回 `postgres=ok/redis=ok`，`login/me/refresh` 全链路实测通过。
- 下步计划：接入 Prisma 与 `users` 表，替换 bootstrap 登录逻辑并保留兼容降级开关。

## 迭代记录 2026-04-09（Prisma 首批迁移与登录切换）

- 目标：接入 Prisma，落地 `users` 首批迁移，并将登录校验切换到数据库。
- 变更范围：新增 `prisma/schema.prisma`、首批 migration SQL、`seedAdmin` 启动种子；`auth/login/refresh/me` 改为查库校验 + bcrypt 哈希比对。
- 关键文件：`brain-server/prisma/schema.prisma`、`brain-server/prisma/migrations/20260409_init_users/migration.sql`、`brain-server/src/server.ts`、`brain-server/src/scripts/seedAdmin.ts`、`brain-server/Dockerfile`
- 接口影响：认证链路现在由 `users` 表驱动，返回用户来自数据库记录，不再依赖明文内置账号。
- 风险与处理：容器中出现 `@prisma/client did not initialize yet` 阻断，已通过“运行镜像复用 build 阶段 node_modules + 安装 openssl”修复。
- 验证结果：`docker compose up -d --build` 成功，`prisma migrate deploy` 与 `seedAdmin` 在容器内执行成功，`/api/ready` 与 `auth/login` 实测通过。
- 下步计划：实现 `admin/users`、`permissions` 接口并补齐 `manager_user_id` 边界校验与 `memory_profiles` 真实映射。

## 迭代记录 2026-04-09（admin/users 边界落地）

- 目标：实现 `POST /api/v1/admin/users` 与 `PATCH /api/v1/admin/users/{id}`，并落实 `manager_user_id` 管辖边界。
- 变更范围：`brain-server/src/server.ts` 增加创建/更新用户接口、请求体校验、`admin` 与 `super_admin` 角色边界校验、密码哈希更新逻辑。
- 关键文件：`brain-server/src/server.ts`
- 接口影响：`admin/users` 接口可用；`admin` 仅允许管理“自己 + 直属 user”，且不能创建/提升为 `admin/super_admin`。
- 风险与处理：`profileId` 仍为推导值，未接 `memory_profiles` 映射；已在主规划保留为持续不符合项。
- 验证结果：Docker 重建后回归通过（super_admin 创建 admin 成功；admin 创建 admin 被拒绝；admin 创建/更新直属 user 成功；admin 更新 super_admin 被拒绝）。
- 下步计划：实现 `permissions` 授权接口并接入 `memory_profiles` 表，消除 `profileId` 推导逻辑。

## 迭代记录 2026-04-09（permissions + context + 进度总览文档）

- 目标：继续推进权限主干，落地 `permissions` 相关接口，并新增独立项目进度总览文档。
- 变更范围：新增 `permissions` 模型与迁移；实现 `admin/permissions/datasets`、`admin/permissions/skills`、`admin/users/{id}/permissions`、`brain/context`；新增 `programDoc/project-progress-tracker-zh.md`。
- 关键文件：`brain-server/prisma/schema.prisma`、`brain-server/prisma/migrations/20260409_add_permissions/migration.sql`、`brain-server/src/server.ts`、`programDoc/project-progress-tracker-zh.md`
- 接口影响：权限接口与上下文接口已可用，且入参契约对齐为 `datasetIds/skillIds`。
- 风险与处理：实现初期出现入参字段漂移风险（`resourceIds` 与文档不一致），已及时回调到文档契约字段。
- 验证结果：Docker 重建后，权限授予、权限查询、`brain/context` 返回均实测通过；`admin` 越权修改 `super_admin` 权限被正确拒绝（403）。
- 下步计划：接入 `memory_profiles` 真实映射并补齐审计主链（`audit_logs` 等）。

## 迭代记录 2026-04-09（规则技能与三文档同步机制）

- 目标：把“三份核心文档每次都更新”的要求固化到 `rules-enforcer` Skill，并完成本轮文档同步。
- 变更范围：更新 `.trae/skills/rules-enforcer/SKILL.md`，新增固定必读/必更文档规则；同步更新 `project-progress-tracker-zh.md`、`project-summary-zh.md`、`ts-unified-governance-migration-plan-zh.md`。
- 关键文件：`.trae/skills/rules-enforcer/SKILL.md`、`programDoc/project-progress-tracker-zh.md`、`programDoc/project-summary-zh.md`、`programDoc/ts-unified-governance-migration-plan-zh.md`
- 接口影响：无新增接口；本次主要是流程治理和文档治理增强。
- 风险与处理：避免新会话上下文缺失导致重复分析，通过 Skill 固化必读文档列表。
- 验证结果：规则已写入 Skill，三份文档均完成同步更新。
- 下步计划：继续推进 `memory_profiles` 与审计主链落地，并保持三文档同步机制持续执行。

## 迭代记录 2026-04-09（memory_profiles 真映射落地）

- 目标：消除 `profileId` 推导逻辑，改为 `memory_profiles` 真实映射。
- 变更范围：新增 `memory_profiles` Prisma 模型与迁移；`seedAdmin` 增加 profile upsert；`auth/login`、`auth/me`、`brain/context` 切换到真实映射；创建用户后自动建 profile。
- 关键文件：`brain-server/prisma/schema.prisma`、`brain-server/prisma/migrations/20260409_add_memory_profiles/migration.sql`、`brain-server/src/scripts/seedAdmin.ts`、`brain-server/src/server.ts`
- 接口影响：`auth/me` 与 `brain/context` 返回的 `profileId` 由数据库映射驱动，兼容历史用户自动补建 profile。
- 风险与处理：为避免旧账号无 profile 导致登录中断，采用“按需补建”策略平滑迁移。
- 验证结果：Docker 重建成功；`login/me/context` 三链路返回一致 profileId；新建用户登录也能返回已落库 profileId。
- 下步计划：开始落地审计主链（`audit_logs` 等）并把 `admin/users`、`permissions` 写操作接入审计。

## 迭代记录 2026-04-09（audit_logs 第一版落地）

- 目标：落地统一审计主链第一版，实现关键写操作可追溯与可查询。
- 变更范围：新增 `audit_logs` Prisma 模型与迁移；将 `admin/users` 与 `permissions` 写操作接入审计；新增 `GET /api/v1/admin/audits` 查询接口。
- 关键文件：`brain-server/prisma/schema.prisma`、`brain-server/prisma/migrations/20260409_add_audit_logs/migration.sql`、`brain-server/src/server.ts`
- 接口影响：管理端可按 `traceId/userId/action` 查询审计记录，支持分页。
- 风险与处理：当前只覆盖通用审计表，`tool_call_audits` 与 `rag_query_audits` 仍未落地，已保留后续扩展计划。
- 验证结果：Docker 重建成功；以同一 `x-trace-id` 触发用户创建与权限变更后，可在 `/api/v1/admin/audits` 查到对应审计记录。
- 下步计划：补齐细分审计表并把工具调用与 RAG 查询链路纳入审计。

## 迭代记录 2026-04-09（RagFlow 可用性核验与技能化准备）

- 目标：先核验 RagFlow 当前部署可用性，再推进最小接入能力，并将 `cad_text_extractor` 补齐技能封装基础。
- 变更范围：新增 `GET /api/v1/integrations/ragflow/health`；补充 `RAGFLOW_BASE_URL` 配置；修复容器内访问宿主机链路（`host.docker.internal`）；为 `skills/cad_text_extractor` 新增 `SKILL.md` 与 `run_skill.py`。
- 关键文件：`brain-server/src/server.ts`、`brain-server/src/config.ts`、`deploy/docker-compose-brain-ts.yml`、`.env.brain(.example)`、`skills/cad_text_extractor/SKILL.md`、`skills/cad_text_extractor/run_skill.py`
- 接口影响：新增 RagFlow 联通探测接口，可由管理员快速判断当前环境是否满足接入前置条件。
- 风险与处理：最初使用 `127.0.0.1:8084` 导致容器内无法访问 RagFlow，已修正为 `host.docker.internal:8084` 并增加 `extra_hosts`。
- 验证结果：`/api/v1/integrations/ragflow/health` 返回 `status=ok`，并能返回 RagFlow 首页预览（HTTP 200）。
- 下步计划：实现 RagFlow 检索代理接口（带权限过滤与审计），并把 CAD 技能接入统一工具路由。

## 迭代记录 2026-04-09（会话调用测试：RAG + 指标校核）

- 目标：按会话场景验证“rag技能调用”与“指标校核技能调用”是否可执行。
- 变更范围：将 `cad_text_extractor` 技能名调整为 `indicator-verification`；补充 `requirements.txt` 并安装依赖；执行 RAG 与 CAD 两类实际测试。
- 关键文件：`skills/cad_text_extractor/SKILL.md`、`skills/cad_text_extractor/requirements.txt`、`skills/cad_text_extractor/run_skill.py`
- 接口影响：无新增业务接口；主要是会话技能调用链路验证。
- 风险与处理：RAG 直接查询当前被后端鉴权拦截（401/令牌格式限制），已确认联通正常，后续补鉴权对接即可继续。
- 验证结果：指标校核技能批处理成功，输出 JSON/DXF/Excel；RAG health 可用，问答查询待鉴权打通。
- 下步计划：实现 RagFlow 检索代理接口并接入后端鉴权头，同时规划文件上传/下载型技能统一网关。

## 迭代记录 2026-04-10（RagFlow 检索代理与会话问答实测）

- 目标：打通受控 RagFlow 查询代理，并实测“请使用rag技能，查找什么是半面积”。
- 变更范围：新增 `POST /api/v1/rag/query`；加入 `RAGFLOW_QUERY_PATH`、`RAGFLOW_AUTHORIZATION`、`RAGFLOW_BEARER_TOKEN` 配置；将默认 base URL 调整为容器可访问的 `host.docker.internal:8083`。
- 关键文件：`brain-server/src/server.ts`、`brain-server/src/config.ts`、`.env.brain(.example)`
- 接口影响：新增 RagFlow 查询代理（带权限与审计），可作为会话技能统一入口。
- 风险与处理：当前 RagFlow 上游返回“缺少或非法 Authorization 头”，说明代理链路可达但鉴权令牌格式尚未对上；已支持原样透传 `RAGFLOW_AUTHORIZATION` 便于快速对接。
- 验证结果：`/api/v1/rag/query` 已可稳定返回上游状态，审计可查到 `action=rag.query.proxy` 记录；示例问句目前返回 502（上游 401）符合预期。
- 下步计划：拿到可用 RagFlow Authorization 后立即复测“什么是半面积”并完成会话结果闭环。

## 迭代记录 2026-04-10（RAG 示例问句闭环成功）

- 目标：完成“请使用rag技能，查找什么是半面积”的端到端成功闭环。
- 变更范围：将 RagFlow 代理默认路径切换到 `/api/v1/chats_openai/{chatId}/chat/completions`，补充 `RAGFLOW_CHAT_ID` 与 `RAGFLOW_MODEL` 配置，`RAGFLOW_AUTHORIZATION` 支持原样透传。
- 关键文件：`brain-server/src/config.ts`、`brain-server/src/server.ts`、`.env.brain(.example)`
- 接口影响：`POST /api/v1/rag/query` 从“联通可用”升级为“可返回知识库答案”。
- 风险与处理：当前依赖固定 `chatId`；为避免后续租户/数据集变更影响，已标记需做动态会话管理。
- 验证结果：`/api/v1/rag/query` 返回 HTTP 200，且内容中包含“半面积”定义与依据说明（来自 RagFlow 知识库）。
- 下步计划：实现动态 chat/session 路由，并完善文件型技能（上传/下载）网关接口与审计。

## 迭代记录 2026-04-10（动态会话 + 文件网关第一版）

- 目标：完成 RagFlow 动态会话调用，并落地文件型技能网关（上传/下载/执行）。
- 变更范围：`/api/v1/rag/query` 增加动态 chatId 发现；新增 `files/upload`、`files/{id}/download`、`skills/indicator-verification/run` 三个接口；容器安装 Python 依赖并挂载技能目录。
- 关键文件：`brain-server/src/server.ts`、`brain-server/src/config.ts`、`brain-server/Dockerfile`、`deploy/docker-compose-brain-ts.yml`、`brain-server/requirements-indicator-skill.txt`
- 接口影响：支持文件上传后触发指标校核并返回可下载产物，且 RAG 代理在未配置 chatId 时可自动发现会话。
- 风险与处理：下载阶段因中文文件名导致 `content-disposition` 报错，已改为 RFC5987 编码头；文件元数据目前内存存储，重启后会丢失。
- 验证结果：`rag/query` 返回 200 且包含 `chatId`；`upload -> run -> download` 全链路通过，下载文件成功。
- 下步计划：将文件元数据落库，并补“自动创建 RagFlow 会话”而非只发现已有会话。

## 迭代记录 2026-04-10（rag-query 技能化封装）

- 目标：将 RAG 调用改造为“运行时技能”形式，支持 toolcall 风格参数化调用。
- 变更范围：新增 `skills/rag_query/SKILL.md`、`skills/rag_query/run_skill.py`、`skills/rag_query/requirements.txt`。
- 关键文件：`skills/rag_query/SKILL.md`、`skills/rag_query/run_skill.py`
- 接口影响：无新增后端接口，技能入口复用既有 `POST /api/v1/rag/query`。
- 风险与处理：技能脚本默认通过用户名密码登录换 token，生产环境可改为 `--access-token` 直传减少凭据暴露。
- 验证结果：`python3 skills/rag_query/run_skill.py --query '什么是半面积'` 返回 200，输出结构化答案 JSON。
- 下步计划：将 `rag-query` 与 `indicator-verification` 统一到单一“技能任务队列”执行模型，补充异步任务状态接口。

## 迭代记录 2026-04-10（file_assets 元数据落库）

- 目标：消除文件网关“内存 Map”状态，改为数据库持久化。
- 变更范围：新增 `file_assets` Prisma 模型与迁移；`files/upload`、`files/download`、`skills/indicator-verification/run` 改为读写 `file_assets`。
- 关键文件：`brain-server/prisma/schema.prisma`、`brain-server/prisma/migrations/20260410_add_file_assets/migration.sql`、`brain-server/src/server.ts`
- 接口影响：上传/下载/技能运行接口行为不变，但 fileId 元数据可跨服务重启保留。
- 风险与处理：当前文件实体仍在容器本地路径，后续需要对象存储（MinIO/S3）避免镜像重建或迁移导致文件不可用。
- 验证结果：上传并执行指标校核后，`file_assets` 表记录正常；重启 `brain-server` 后按既有 `fileId` 下载成功。
- 下步计划：引入对象存储并为 `file_assets` 增加哈希字段，支撑完整文件校验与跨节点访问。

## 迭代记录 2026-04-10（MinIO 接入 + 容器启动约束执行）

- 目标：将文件存储从本地路径扩展为可选 MinIO/S3，并按要求仅启动本项目相关容器。
- 变更范围：新增 S3 配置项与 SDK 依赖；`files/upload`、`files/download`、`skills/indicator-verification/run` 支持对象存储读写；更新 `.env.brain` 为 `FILE_STORAGE_BACKEND=s3` 并接入 RagFlow MinIO。
- 关键文件：`brain-server/src/config.ts`、`brain-server/src/server.ts`、`brain-server/package.json`、`.env.brain(.example)`
- 接口影响：接口路径不变，存储后端从本地扩展为 `local/s3` 可切换。
- 风险与处理：首次联调出现 MinIO key 不匹配（`ragflow`），已改为 `rag_flow`；下载/运行链路恢复正常。
- 验证结果：`upload -> indicator-verification -> download` 在 s3 模式下通过；当前 `docker ps` 仅有 `brain-*` 与 `ragflow-*` 容器，无关容器未启动。
- 下步计划：补充文件哈希字段与对象生命周期清理任务（冷数据清理、孤儿对象清理）。

## 迭代记录 2026-04-10（sha256 入库 + 孤儿对象清理脚本）

- 目标：为文件链路补充一致性字段，并提供对象存储清理能力。
- 变更范围：新增 `file_assets.sha256_hex` 迁移；`files/upload` 与技能产出写入哈希；新增 `cleanupOrphanS3Objects` 运维脚本与 npm script。
- 关键文件：`brain-server/prisma/schema.prisma`、`brain-server/prisma/migrations/20260410_add_file_assets_sha256/migration.sql`、`brain-server/src/server.ts`、`brain-server/src/scripts/cleanupOrphanS3Objects.ts`、`brain-server/package.json`
- 接口影响：`POST /api/v1/files/upload` 响应新增 `sha256Hex` 字段。
- 风险与处理：历史文件记录尚无哈希值，当前仅新写入对象带哈希；后续需补回填任务。
- 验证结果：新上传文件返回 `sha256Hex` 且入库；清理脚本执行成功（`scanned=6/deleted=0`）。
- 下步计划：增加“历史文件哈希回填”脚本与定时清理任务（cron）。
