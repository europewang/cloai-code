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
   - `tool_call_audits`、`rag_query_audits` 已落地，且已补齐管理端查询接口。
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
15. 细分审计管理接口：
   - 已新增 `GET /api/v1/admin/audits/skills`、`GET /api/v1/admin/audits/rag`，支持分页与过滤查询。
   - 治理回归脚本已覆盖两接口可用性验证（`audits_query_skills/audits_query_rag`）。
16. 前端联调可视化：
   - 已启动 `ragflow-frontend` 容器并确认 `http://127.0.0.1:8086` 返回 200，可直接打开测试。
17. 编排收敛（同一网络）：
   - 已将 `frontend` 服务并入 `deploy/docker-compose-brain-ts.yml`，与 `brain-server` 同属 `ai4kb-brain-net`。
   - `frontend` 通过 `BACKEND_URL=http://brain-server:8091` 直接代理 `brain`，前端入口保持 `http://127.0.0.1:8086`。
   - 运行验证：`/api/v1/auth/login`、`/api/v1/admin/users` 通过前端代理访问均返回 200。
18. 前端接口兼容改造（第一批）：
   - 已将前端中“已有后端等价能力”的不兼容接口改为调用 `/api/v1/*`：`auth/login`、`admin/users`、`permissions`。
   - 权限同步已改为前端计算差异后调用 `grant/revoke`（`/api/v1/admin/permissions/datasets`）。
   - 运行验证：前端容器重启后 `login=200`、`admin/users=200`。
19. 测试账号补齐：
   - 已确认可登录：`admin / admin123456`。
   - 已创建可用于前端快捷测试账号：`zhangsan / ChangeMe123!`（角色 `user`）。
20. 前端接口兼容改造（第二批）：
   - `route_samples` 已从旧接口映射到 `GET /api/v1/admin/audits/rag`，并做字段归一化。
   - `skills` 与 `skills audit` 已映射到 `GET /api/v1/admin/audits/skills`，并补筛选项生成逻辑。
   - `super_overview` 已改为基于 `users + permissions` 聚合的简版总览，不依赖旧后端私有接口。
   - `fetchDatasets` 已改为从权限快照反推数据集列表（只读视图）。
   - 验证：前端容器重启后 `login=200`、`audits/skills=200`、`audits/rag=200`、`admin/users=200`。
21. 会话与聊天链路前端适配层（第三批）：
   - 已在 `frontend/server.js` 增加会话适配 API：`/api/user/conversations*`（创建、分页、重命名、删除、消息读写）。
   - 已在 `frontend/server.js` 增加聊天流适配：`/api/v1/agent/chat/stream` -> 调用 `brain` 的 `/api/v1/rag/query` 并转换为 SSE（`event: message` + `[DONE]`）。
   - 关键原则：不大改 `brain-server`，RAG 能力仍由 `brain-server` 转发 RagFlow 返回，前端只做协议适配。
   - 运行验证：会话 CRUD 与消息保存通过；流式事件包含 `event: message` 与 `data: [DONE]`。
22. 前端“无回复”问题定位与修复（zhangsan）：
   - 根因：`zhangsan` 的 `allowedDatasets=[]`，后端对非 `super_admin` 强制要求 `datasetId`，`/api/v1/rag/query` 返回 403。
   - 调整：已移除前端固定文案拦截，改为原样透传 server 返回；仅保留错误转 `message` 的展示兼容。
   - 联调动作：已为 `zhangsan` 授权 `DATASET=public-default`（`brain/context.allowedDatasets` 可见）。
   - 当前状态：`zhangsan` 现可进入后端查询链路，但上游返回 `APIConnectionError('Connection error.')`，问题转为 RagFlow 上游连接稳定性。
23. 会话聊天链路最终对齐（按“server 自主判断”）：
   - 前端适配层已取消 dataset 预判与路由决策，仅透传 query 到 server。
   - `brain-server` 的 `rag/query` 已改为：非 super_admin 在未传 `datasetId` 时由后端自动选取最近授权数据集。
   - 现状验证：前后端都返回 server 实际内容（当前统一为 `APIConnectionError('Connection error.')`），已无前端固定文案拦截。
24. RAG 主链路修正（server -> ragflow）：
   - 已确认 RagFlow 知识库存在，并已把前 3 个 dataset 批量授权给现有 `user` 账号（含 `zhangsan`）。
   - 发现根因：`RAGFLOW_QUERY_PATH` 指向 `chats_openai` 路径时返回 `APIConnectionError`。
   - 已修正为 `RAGFLOW_QUERY_PATH=/api/v1/chats/{chatId}/completions`，并完成前端适配层对 SSE 文本答案的解析。
   - 验证：`server` 端提问“请使用rag的skill，解答什么是半面积”返回 200；前端流式收到 server 返回内容（非固定文案）。
25. RagFlow 聊天清空与重建验证（2026-04-10）：
   - 已通过 MySQL 清空 RagFlow 聊天主表：`rag_flow.dialog`（`696 -> 0`），`/api/v1/chats` 返回 `0`。
   - 已为 `zhangsan` 分配知识库权限（`brain/context.allowedDatasets` 可见 4 个）。
   - `zhangsan` 发起“请调用ragflow技能，问什么是半面积”后，server 返回：`code=102, You don't own the chat 703...`。
   - 结论：当前 `server` 仍依赖固定 `RAGFLOW_CHAT_ID`（`.env.brain`），不会自动为 `zhangsan` 创建 RagFlow chat；因此清空后无法按用户重建会话。
26. 自动建 chat 映射改造（已落地）：
   - `rag/query` 已改为按 `brain user` 在 Redis 维护 `user -> ragflow chatId` 映射（`brain:rag:chat:user:{userId}`）。
   - 当 chat ownership 失配（`You don't own the chat`）时，自动重建 chat 并重试一次。
   - 新建 chat 时优先尝试绑定用户已授权 datasets（逐个尝试有效 dataset，失败再降级空 chat）。
   - 实测：清空 RagFlow chat 后，`zhangsan` 提问可自动创建 `brain_user_49_*` 新 chat，且已绑定知识库 `建筑面积`。
27. Xinference 启动链路修复（2026-04-10）：
   - 根因：`deploy/docker-compose-xinference.yml` 原挂载 `../models:/models` 指向错误目录，导致自定义模型 URI 无效。
   - 已修复：改为 `/home/ubutnu/code/AI4LocalKnowledgeBase/models:/models`。
   - 已执行：`python3 launch_xinference_models.py` 成功启动 3 个模型：`bge-m3`、`bge-reranker-v2-m3`、`deepseek-r1-distill-qwen-14b`。
   - 验证：`GET http://127.0.0.1:8085/v1/models` 返回 `model_count=3` 且三者均在运行。
28. 端到端回归（zhangsan，RAG 真正消费 query）：
   - `POST /api/v1/rag/query` 返回 200，`traceId=4b29cc0a-8720-43b2-937d-3cdf091878a6`。
   - 返回数据中已包含针对“什么是半面积”的中文长答案（含知识库要点，不再是固定欢迎词）。
   - 结论：当前链路已能把用户问题传入 RagFlow 并返回知识库检索结果。
29. 前端“请求完成但无可展示内容”修复：
   - 根因1：`frontend/server.js` 未解析 `rag/query` 的 `data.choices[0].message.content`，导致 `answer` 为空。
   - 根因2：`rag/query` 在 Redis 短暂不可写时抛错（`Stream isn't writeable...`）直接中断。
   - 修复：补 `choices` 路径答案提取；`brain-server` 对 Redis 映射读写改为“失败降级不阻断查询链路”。
   - 验证：前端流式返回已展示“半面积计算”长答案，不再出现“暂未返回可展示内容”。
30. 引用/定位与流式输出增强（2026-04-10）：
   - 前端代理层已改为分片 SSE 输出（多 `event: message`），由“单条回包伪流式”升级为“增量展示”。
   - `frontend/server.js` 已透传 `raw` payload，并扩展 `references/reference` 多路径提取。
   - `App.jsx` 已扩展 `normalizeRefs`，支持从 `payload/raw` 的 `references/reference` 及 `choices[0].message.reference` 提取引用。
   - 实测：`message_events=8`（已流式）；当前该问题场景下 RagFlow 返回 `references=[]`，故 UI 可展示答案但无原文定位条目。
31. Skill/ToolCall 链路打通并返回引用（2026-04-10）：
   - 根因：`brain-server` 容器内默认 `RAGFLOW_BACKEND_BASE_URL=127.0.0.1:8083` 不可达，导致未走 toolcall 流路，回退到无引用路径。
   - 修复：`.env.brain` 增加 `RAGFLOW_BACKEND_BASE_URL=http://host.docker.internal:8083`；`brain-server` 登录时缓存后端 token，`rag/query` 优先走 `/api/v1/agent/chat/stream` 并提取 `reference`。
   - 验证：`rag/query` 返回 200 且 `has_refs=True`；前端流式 `contains_ref=True`、`message_events=13`，可见引用条目与原文片段。
32. 可点击引用修复（中文引用标记）：
   - 根因：前端只识别 `[ID:0]/[0]`，而模型输出常为 `[引用来源1]`，导致行内引用不可点击。
   - 修复：`App.jsx` 的 `MarkdownWithCitations` 增加对 `[引用来源N]/[来源N]` 的识别并映射到 citation 锚点。
   - 验证：流式文本含 `[引用来源1]` 且 `references` 同时存在，行内引用可点击打开 `SourceViewer`（支持原文、图片、定位）。
33. “你好无内容 + 引用资源404”补充修复：
   - 根因1：`brain-server` 的 skill 流聚合仅消费 `event: message`，`event: token` 被忽略，导致短问候出现空答案。
   - 根因2：`SourceViewer` 依赖的 `/api/document/get|image` 路由在 `brain-server` 缺失，点击引用后 404。
   - 修复：`queryRagByBackendSkillStream` 增加 `token` 事件聚合；新增 `brain` 文档与图片透传路由并复用用户后端 token。
   - 验证：`你好` 已返回正文（不再“暂未返回”）；`/api/document/get/{id}` 与 `/api/document/image/{id}` 均 200。
34. 真流式链路改造与量化验证：
   - 问题确认：旧链路先走 `/api/v1/rag/query` JSON 再二次封装 SSE，TTFB 约 70s 且首批分片同一时刻到达（伪流式）。
   - 改造：新增 `brain-server /api/v1/rag/query/stream`，直接透传 ragflow-backend SSE；`frontend /agent/chat/stream` 改为直连该流式接口，不再等待完整 JSON。
   - 实测（逐行时间戳）：`event:analysis_plan` 在 ~15.8s 到达，随后 `event:token` 连续到达并增量输出，确认前后端均已开启真实流式。
35. 架构回归（去除 ragflow-backend 依赖）：
   - 现状实现：`brain-server` 直接调用 `ragflow-server(8084)`，不再依赖 `ragflow-backend(8083)`。
   - 技术实现：
     - `rag/query/stream` 直连 `/api/v1/chats_openai/{chatId}/chat/completions`（`stream=true`）。
     - 通过 `extra_body.reference=true` 强制返回引用；流中将 OpenAI delta 转换为前端可消费的 `event: token/message`。
     - 文档与图片透传改为直连 `/v1/document/get/{id}` 与 `/v1/document/image/{id}`（API key 鉴权）。
   - Docker 验证：在 `ragflow-backend` 停止状态下，流式正常（TTFB≈1.8s，`token_events=68`），`rag/query` 引用数 6，文档/图片透传均 200。
   - 架构备注：该实现仅证明“辅助编排可独立工作”，不代表主决策大脑迁移；主大脑仍定义为 `src/`。
36. 模型运行策略调整（2026-04-11）：
   - 按要求改为“xinference 仅两小模型 + Ollama 大模型”：
     - 保留 `bge-m3`、`bge-reranker-v2-m3`
     - 禁用/移除 `deepseek-r1-distill-qwen-14b*`
   - `launch_xinference_models.py` 已去除 deepseek LLM 注册与启动逻辑。
   - `deploy/docker-compose-ragflow.yml` 的 `backend` LLM 默认改为 `http://host.docker.internal:11434/v1` + `qwen3.5:9b`。
   - 实测：`ollama ps` 为 `qwen3.5:9b, PROCESSOR=100% GPU`；`src` 命令行返回 `SRC_OLLAMA_OK`。
37. RagFlow compose 清理（2026-04-11）：
   - 按要求移除 `deploy/docker-compose-ragflow.yml` 中 `backend` 服务定义，避免与本项目主链路混淆。
   - 同步删除同文件 `frontend.depends_on: backend`。
   - 运行态已清理 `ragflow-backend` 容器，`docker compose config` 校验通过。
38. RagFlow 对接 Ollama 连接修复（2026-04-11）：
   - 现象：`Cannot connect to host ollama:11434`（LiteLLM/Ollama 连接失败）。
   - 根因：`ragflow` 容器内无法解析 `host.docker.internal`，且模型名误写为 `qwen3.5-9b`。
   - 修复：`ragflow` 服务新增 `extra_hosts: host.docker.internal:host-gateway`；模型名统一为 `qwen3.5:9b`。
   - 验证：容器内 `curl http://host.docker.internal:11434/api/tags` 成功返回模型列表。
39. brain-server 前后置拆分改造（2026-04-11）：
   - 新增前置路由文件：`brain-server/src/routes/preServer.ts`，承载 `/api/v1/pre/context` 与 `/api/v1/brain/context`。
   - 新增后置路由文件：`brain-server/src/routes/postServer.ts`，承载 `/api/v1/post/toolcall/authorize`。
   - `server.ts` 改为注册前后置路由模块，不再内联上述接口实现。
   - `src` 接入后置鉴权：`SkillTool.checkPermissions` 与用户 `/skill` 流程新增 brain 前后置策略检查（可通过环境变量启用）。
   - 验证：brain build 成功；`/api/v1/pre/context` 返回策略上下文；`/api/v1/post/toolcall/authorize` 对无权限 skill 返回 403；`src` 基础对话仍可用。
40. skills 运行器契约统一（2026-04-11）：
   - `skills/rag_query/run_skill.py`：
     - 支持位置参数与命名参数两种 query 输入形式；
     - 支持 `BRAIN_SERVER_*` 环境变量注入；
     - 新增 `--skill-id`、`--allow-upstream-error`；
     - 输出统一 JSON 包装：`ok/skill/traceId/chatId/answer/referenceCount/references/raw`。
   - `skills/cad_text_extractor/run_skill.py`：
     - 支持位置参数与命名参数混用；
     - 输出统一 JSON 汇总：`outputFileCount/jsonCount/dxfCount/excelCount/outputFiles`。
   - 实测通过：
     - RAG skill 可返回结构化 JSON；
     - CAD skill 在样例目录输出 3 个产物（json/dxf/xlsx）。
41. 端到端流程联测（多用户）（2026-04-12）：
   - 测试场景：
     - `zhangsan` 调用 RAG skill 提问“什么是半面积”；
     - `lisi` 调用同一 RAG skill（应被拒绝）；
     - `zhangsan` 调用 CAD skill，上传 dxf 输入文件并回收产物；
     - `lisi` 使用他人上传文件调用 CAD（应被拒绝）。
   - 结果：
     - `POST /api/v1/rag/query` + `skillId=rag-query`：`zhangsan` 200，`lisi` 403（`skill permission denied`）。
     - `POST /api/v1/files/upload` + `POST /api/v1/skills/indicator-verification/run`：`zhangsan` 成功产出 3 文件；`lisi` 403（`forbidden file access`）。
     - `src` 侧通过 prompt 强制调用 `indicator-verification` 后，成功在 `/tmp/cad_skill_from_src` 落地产物并返回文件列表。
42. 前端适配层改造（2026-04-12）：
   - `frontend/server.js` 新增 `/api/v1/agent/tool/*` 兼容实现：
     - `catalog`（返回 rag-query 与 indicator-verification）
     - `draft`（生成工具草稿）
     - `upload`（透传到 `/api/v1/files/upload` 并绑定草稿）
     - `approve`（SSE 返回 tool_result/message；后端执行 RAG/CAD）
   - `agent/chat/stream` 增加技能意图适配：
     - 命中 RAG 关键词时自动携带 `skillId=rag-query`
     - 命中 CAD 关键词时先返回 `tool_draft`，引导上传文件
   - 容器联调结果（`http://127.0.0.1:8086`）：
     - `zhangsan`：RAG approve 返回引用，CAD approve 返回 3 个输出文件下载链接；
     - `lisi`：RAG approve 返回 `event:error skill permission denied`；
     - 聊天输入“调用cad text extractor的skill”可触发 `tool_draft` 事件。
43. 多用户记忆改造（2026-04-12）：
   - `brain-server` 新增记忆接口：
     - `GET /api/v1/memory/profiles`
     - `GET /api/v1/memory/current`
     - `PUT /api/v1/memory/current`
   - 记忆按 `memory_profile` 隔离落盘（`memory-profiles/<storageRoot>/MEMORY.md`），并加入读写审计。
   - `src` 每轮组装 system prompt 时自动拉取当前用户记忆并注入（支持 `BRAIN_MEMORY_PROFILE_ID` 切换）。
   - 前端新增“记忆管理”页签，支持：
     - 查看可用 profile；
     - 切换并编辑当前 profile 记忆；
     - 聊天请求携带 `memoryProfileId`。
   - 验证：
     - `zhangsan` 写入 `profile-49` 后可读回；
     - `lisi` 读取 `profile-49` 返回 403；
     - `src` 在不同 token/profile 下回答分别命中各自记忆文本。
44. Brain Service Docker 部署修复（2026-04-16）：
  - 问题：
    - Skills 目录未挂载到容器
    - 缺少 `.claude/skills` 符号链接
    - `CLAUDE_CODE_SIMPLE=1` 导致 bare mode 禁用 skills 发现
    - API provider fallback 问题导致 Ollama 调用失败
    - Skill 名称匹配问题（`rag_query` vs `rag-query`）
    - Python `requests` 模块缺失
  - 修复：
    - `docker-compose-brain-ts.yml`：添加 `volumes: ../skills:/opt/skills:ro`，设置 `CLAUDE_CODE_SIMPLE=0`
    - `Dockerfile-brain`：创建 `.claude/skills` 符号链接，安装 `requests` 模块
    - `brainService.ts`：修复 skill 名称匹配逻辑，支持下划线/连字符互换
    - `claude.ts`：修复 `compatProvider` fallback 逻辑
  - 验证：
    - `POST /api/v1/brain/query` 调用 RAG skill 返回知识库内容
    - 回答正确使用《武汉市建设工程建筑面积计算规则》内容

45. Brain-server 无法连接 Brain 服务（2026-04-16）：
  - 问题：brain-server 调用 brain 服务时报 `ConnectionRefused: http://brain:3100/api/query`
  - 原因：brain 使用 `network_mode: host`，Docker 网络中无法解析 `brain:3100`
  - 修复：`brain-server/src/server.ts` 中改为 `http://host.docker.internal:3100/api/query`
  - 验证：重启服务后 RAG query 正常返回知识库内容

46. Brain Service 流式输出架构（2026-04-16）：
  - 问题：
    - 用户通过前端发送"RAG skill"指令时，skill 执行结果被 src 大脑的 LLM 截断
    - 前端无法感知 skill 执行过程，只能看到 LLM 的默认回答
  - 根本原因：
    - `handleBrainQuery` 是同步阻塞模式，将所有结果聚合成 JSON 后返回
  - 修复方案：
    - 新增 `handleBrainQueryStream` + `processQueryThroughBrainStream` + `runSingleTurnStream` 流式处理链
    - SSE 事件类型：`chunk`（模型输出）、`skill_start/skill_end`（skill 生命周期）、`rag_content`（RAG 引用）、`done`（完成）
    - RAG 执行完成后追加用户消息触发 LLM 总结，实现"流式 RAG -> LLM 总结"完整链路
  - 涉及文件：
    - `src/services/brainOrchestration/brainService.ts`：新增 SSE 流式端点 `POST /api/query`
  - 验证方式：
    - 登录 `superadmin`，发送"请调用rag skill，什么是半面积"
    - 观察 SSE 流是否包含 RAG 原始回答而非截断内容

47. RAG Skill 流式输出优化（2026-04-17）：
  - 问题：
    - RAG skill 返回的 SSE 事件出现重复（`event: message` 和 `event: rag_content` 各发送两次）
    - LLM 总结出现重复（同一个回答发送两次）
    - `rag_content` 事件中的 references 为空
  - 修复：
    - 修复 `brainService.ts` 中 `rag_content` 事件不再重复发送 `message` 事件
    - 简化 `processQueryThroughBrainStream` 循环逻辑，RAG 完成后直接退出
    - 修复 `skills/rag_query/SKILL.md` 中的路径（`/home/ubutnu/code/cloai-code` -> `/app`）
    - 修改 `skills/rag_query/run_skill.py` 使用非流式端点获取完整引用
  - 验证：
    - SSE 事件统计：`event: message=1, event: rag_content=1, event: skill_end=1, event: skill_start=1`（无重复）
    - RAG 查询返回 6 个引用，完整展示在 `rag_content` 事件中

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
2. 已落地历史 missing 文件处置第五版（自动标记失效 + 业务侧拒绝读取 + 管理端查询/单条更新/批量更新/CSV导出 + 最小自动化回归脚本 + 维护容器周期化 smoke）。
3. 继续扩展 `test/run_governance_e2e.py`（新增 user/admin 边界与 rag/query 权限分支用例）。

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

## 8. 前后端对照差距（后续工作清单）

### 8.1 前端需要但后端尚未实现（或协议不兼容）

1. 鉴权路径不兼容：
   - 前端当前调用：`/api/user/auth/login`
   - 后端当前提供：`/api/v1/auth/login`
2. 权限管理旧协议不兼容：
   - 前端当前调用：`/api/admin/permission/{username}`、`/api/admin/permission/sync`
   - 后端当前提供：`/api/v1/admin/users/{id}/permissions`、`/api/v1/admin/permissions/datasets`
3. 用户管理旧协议不兼容：
   - 前端当前调用：`/api/admin/users/admin`、`/api/admin/users/normal`、`/api/admin/users/{id}/promote-admin`
   - 后端当前提供：`/api/v1/admin/users`、`/api/v1/admin/users/{id}`（PATCH）
4. 数据集管理接口缺失：
   - 前端依赖：`/api/admin/datasets*`、`/api/admin/datasets/{id}/documents*`
   - 后端当前未提供同名数据集 CRUD/文档管理接口。
5. 会话与智能体接口缺失：
   - 前端依赖：`/api/user/conversations*`、`/api/v1/agent/chat/stream`、`/api/v1/agent/tool/*`
   - 后端当前未提供对应会话与 agent 工具编排接口。
6. 技能注册管理接口缺失：
   - 前端依赖：`/api/admin/skills/register`、`/api/admin/skills/audit/options`、`/api/admin/skills/*`
   - 后端当前仅提供 `indicator-verification` 执行与审计查询，不含技能注册中心 API。
7. 路由样本统计接口缺失：
   - 前端依赖：`/api/admin/route-samples/options`
   - 后端当前未提供路由样本聚合接口。

### 8.2 后端已实现（或规划）但前端尚未展示

1. 权限细分能力未完整展示：
   - 后端已支持：`DATASET_OWNER`、`MEMORY_PROFILE` 授权与 `brain/context` 字段。
   - 前端“权限分配”页面目前只围绕 dataset 维度，不含 owner/profile 可视操作。
2. 文件治理管理能力未展示：
   - 后端已支持：`admin/files` 查询、单条状态更新、批量更新、CSV 导出。
   - 前端尚无对应资产治理页面与导出入口。
3. 细分审计查询未对齐：
   - 后端已支持：`/api/v1/admin/audits/skills`、`/api/v1/admin/audits/rag`。
   - 前端当前“审计查询”页仍基于旧接口语义，未切到新审计维度。
4. 检索代理能力未直连：
   - 后端已支持：`/api/v1/rag/query`（含权限与审计）。
   - 前端聊天链路仍依赖旧 `agent/chat/stream` 协议。
5. 运维可观测能力未展示：
   - 后端已支持：`/api/v1/integrations/ragflow/health`、`policyVersion` 缓存失效策略。
   - 前端暂无健康状态、策略版本、缓存刷新状态可视化。

### 8.3 大出入项（需先评估再开发）

1. 前端聊天与会话体系（`/user/conversations*`、`/v1/agent/chat/stream`）与后端当前治理 API 差异较大，需先确定“保留旧协议 + 适配层”还是“前端改为直接消费 `/api/v1/rag/query` + 新会话 API”。
2. 数据集/文档管理页对 RagFlow 旧管理接口依赖较重，需先明确后端是否承接完整数据集管理职责，或仅保留治理与权限职责。
3. 技能管理页依赖“注册/上下线/审计筛选项”旧接口，需先评估后端技能注册中心边界（本地 skills 目录驱动 vs 数据库注册驱动）。
