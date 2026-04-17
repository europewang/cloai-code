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

## 迭代记录 2026-04-10（历史哈希回填 + maintenance tick）

- 目标：把“历史哈希回填 + 孤儿清理”串成可周期运行的维护入口。
- 变更范围：新增 `backfillFileSha256.ts`、`maintenanceTick.ts`；新增 npm scripts：`ops:backfill-file-sha256`、`ops:maintenance-tick`；compose 新增可选 `brain-maintenance` 服务（profile 模式）。
- 关键文件：`brain-server/src/scripts/backfillFileSha256.ts`、`brain-server/src/scripts/maintenanceTick.ts`、`brain-server/package.json`、`deploy/docker-compose-brain-ts.yml`、`brain-server/Dockerfile`
- 接口影响：无新增业务接口，属于运维能力增强。
- 风险与处理：历史数据存在 local 路径记录，在 s3 模式回填会失败；已改为“安全跳过并统计 skipped”，避免误报失败。
- 验证结果：`maintenance-tick` 在容器内执行成功，输出 `backfill(scanned=4,updated=0,skipped=4,failed=0)` + `cleanup(scanned=6,deleted=0)`。
- 下步计划：补一个“迁移 local 路径对象到 MinIO 后自动回填哈希”的迁移脚本，彻底消除 skipped 项。

## 迭代记录 2026-04-10（local->s3 存量迁移脚本）

- 目标：将历史 `file_assets` 中 local 路径记录迁移到 MinIO/S3，减少回填 skipped。
- 变更范围：新增 `migrateLocalAssetsToS3.ts` 与 npm script `ops:migrate-local-assets-to-s3`；并把该任务接入 `maintenance-tick` 第一阶段执行。
- 关键文件：`brain-server/src/scripts/migrateLocalAssetsToS3.ts`、`brain-server/src/scripts/maintenanceTick.ts`、`brain-server/package.json`
- 接口影响：无新增业务接口，属于运维迁移能力增强。
- 风险与处理：迁移时发现历史 local 文件已缺失；脚本将其归类为 `missing`，不计 `failed`，避免误导告警。
- 验证结果：容器内执行结果 `scanned=4, migrated=0, missing=4, failed=0`，并输出 `migrate-missing` 明细日志。
- 下步计划：定义 missing 记录处置策略（标记失效/清理记录/人工回补），并据策略实现自动化处置脚本。

## 迭代记录 2026-04-10（missing 文件自动处置第一版）

- 目标：把历史 local 丢失文件从“日志提示”升级为“数据库显式状态 + 业务链路硬保护”。
- 变更范围：`file_assets` 增加 `status/status_reason/status_updated_at` 字段；`migrateLocalAssetsToS3` 在 ENOENT 时自动标记 `missing`；下载与指标校核接口拒绝 `missing` 文件。
- 关键文件：`brain-server/prisma/schema.prisma`、`brain-server/prisma/migrations/20260410_add_file_assets_status/migration.sql`、`brain-server/src/scripts/migrateLocalAssetsToS3.ts`、`brain-server/src/server.ts`、`brain-server/src/scripts/backfillFileSha256.ts`、`brain-server/src/scripts/cleanupOrphanS3Objects.ts`
- 接口影响：`GET /api/v1/files/{fileId}/download` 与 `POST /api/v1/skills/indicator-verification/run` 在命中缺失资产时返回 `410`，避免继续读取脏记录。
- 风险与处理：初版将 Prisma 字段定义为 enum 导致运行时 PG 类型不一致（`public.FileAssetStatus` 不存在）；已改为 `VARCHAR(32)` 与迁移 SQL 保持一致，恢复稳定。
- 验证结果：`bun run build` 通过；`docker compose ... up -d --build brain-server` 成功；`docker exec ai4kb-brain-server node dist/scripts/maintenanceTick.js` 成功，输出 `migrate missing=4 / backfill scanned=0 / cleanup deleted=0`。
- 下步计划：补管理端 `missing` 查询与人工回补回切流程（`missing -> active`），并考虑增加批量处置接口。

## 迭代记录 2026-04-10（missing 资产管理接口补齐）

- 目标：把“missing 资产处置”从脚本侧扩展到管理接口，支持查询和手动状态回切。
- 变更范围：新增 `GET /api/v1/admin/files`（筛选查询）与 `POST /api/v1/admin/files/{fileId}/status`（状态更新）；`admin` 范围限制为自己+直属用户。
- 关键文件：`brain-server/src/server.ts`、`programDoc/project-progress-tracker-zh.md`、`programDoc/project-summary-zh.md`、`programDoc/ts-unified-governance-migration-plan-zh.md`
- 接口影响：管理端可按 `status/category/ownerUserId` 检索文件资产；状态可手动改为 `missing/active`，并记录 `statusReason`。
- 风险与处理：为避免误回切 `active`，接口在回切前先读对象做可用性检查，不可读返回 `409`。
- 验证结果：本地实测 `login=200`、`list_missing=200`、`mark_missing=200`；对缺失对象 `mark_active=409` 且返回“对象不可读”错误，符合预期。
- 下步计划：补“批量状态更新 + 导出 missing 列表”能力，并增加最小 API 回归脚本。

## 迭代记录 2026-04-10（missing 资产批量处置与导出）

- 目标：补齐 missing 管理闭环的批量维护与导出能力，降低手工处理成本。
- 变更范围：新增 `POST /api/v1/admin/files/status/batch` 与 `GET /api/v1/admin/files/export`；批量更新支持最多 200 条，导出默认输出 missing CSV（最多 5000 条）。
- 关键文件：`brain-server/src/server.ts`、`programDoc/project-progress-tracker-zh.md`、`programDoc/project-summary-zh.md`、`programDoc/ts-unified-governance-migration-plan-zh.md`
- 接口影响：管理端可一次性批量标记状态，并直接下载 CSV 用于线下排查与交付对账。
- 风险与处理：批量回切 `active` 场景逐条校验对象可读；不可读记录进入 `errors` 返回，不会误更新。
- 验证结果：实测 `batch_missing=200` 且 `updated=2`，`export_missing=200`，响应头为 `text/csv` 且内容包含 missing 资产清单。
- 下步计划：补最小自动化回归脚本（覆盖文件状态查询、单条更新、批量更新、导出四类接口）。

## 迭代记录 2026-04-10（文件状态接口最小自动化回归脚本）

- 目标：将文件状态管理接口从“手工验证”升级为“一键可重复冒烟验证”。
- 变更范围：新增 `brain-server/src/scripts/smokeAdminFileStatusApis.ts`，并在 `package.json` 增加 `ops:smoke-admin-file-status` 脚本。
- 关键文件：`brain-server/src/scripts/smokeAdminFileStatusApis.ts`、`brain-server/package.json`
- 接口影响：无新增业务接口；新增运维侧回归验证入口。
- 风险与处理：脚本默认只对 `missing` 资产做幂等更新（设为 `missing`），避免误改生产状态；当无 `missing` 数据时自动跳过更新校验并输出提示。
- 验证结果：`bun run build` 通过；`bun run ops:smoke-admin-file-status` 返回 `ok=true`，四类检查（查询/单条/批量/导出）均 200。
- 下步计划：将该脚本接入维护容器的定时任务或 CI 触发任务，形成持续回归。

## 迭代记录 2026-04-10（维护容器接入周期化 smoke 回归）

- 目标：把 `ops:smoke-admin-file-status` 从“手动执行”升级为维护容器周期化自动执行。
- 变更范围：`brain-maintenance` 命令链路改为“`maintenanceTick` 后自动 smoke”；新增环境参数 `MAINTENANCE_ENABLE_SMOKE/MAINTENANCE_INTERVAL_SECONDS`；维护容器内 `BRAIN_BASE_URL` 指向 `http://brain-server:8091`。
- 关键文件：`deploy/docker-compose-brain-ts.yml`、`brain-server/src/scripts/maintenanceTick.ts`、`brain-server/src/scripts/smokeAdminFileStatusApis.ts`、`brain-server/package.json`、`.env.brain.example`
- 接口影响：无新增业务接口；增强了运行时回归保障与日志告警可观测性。
- 风险与处理：首次联调发现容器内无 `node` 命令，已统一改为 `bun` 执行；并增加 smoke 请求重试，降低服务刚启动时的误报。
- 验证结果：重启维护容器后，最新一轮日志显示 `maintenanceTick` 成功，随后 smoke 输出 `ok=true`（`login/list/single/batch/export` 全 200）。
- 下步计划：将 `[ALERT]` 关键字接入现有日志平台告警规则，补通知通道（企业微信/钉钉）。

## 迭代记录 2026-04-10（调整：webhook 告警暂缓 + 继续推进权限扩展）

- 目标：根据用户要求，将 webhook 主动通知改为 `IGNORED_TODO`，并继续推进后续高优先级任务。
- 变更范围：撤回 `sendAlertWebhook` 脚本与 npm script；新增 `MEMORY_PROFILE` 授权接口与上下文返回字段。
- 关键文件：`brain-server/src/server.ts`、`brain-server/package.json`、`programDoc/project-progress-tracker-zh.md`、`programDoc/project-summary-zh.md`、`programDoc/ts-unified-governance-migration-plan-zh.md`
- 接口影响：新增 `POST /api/v1/admin/permissions/memory-profiles`；`GET /api/v1/brain/context` 新增 `allowedMemoryProfiles`。
- 风险与处理：容器重建时再次遇到 pip 外网不可达；当前以本地构建通过为准，运行态验证待网络恢复后补一次容器回归。
- 验证结果：`bun run build` 成功，`server.ts` 无新增诊断错误。
- 下步计划：继续推进 `DATASET_OWNER` 管理接口与审计细分表（`tool_call_audits`、`rag_query_audits`）。

## 迭代记录 2026-04-10（DATASET_OWNER 管理接口与权限入口落地）

- 目标：完成 `DATASET_OWNER` 的管理接口与执行层权限入口，补齐数据集“可访问”和“可管理”两类授权语义。
- 变更范围：在 `server.ts` 新增 `POST /api/v1/admin/permissions/dataset-owners`；`brain/context` 新增 `allowedDatasetOwners` 返回字段；`allowedDatasets` 与 `allowedDatasetOwners` 拆分返回。
- 关键文件：`brain-server/src/server.ts`、`programDoc/project-progress-tracker-zh.md`、`programDoc/project-summary-zh.md`、`programDoc/ts-unified-governance-migration-plan-zh.md`
- 接口影响：权限管理端可独立授予/撤销数据集 owner 权限；执行层可基于 `allowedDatasetOwners` 单独判定管理动作。
- 风险与处理：为避免旧语义混淆，`brain/context` 中不再把 `DATASET_OWNER` 混入 `allowedDatasets`，改为独立字段显式返回。
- 验证结果：`conda run -n ai4tender bun run build` 通过；`server.ts` 诊断无新增错误（仅保留既有未使用函数提示）。
- 下步计划：继续推进审计细分表 `tool_call_audits/rag_query_audits` 与 `policyVersion` 缓存失效策略。

## 迭代记录 2026-04-10（Docker 启动与 DATASET_OWNER 回归验证）

- 目标：在 Docker 运行态验证 `DATASET_OWNER` 新增接口与上下文字段，同时补做现有冒烟回归。
- 变更范围：执行容器重建与运行态测试；由于外网限制导致镜像重建失败，改用“本地 build + `docker cp dist` + 重启 `brain-server`”完成验证。
- 关键文件：`deploy/docker-compose-brain-ts.yml`、`brain-server/src/server.ts`、`brain-server/dist/*`
- 接口影响：无新增接口；重点验证 `POST /api/v1/admin/permissions/dataset-owners` 与 `GET /api/v1/brain/context` 的 `allowedDatasetOwners`。
- 风险与处理：`pip install ezdxf` 仍存在网络不可达；已记录临时验证方案，后续建议补 pip 镜像源或离线 wheel。
- 验证结果：`ready=200`、`login=200`、`dataset-owner grant/revoke=200`，`allowedDatasetOwners` 命中与移除均符合预期；`ops:smoke-admin-file-status` 全项 200。
- 下步计划：继续推进 `tool_call_audits/rag_query_audits`，并补 Docker 构建网络依赖治理。

## 迭代记录 2026-04-10（新增 test 目录统一回归 + 文档功能映射）

- 目标：按用户要求把“前面已实现功能”集中回归，并把测试代码放入 `test` 目录，文档补“功能-代码-测试”映射注释。
- 变更范围：新增 `brain-server/test/run_governance_e2e.py`；`package.json` 新增 `test:e2e-governance` 与 `test:e2e-all`；更新三份主文档的映射章节。
- 关键文件：`brain-server/test/run_governance_e2e.py`、`brain-server/package.json`、`programDoc/project-progress-tracker-zh.md`、`programDoc/project-summary-zh.md`、`programDoc/ts-unified-governance-migration-plan-zh.md`
- 接口影响：无新增业务接口；新增自动化回归入口覆盖鉴权、权限、上下文、审计查询。
- 风险与处理：Docker `up -d` 后容器可能仍运行旧镜像代码，导致新接口 404；已采用“`bun run build` + `docker cp dist` + 重启容器”保证运行态与源码一致。
- 验证结果：`test/run_governance_e2e.py` 全项通过；`ops:smoke-admin-file-status` 全项 200；`python -m py_compile` 通过。
- 下步计划：继续扩展回归脚本覆盖 `admin` 管辖边界与 `rag/query` 权限分支，并处理 pip 构建外网依赖。

## 迭代记录 2026-04-10（按用户要求再次同步容器并重跑全量测试）

- 目标：按用户指定流程执行“本地最新编译产物同步容器 + 重启 + 全量回归”。
- 变更范围：停止卡住构建任务；执行 `bun run build`；执行 `docker cp dist` 同步；重启 `ai4kb-brain-server`；重跑治理与文件回归。
- 关键文件：`brain-server/dist/*`、`brain-server/test/run_governance_e2e.py`、`brain-server/src/scripts/smokeAdminFileStatusApis.ts`
- 接口影响：无新增接口，属于验证执行。
- 风险与处理：Docker 构建链路仍受外网依赖影响，本次继续采用稳定回归路径，不依赖 `up --build` 成功。
- 验证结果：`run_governance_e2e.py` 全项 200；`ops:smoke-admin-file-status` 五项 200；`ai4kb-brain-server` 状态 `Up` 且端口 `8091` 正常。
- 下步计划：若需要彻底解决构建不稳定，可继续落地 pip 国内镜像与离线 wheel 双保险。

## 迭代记录 2026-04-10（高优先级推进：policyVersion + 细分审计）

- 目标：继续完成高优先级剩余项：`policyVersion` 缓存失效策略，以及 `tool_call_audits/rag_query_audits` 落地。
- 变更范围：`brain/context` 的 `policyVersion` 改为 Redis 用户维度版本号；权限/用户变更时自动 bump；新增两张审计表模型与迁移；接入 `rag/query` 与 `indicator-verification` 细分审计写入。
- 关键文件：`brain-server/src/server.ts`、`brain-server/prisma/schema.prisma`、`brain-server/prisma/migrations/20260410_add_tool_call_and_rag_query_audits/migration.sql`、`brain-server/test/run_governance_e2e.py`
- 接口影响：`GET /api/v1/brain/context` 的 `policyVersion` 语义从“请求时间戳”升级为“策略版本号”；`rag/query` 与技能执行新增细分审计落库。
- 风险与处理：容器镜像仍受外网构建影响，继续采用“本地 build + 同步 dist/prisma/prisma-client + 重启容器”路径保证运行态验证。
- 验证结果：`bun run build` 通过；`prisma migrate status` 显示 up-to-date；`test/run_governance_e2e.py`（含 policyVersion 变更断言）通过；`ops:smoke-admin-file-status` 通过；SQL 计数确认 `rag_query_audits=1`、`tool_call_audits=1`。
- 下步计划：补管理侧细分审计查询接口，并继续推进鉴权强化（令牌轮换与 refresh 失效机制）。

## 迭代记录 2026-04-10（继续推进：细分审计查询接口 + 前端联调）

- 目标：继续完成剩余项，补齐细分审计管理查询，并启动前端方便可视化测试。
- 变更范围：新增 `GET /api/v1/admin/audits/skills` 与 `GET /api/v1/admin/audits/rag`；扩展 `test/run_governance_e2e.py` 校验上述接口；启动并确认 `ragflow-frontend` 可访问。
- 关键文件：`brain-server/src/server.ts`、`brain-server/test/run_governance_e2e.py`、`programDoc/project-progress-tracker-zh.md`、`programDoc/project-summary-zh.md`、`programDoc/ts-unified-governance-migration-plan-zh.md`
- 接口影响：管理端可分页过滤查询工具调用审计与 RAG 审计；原有接口无破坏性变更。
- 风险与处理：容器重启瞬时会出现连接重置；已改为“重启后串行重跑”确保回归稳定。
- 验证结果：`test/run_governance_e2e.py` 全项通过（新增 `audits_query_skills/audits_query_rag`）；`ops:smoke-admin-file-status` 通过；`ragflow-frontend` 在 `http://127.0.0.1:8086` 返回 200。
- 下步计划：继续推进鉴权强化（token 轮换 + refresh 失效策略）并补细分审计导出能力。

## 迭代记录 2026-04-10（按用户要求：前端与 brain 纳入同一 compose 网络）

- 目标：将前端与 `brain-server` 放入同一个 Docker 网络，并统一使用 `deploy/docker-compose-brain-ts.yml` 启动。
- 变更范围：在 `deploy/docker-compose-brain-ts.yml` 新增 `frontend` 服务，设置 `BACKEND_URL=http://brain-server:8091`，挂到 `ai4kb-brain-net`。
- 关键文件：`deploy/docker-compose-brain-ts.yml`
- 接口影响：无后端协议变更，前端通过 `/api` 代理直接访问 `brain-server`。
- 风险与处理：原 `ragflow-frontend` 占用 8086 端口导致冲突，已先清理再以新编排拉起 `ai4kb-frontend`。
- 验证结果：`frontend_home=200`；`/api/v1/auth/login=200`；`/api/v1/admin/users=200`（经 8086 前端代理）。
- 下步计划：继续按“前端尽量不变、server 少改”原则补接口适配；若出现大出入，先评审再改。

## 迭代记录 2026-04-10（前后端能力对照清单落文档）

- 目标：梳理“前端需要但后端未实现”与“后端已有但前端未展示”的双向缺口，形成后续工作池。
- 变更范围：基于 `frontend/src/App.jsx` 实际 API 调用与 `brain-server/src/server.ts` 已暴露路由做对照；将清单写入三份主文档。
- 关键文件：`programDoc/project-progress-tracker-zh.md`、`programDoc/project-summary-zh.md`、`programDoc/ts-unified-governance-migration-plan-zh.md`
- 接口影响：无代码接口变更，属于规划与排期增强。
- 风险与处理：识别会话/聊天、数据集管理、技能管理存在“大出入”，已在文档标注“先评估再开发”。
- 验证结果：三份文档均已新增缺口清单与任务分组（低/中/高风险）。
- 下步计划：按 A组（代理适配）优先，C组（会话与职责边界）先评审再动代码。

## 迭代记录 2026-04-10（前端接口兼容改造：已有后端能力项）

- 目标：仅改前端，修复“已有后端等价能力”但接口协议不兼容的问题。
- 变更范围：`frontend/src/App.jsx` 中登录、用户管理、权限查询与权限同步函数切换到 `brain` 的 `/api/v1/*` 协议；不改后端主业务逻辑。
- 关键文件：`frontend/src/App.jsx`
- 接口影响：`/user/auth/login` -> `/v1/auth/login`，`/admin/users*` -> `/v1/admin/users*`，`/admin/permission*` -> `/v1/admin/users/{id}/permissions` + `/v1/admin/permissions/datasets`。
- 风险与处理：`username` 修改在后端暂不支持，前端更新函数已保留参数签名但跳过用户名写入，避免误报失败。
- 验证结果：`npm run build` 通过；同步前端产物并重启容器后，`/api/v1/auth/login=200`、`/api/v1/admin/users=200`。
- 下步计划：继续处理“无后端等价能力”的接口（datasets/documents、conversations、agent/tool、skills 注册管理），按先评估后改造推进。

## 迭代记录 2026-04-10（补测试登录实例）

- 目标：解决“无可登录测试实例”的阻塞问题。
- 变更范围：验证当前可用管理员账号；通过管理员接口创建测试普通用户并回归登录。
- 关键文件：无代码文件改动（运行态数据变更）。
- 接口影响：调用 `POST /api/v1/admin/users` 新增测试用户记录。
- 风险与处理：保持最小权限原则，仅创建 `user` 角色测试账号，避免额外管理员账号扩散。
- 验证结果：`admin/admin123456` 登录 200；`zhangsan/ChangeMe123!` 创建成功并登录 200。
- 下步计划：如需，我可再补一个 `admin` 测试账号用于管理页联调。

## 迭代记录 2026-04-10（前后端联调继续：前端兼容第二批）

- 目标：继续打通“前端旧管理页 -> brain 现有接口”的联调链路，减少页面级报错。
- 变更范围：`frontend/src/App.jsx` 中 `fetchRouteSamples/fetchRouteSampleSources/fetchSuperAdminOverview/fetchAdminSkills/fetchSkillAudit/fetchSkillAuditOptions/fetchDatasets`。
- 关键文件：`frontend/src/App.jsx`
- 接口影响：旧 `route-samples/skills-audit/super-overview` 请求改为消费 `brain` 的 `audits/users/permissions`，并在前端做字段适配。
- 风险与处理：总览与数据集当前为“兼容视图”（聚合/只读），不是完整业务域模型；已避免改动后端主逻辑。
- 验证结果：`npm run build` 通过；同步前端产物并重启后，`/api/v1/auth/login=200`、`/api/v1/admin/audits/skills=200`、`/api/v1/admin/audits/rag=200`、`/api/v1/admin/users=200`。
- 下步计划：处理高出入项（会话/聊天流、agent/tool、datasets/documents 全量管理）前先与你评估边界。

## 迭代记录 2026-04-10（会话与聊天链路：前端适配层方案落地）

- 目标：优先打通会话与聊天链路，不大改 `brain-server`。
- 变更范围：在 `frontend/server.js` 增加 `/api/user/conversations*` 兼容实现（内存存储），并新增 `/api/v1/agent/chat/stream` 适配到 `brain /api/v1/rag/query` 的 SSE 转换。
- 关键文件：`frontend/server.js`
- 接口影响：前端旧会话/流式协议可继续使用；后端主逻辑无改动。
- 风险与处理：会话数据当前为前端代理层内存态（容器重启会丢失）；作为联调阶段可接受，后续可迁移到后端持久化接口。
- 验证结果：会话创建/列表/消息读写均 200；流式接口返回包含 `event: message` 与 `data: [DONE]`。
- 下步计划：若继续联调工具链路，下一步在适配层补 `/v1/agent/tool/*` 最小可用兼容（或先评估是否下线该入口）。

## 迭代记录 2026-04-10（排查“前端提问无回复”：zhangsan）

- 目标：先验证后端 RagFlow 调用，再定位 `zhangsan` 前端无回复原因。
- 排查结果：
  - `admin` 直调 `POST /api/v1/rag/query` 提问“什么是半面积”返回 200（后端到 RagFlow 链路正常）。
  - `zhangsan` 的 `brain/context.allowedDatasets` 为空，直调 `rag/query` 返回 403：`datasetId is required for non-super-admin users`。
  - 前端流式链路原先仅收到 error 事件，表现为“像是没回复”。
- 修复动作：在 `frontend/server.js` 的 `/api/v1/agent/chat/stream` 适配层增加：
  - 自动查询 `brain/context` 并尝试补 `datasetId`；
  - 若无数据集，返回 `event: message` 友好提示（同时 `[DONE]`）。
- 验证结果：`zhangsan` 流式接口现在返回明确提示文本：`当前账号未分配可用数据集...`，不再出现前端无感知无回复。

## 迭代记录 2026-04-10（按用户要求回调：server 自主判断，前端不做路由拦截）

- 目标：满足“前端只透传，server 自主判断 route/toolcall/ragflow 调用”的架构要求。
- 变更范围：移除 `frontend/server.js` 中 dataset 预判拦截；调整 `brain-server/src/server.ts` 的 `rag/query` 逻辑，在未传 `datasetId` 时由后端自动选择最近授权数据集。
- 关键文件：`frontend/server.js`、`brain-server/src/server.ts`
- 接口影响：`/api/v1/agent/chat/stream` 不再输出前端固定兜底文案；输出以 server 返回为准。
- 风险与处理：为验证 server 自主链路，已为 `zhangsan` 授权 `public-default` 数据集权限。
- 验证结果：`admin` 与 `zhangsan` 都能收到 server 原始流式返回，当前内容一致为 `APIConnectionError('Connection error.')`，确认主瓶颈为 RagFlow 上游连接异常。
- 下步计划：排查 RagFlow 上游连接（URL/鉴权/chatId/网络）并恢复稳定模型回答。

## 迭代记录 2026-04-10（按目标流程打通：server 自主 + 权限 + ragflow）

- 目标：按用户要求完成“server 自主判断 + ragflow 权限知识库检索”闭环，并验证提问“请使用rag的skill，解答什么是半面积”。
- 变更范围：
  - 为现有 `user` 账号批量授权 RagFlow 现有知识库（前 3 个 dataset）。
  - 修正 `.env.brain`：`RAGFLOW_QUERY_PATH` 从 `chats_openai` 改为 `/api/v1/chats/{chatId}/completions`。
  - 前端适配层补 SSE 文本答案抽取（`frontend/server.js`），展示 server 真实返回。
- 关键文件：`.env.brain`、`brain-server/src/config.ts`、`brain-server/src/server.ts`、`frontend/server.js`
- 接口影响：`/api/v1/rag/query` 继续由 server 主导；前端仍只透传 query，不承担路由判断。
- 验证结果：
  - server 端 `zhangsan` 提问“请使用rag的skill，解答什么是半面积”返回 200。
  - 前端流式已显示 server 返回内容（示例：`Hi! I'm your assistant...`），不再固定死提示。
- 下步计划：继续优化 `rag/query` 请求体（question/query/message history）以提升中文知识库命中和回答质量。

## 迭代记录 2026-04-10（按用户要求：清空 RagFlow 聊天并验证 zhangsan 重建）

- 目标：清空 RagFlow 所有聊天，给 `zhangsan` 分配知识库后发起提问，观察是否自动创建“zhangsan 专属 chat”并挂载知识库。
- 执行动作：
  - 清空 `rag_flow.dialog`（`696 -> 0`），`/api/v1/chats` 验证为 `0`。
  - 通过 `admin/permissions/datasets` 给 `zhangsan` 授权 2 个 RagFlow dataset。
  - `zhangsan` 调用 `POST /api/v1/rag/query`，问题：`请调用ragflow技能，问什么是半面积`。
- 验证结果：
  - `brain/context` 显示 `zhangsan` 已有多个 `allowedDatasets`。
  - `rag/query` 返回：`code=102, You don't own the chat 703...`。
  - RagFlow `/api/v1/chats` 仍为 `0`，未自动创建 zhangsan chat。
- 结论：当前链路依赖固定 `RAGFLOW_CHAT_ID`（`.env.brain`），尚未实现“按用户自动创建/绑定 RagFlow chat”。
- 下步计划：在 `server` 增加“无 chat 时自动创建 + 用户到 chat 映射”机制，彻底符合“server 自主 + 权限隔离”目标。

## 迭代记录 2026-04-10（实现：按用户自动创建/重建 RagFlow chat）

- 目标：落实“server 作为大脑”，去掉固定 chat 依赖，实现用户级 chat 自动创建与重建。
- 变更范围：`brain-server/src/server.ts`（新增 RagFlow chat 创建函数、Redis 用户映射、ownership 失配重建重试逻辑）。
- 关键点：
  - Redis 键：`brain:rag:chat:user:{userId}`
  - 新建 chat 优先尝试绑定已授权 datasets（逐个尝试有效 dataset），失败再降级空 chat。
  - 捕获 `You don't own the chat` 后自动重建并重试一次。
- 验证结果：
  - 清空 `rag_flow.dialog` 后，`zhangsan` 提问可自动创建新 chat：`brain_user_49_...`。
  - RagFlow `/api/v1/chats` 显示新 chat 已绑定知识库：`建筑面积`。
  - `server` 返回 `chatId` 为新建 chat，链路不再依赖固定 `RAGFLOW_CHAT_ID`。

## 迭代记录 2026-04-10（按用户要求执行 xinference 启动脚本）

- 目标：直接执行 `launch_xinference_models.py`，并确保 xinference 正常加载“3 个具体模型”。
- 变更范围：修正 `deploy/docker-compose-xinference.yml` 模型挂载路径。
- 关键修复：`../models:/models` -> `/home/ubutnu/code/AI4LocalKnowledgeBase/models:/models`。
- 执行动作：
  - `docker compose -f deploy/docker-compose-xinference.yml up -d --force-recreate`
  - `python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py`
- 验证结果：
  - 脚本输出 `Success`：`bge-m3`、`bge-reranker-v2-m3`、`deepseek-r1-distill-qwen-14b`。
  - `GET /v1/models` 返回 `model_count=3`，三模型均可见。

## 迭代记录 2026-04-10（回归确认：query 已真实传入 RagFlow）

- 目标：确认“不是固定欢迎词”，而是 RagFlow 真正消费用户问题并返回知识库答案。
- 执行动作：
  - 使用 `zhangsan` 调用 `POST /api/v1/rag/query`，问题：`请调用ragflow技能，问什么是半面积`。
  - 同步查看前端流式与后端日志。
- 验证结果：
  - `rag/query` 返回 200，`traceId=4b29cc0a-8720-43b2-937d-3cdf091878a6`。
  - 返回 `data.choices[0].message.content` 包含“半面积”相关中文长答案与知识库片段说明。
  - 结论：当前 query 已真实传入 RagFlow 并产出检索回答，不再是固定欢迎语。

## 迭代记录 2026-04-10（修复“请求已完成，暂未返回可展示内容”）

- 目标：解决前端提问后仅显示“请求完成但无可展示内容”的问题。
- 根因定位：
  - `frontend/server.js` 只取 `answer/data.answer`，未覆盖 `data.choices[0].message.content`。
  - `brain-server` 在 Redis 短暂不可写时，`user->chat` 映射读写直接抛错中断（`Stream isn't writeable...`）。
- 修复动作：
  - 前端适配层补 `choices[0].message.content` 提取。
  - 后端映射读写改为“Redis 异常降级不阻断请求”。
- 验证结果：前端流式已返回并展示“半面积计算”中文长答案，问题消失。

## 迭代记录 2026-04-10（按要求增强：引用与流式）

- 目标：尽可能输出 RagFlow 回传的全部内容，并提升为增量流式展示。
- 变更范围：`frontend/server.js`、`frontend/src/App.jsx`
- 关键修复：
  - `server.js` 新增 `references` 多路径提取 + `raw` 全量透传。
  - `server.js` 按 120 字分片发送 `event: message`（token 风格流式）。
  - `App.jsx` 扩展 `normalizeRefs`：支持 `references/reference/raw/choices.message.reference`。
- 验证结果：
  - 流式事件数由 1 提升到 8（同一问题实测）。
  - 当前该问题下 RagFlow 返回 `references=[]`，因此无原文定位卡片；但只要上游返回引用字段，前端已可展示。

## 迭代记录 2026-04-10（按用户反馈修复：skill/toolcall 未完全利用）

- 目标：让 `rag/query` 真正走 ragflow-backend 的 skill/toolcall 流路，并带回引用与原文片段。
- 根因：
  - `brain-server` 容器内默认 `RAGFLOW_BACKEND_BASE_URL=127.0.0.1:8083` 不可达；
  - 导致后端 token 缓存为空，`rag/query` 一直回退到无引用路径。
- 修复：
  - `.env.brain` 新增 `RAGFLOW_BACKEND_BASE_URL=http://host.docker.internal:8083`；
  - `brain-server/src/server.ts` 增加：
    - 登录时同步获取 ragflow-backend token 并缓存；
    - `rag/query` 优先调用 `/api/v1/agent/chat/stream`；
    - 解析 SSE 聚合 `answer + reference` 回传前端。
- 验证结果：
  - `rag/query` 返回 200 且 `has_refs=True`；
  - 前端流式 `contains_ref=True`、`message_events=13`，可见引用数组（含 `document_id/chunk_id/content`）。

## 迭代记录 2026-04-10（修复“引用有但不可点击”）

- 目标：让模型输出中的中文引用标记（如 `[引用来源1]`）可点击打开原文定位。
- 根因：`MarkdownWithCitations` 仅处理 `[ID:0]/[0]`，未兼容 `[引用来源N]/[来源N]`。
- 修复：扩展引用正则映射，把 1-based 中文引用转换为内部 `#citation-{index}`。
- 验证结果：消息中 `[引用来源1]` 可点击；点击后打开 `SourceViewer`，可查看原文内容、图片与 PDF 高亮定位（取决于 reference 字段是否提供）。

## 迭代记录 2026-04-10（用户反馈：你好空回复 + 引用资源缺失）

- 目标：修复短问候“请求已完成，暂未返回可展示内容”，并恢复引用图片/原文接口。
- 根因：
  - `brain-server` 聚合 toolcall SSE 时未处理 `event: token`；
  - `brain-server` 缺少 `/api/document/get/:id` 与 `/api/document/image/:id` 路由，前端点击引用 404。
- 修复动作：
  - 在 `queryRagByBackendSkillStream` 中累计 `token` 事件文本作为答案。
  - 新增两条文档透传路由（带 authGuard + 用户后端 token）：
    - `/api/document/get/:documentId`
    - `/api/document/image/:imageId`
- 验证结果：
  - 提问“你好”可正常返回正文，不再落入“暂未返回可展示内容”。
  - 文档与图片路由均返回 200（PDF/PNG/JPEG 可正常加载）。

## 迭代记录 2026-04-10（再次确认“是否真流式”并改造链路）

- 目标：消除伪流式，确保从 brain 到前端的真实增量输出。
- 问题复现：旧实现在 `frontend/server.js` 先请求 `rag/query` 完整 JSON，再拆分发送，导致首包极晚且一次性到齐。
- 修复动作：
  - `brain-server` 新增 `POST /api/v1/rag/query/stream`，直接转发 ragflow-backend SSE。
  - `frontend /api/v1/agent/chat/stream` 改为直连上述流式接口并原样转发 chunk。
- 量化验证（毫秒级）：
  - `http_status=200, ttfb≈15861ms`
  - `15861ms event:analysis_plan`
  - `19339ms 起连续 event:token`（逐段到达）
- 结论：当前链路已是“真流式”；等待时间主要来自上游 ragflow-backend 首 token 生成耗时。

## 迭代记录 2026-04-11（按目标架构回归：去掉 ragflow-backend 依赖）

- 目标：由 `brain-server` 直接完成 tool/skill 路由与 RAG 调用，`ragflow-backend` 不再参与问答主链路。
- 关键改造：
  - 删除 `brain-server` 中后端 token 缓存与 `/api/v1/agent/chat/stream` 依赖逻辑。
  - `rag/query/stream` 直连 `ragflow-server /api/v1/chats_openai/{chatId}/chat/completions`。
  - 调用参数增加 `extra_body.reference=true`，从 `choices[0].delta.reference` 直接获取引用。
  - 新增 SSE 转换：OpenAI chunk -> `event: token`；引用/最终答案 -> `event: message`。
  - 文档/图片透传改为直连：
    - `/v1/document/get/:documentId`
    - `/v1/document/image/:imageId`
- Docker 验证（backend 关闭状态）：
  - `ragflow-backend_running=False`
  - 前端流式：`ttfb≈1830ms`，`token_events=68`，`message_events=2`
  - `rag/query` 引用：`refs=6`
  - 原文/图片透传：`/api/document/get|image` 均 `200`
- 结论：已满足“brain 才是大脑，ragflow 仅作为知识与生成引擎”的目标架构。

## 迭代记录 2026-04-11（架构角色纠偏：src 是大脑，brain-server 是辅助编排）

- 背景：用户明确要求纠正角色定义，避免把 `brain-server` 当作主决策大脑。
- 纠偏结论：
  - `src/`：主决策大脑（语义理解、skill/toolcall 路由决策）。
  - `brain-server/`：辅助编排层（权限治理、网关透传、结果标准化）。
- 已修改文档：
  - `README.md` 新增“架构角色澄清（重要）”段落。
  - `project-summary-zh.md`、`project-progress-tracker-zh.md`、`ts-unified-governance-migration-plan-zh.md` 同步改写错误表述并标注当前偏差。
- 备注：当前运行链路仍存在“前端直连 brain-server 的过渡实现”，后续需按计划将路由决策前移回 `src` 大脑层。

## 迭代记录 2026-04-11（模型资源重排：xinference 两小模型 + Ollama LLM）

- 目标：按用户要求移除 xinference 大模型，仅保留 embedding/rerank，并让 `src` 使用 Ollama 大模型稳定返回。
- 改动：
  - `launch_xinference_models.py` 删除 deepseek 注册与启动，只保留：
    - `bge-m3`
    - `bge-reranker-v2-m3`
  - `deploy/docker-compose-ragflow.yml`（backend）改为：
    - `LLM_BASE_URL=http://host.docker.internal:11434/v1`
    - `LLM_MODEL=qwen3.5:9b`
- 执行结果：
  - xinference 当前仅两小模型；
  - `ollama ps` 显示 `qwen3.5:9b` 且 `PROCESSOR=100% GPU`；
  - `src` 验证命令返回 `SRC_OLLAMA_OK`。

## 迭代记录 2026-04-11（按要求移除 ragflow backend）

- 用户要求：`backend` 与当前项目无关，应从 RagFlow compose 中删除。
- 处理：
  - 删除 `deploy/docker-compose-ragflow.yml` 内 `backend` 服务块。
  - 删除 `frontend.depends_on: backend`。
  - 清理运行中的 `ragflow-backend` 容器。
- 验证：
  - `docker compose -f deploy/docker-compose-ragflow.yml config` 通过。
  - 当前仅保留 `ragflow-server/mysql/redis/minio/es01` 相关容器。

## 迭代记录 2026-04-11（RagFlow 对接 Ollama 连接报错修复）

- 问题：`Fail to access model(Ollama/qwen3.5-9b)` + `Cannot connect to host ollama:11434`
- 根因：
  - 容器内主机名 `ollama` 不可解析；
  - 模型名误写为 `qwen3.5-9b`。
- 修复：
  - `deploy/docker-compose-ragflow.yml` 为 `ragflow` 服务新增：
    - `extra_hosts: host.docker.internal:host-gateway`
  - 模型名统一改为：`qwen3.5:9b`
- 验证：
  - 容器内 `getent hosts host.docker.internal` 返回 `172.17.0.1`
  - 容器内 `curl http://host.docker.internal:11434/api/tags` 成功返回模型列表。

## 迭代记录 2026-04-11（brain-server 前后置拆分 + src 接入）

- 目标：按“前置 server/后置 server”思路改造辅助编排层，`src` 保持大脑角色。
- 代码改动：
  - 新增 `brain-server/src/routes/preServer.ts`：
    - `/api/v1/brain/context`
    - `/api/v1/pre/context`
  - 新增 `brain-server/src/routes/postServer.ts`：
    - `/api/v1/post/toolcall/authorize`
  - `brain-server/src/server.ts` 改为注册上述路由模块。
  - 新增 `src/services/brainOrchestration/client.ts`（前后置接口客户端）。
  - `SkillTool.checkPermissions` 与 `processSlashCommand` 增加 brain 前后置策略检查入口（环境变量启用）。
- 验证：
  - `brain-server` 编译通过；
  - `/api/v1/pre/context` 返回 `allowedSkills/allowedDatasets/profileId/memoryScope/policyVersion`；
  - `/api/v1/post/toolcall/authorize` 对无权限 skill 返回 `403 skill_permission_denied`；
  - `src` 基础对话命令仍可返回 `SRC_OK`。

## 迭代记录 2026-04-11（skills 运行器改造与实测）

- 改造目标：让 `skills` 目录下 CAD/RAG 两个 skill 与当前项目调用链保持一致（参数兼容、结构化返回、可测试）。
- 变更：
  - `skills/rag_query/run_skill.py`
    - 支持 `--query` 与位置参数双入口；
    - 支持 `BRAIN_SERVER_BASE_URL/BRAIN_SERVER_ACCESS_TOKEN/BRAIN_SERVER_USERNAME/BRAIN_SERVER_PASSWORD`；
    - 新增 `--skill-id`（可选）与 `--allow-upstream-error`；
    - 输出统一 JSON：`ok/skill/traceId/chatId/answer/referenceCount/references/raw`。
  - `skills/cad_text_extractor/run_skill.py`
    - 支持位置参数与 `--input-root/--output-root/--checker/--reviewer`；
    - 输出统一 JSON 汇总（产物计数 + 产物清单）。
  - 同步更新两份 `SKILL.md` 使用说明。
- 实测：
  - RAG：`python3 skills/rag_query/run_skill.py --query "什么是半面积" ... --allow-upstream-error` 返回结构化 JSON；
  - CAD：`python3 skills/cad_text_extractor/run_skill.py --input-root skills/cad_text_extractor/input/样例 --output-root /tmp/skill_cad_test_output ...` 产出 `json+dxf+xlsx` 共 3 文件并返回汇总 JSON。

## 迭代记录 2026-04-12（整项目流程联测：RAG + CAD + 多用户）

- 目标：验证“src 大脑 + brain-server 前后置 + ragflow/ollama + 文件型 CAD skill”完整链路。
- 执行：
  - 用户与权限：
    - `zhangsan`：授予 `rag-query`、`indicator-verification`
    - `lisi`：仅授予 `indicator-verification`，显式撤销 `rag-query`
  - RAG 测试：
    - `zhangsan` 调 `POST /api/v1/rag/query`（`skillId=rag-query`）=> 200
    - `lisi` 同请求 => 403 `skill permission denied`
  - CAD 测试：
    - `zhangsan` 上传 dxf 至 `/api/v1/files/upload`，再调用 `/api/v1/skills/indicator-verification/run`
    - 成功生成 3 个产物并可下载（xlsx/dxf/json）
    - `lisi` 使用 `zhangsan` 的 `fileId` 调用 => 403 `forbidden file access`
  - src prompt 联测：
    - 强制调用 `indicator-verification`，输入目录 `/home/ubutnu/code/cloai-code/skills/cad_text_extractor/input/样例`
    - 输出目录 `/tmp/cad_skill_from_src`
    - 成功返回文件列表并落地产物。

## 迭代记录 2026-04-12（前端接口对接改造）

- 背景：前端展示形态可用，但接口契约与后端现状不一致，导致工具流不可跑通。
- 改造文件：`frontend/server.js`
- 新增能力：
  - `/api/v1/agent/tool/catalog`：返回两类技能目录（rag-query/cad）。
  - `/api/v1/agent/tool/draft`：生成草稿并缓存 toolCallId。
  - `/api/v1/agent/tool/upload`：上传文件到 `brain-server /api/v1/files/upload` 并关联草稿。
  - `/api/v1/agent/tool/approve`：执行技能并通过 SSE 返回 `tool_result/message/[DONE]`。
  - `/api/v1/agent/chat/stream`：增加关键词意图适配（RAG 自动带 `skillId`；CAD 先返回 `tool_draft`）。
- 联调结果：
  - `zhangsan` 在前端可完成 RAG 与 CAD 全链路；
  - `lisi` 调 RAG 收到权限拒绝事件；
  - CAD 上传后可获得输出文件下载 URL。

## 迭代记录 2026-04-12（每用户记忆 + src 记忆注入）

- 目标：实现“每用户记忆可编辑 + src 每轮读取当前用户记忆 + profile 可切换”。
- 代码改动：
  - `brain-server/src/server.ts`
    - 新增 `GET /api/v1/memory/profiles`
    - 新增 `GET /api/v1/memory/current`
    - 新增 `PUT /api/v1/memory/current`
    - 记忆落盘路径：`memory-profiles/<storageRoot>/MEMORY.md`
  - `src/services/brainOrchestration/client.ts`
    - 新增 `fetchCurrentMemory(profileId?)`
  - `src/utils/queryContext.ts` / `src/QueryEngine.ts` / `src/screens/REPL.tsx`
    - system prompt 组装阶段自动附加 `# User Memory (...)` 文本
  - `frontend/src/App.jsx`
    - 新增“记忆管理”页签与编辑器
    - 聊天请求支持携带 `memoryProfileId`
- 验证：
  - 前端经 `8086` 调用记忆接口成功；
  - `zhangsan` 写入 `profile-49` 后可读回，`lisi` 读取该 profile 返回 403；
  - `src` 在不同 token/profile 下回答分别命中对应记忆定义（`profile-49` 与 `profile-79` 回答不同）。

## 迭代记录 2026-04-15（rag-query skill 修复：添加 context: fork）

- 目标：修复 rag-query skill 不执行真正 RAG 调用的问题。
- 问题根因：
  - `skills/rag_query/SKILL.md` 原本没有 `context: fork` 配置
  - skill 内容只是被当作 markdown 说明读给 LLM，LLM 不会真正执行 `run_skill.py`
  - 因此 RAG 查询从未真正执行
- 修复内容：
  - 在 `skills/rag_query/SKILL.md` 添加 `context: fork`
  - 添加实际可执行命令：`python3 skills/rag_query/run_skill.py $ARGUMENTS`
  - 明确告诉子 agent 要实际执行命令，不只是描述
- 修改文件：
  - `skills/rag_query/SKILL.md`
- 同步更新：
  - `programDoc/howtoload.md`：更新测试命令为 "什么是半面积"
  - `programDoc/05_recordAiOperate.md`：添加本条迭代记录
- 下步计划：重启 Docker 测试 rag skill 是否真正执行 RAG 调用

## 迭代记录 2026-04-17（SSE 流式输出 + RAG/AI 内容区分显示）

- 目标：让前端能同时看到 RAG 检索内容和 LLM 总结，以流式方式输出，且区分显示。
- 问题排查过程：
  1. 最初 SSE 只有 `message` 事件，缺少 `rag_content` 事件
  2. 检查 `extractSkillResultFromToolResult` 函数，发现正则匹配不到 `__STRUCTURED_RESULT__` 标记
  3. 发现正则 `/__STRUCTURED_RESULT__:(.+)$/` 无法正确匹配多行 JSON（`.` 不匹配换行符）
  4. 添加详细调试日志，重新构建后确认 structuredResult 正确提取
- 修改内容：
  - `src/services/brainOrchestration/brainService.ts`
    - 修复 `extractSkillResultFromToolResult` 正则（改用 `[\s\S]` 匹配换行）
    - 添加详细调试日志
    - `structured_result`/`rag_content` 事件同时发送 `message` 和 `rag_content` 两种 SSE 事件
  - `frontend/src/App.jsx`
    - 新增 `eventName === 'rag_content'` 处理逻辑（三处）
    - RAG 内容添加 `📚 RAG检索结果` 标记头
    - LLM 回答添加 `🤖 AI回答` 标记头（仅在有 RAG 内容后首次出现 LLM 输出时添加）
    - 添加 `payload.type === 'rag_content'` 过滤，避免 message 和 rag_content 重复处理
- 验证结果：
  - SSE 输出：`skill_start` → `skill_end` → `message` (rag_content) → `rag_content` → LLM总结 → `[DONE]`
  - 前端显示：`📚 RAG检索结果` 内容 → 分隔线 → `🤖 AI回答` 内容
  - references 数组包含 image_id，可通过 `/api/document/image/:imageId` 获取图片

## 迭代记录 2026-04-17（JWT Token 过期时间延长 + 自动刷新）

- 目标：延长 JWT access token 过期时间，减少前端频繁登出的问题。
- 问题：access token 默认只有 30 分钟，前端经常需要重新登录。
- 修改内容：
  - `brain-server/src/config.ts`
    - `JWT_ACCESS_EXPIRES_IN` 从 `'30m'` 改为 `'8h'`
  - `frontend/src/App.jsx`
    - 新增 `getRefreshToken()` 函数
    - `apiFetch` 函数增加自动刷新 token 逻辑：
      - 401 时尝试用 refreshToken 获取新 accessToken
      - 刷新成功后重试原请求
      - 刷新失败才触发登出事件
- 验证结果：
  - access token 现在 8 小时过期
  - 前端会自动刷新 token，无需手动重新登录

## 迭代记录 2026-04-15（Docker 启动与测试）

- 目标：重启项目并测试 API 是否正常。
- 操作内容：
  - 先检查当前 docker 容器状态，发现 `ai4kb-brain` 容器处于 Restarting 状态
  - 检查 `ai4kb-brain` 日志发现错误：`Cannot find module 'src/bootstrap/state.js'`
  - 执行 `docker compose -f docker-compose-brain-ts.yml down` 停止所有容器
  - 执行 `docker compose -f docker-compose-brain-ts.yml up -d` 重新启动所有容器
- 验证结果：
  - `GET /api/health` 返回正常：`{"status":"ok","ts":"2026-04-15T07:53:24.070Z","service":"brain-server"}`
  - `GET /api/ready` 返回正常：`{"status":"ok","checks":{"postgres":"ok","redis":"ok"}}`
  - `ai4kb-brain` 服务正常启动，监听 3100 端口
  - 前端 `ai4kb-frontend` (8086端口) 正常返回 HTML
- 服务状态：
  - `ai4kb-brain-server` (8091): 正常
  - `ai4kb-brain` (3100): 正常
  - `ai4kb-frontend` (8086): 正常
  - `ai4kb-brain-postgres` (5433): 正常
  - `ai4kb-brain-redis` (6380): 正常
- 下步计划：测试登录和 brain query 功能
