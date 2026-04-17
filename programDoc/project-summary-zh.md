# cloai-code 项目简要总结

## 1. 项目定位

`cloai-code` 是一个以 Bun/TypeScript 为基础的 CLI 代码助手，核心形态是“终端交互式 Agent + 工具执行引擎 + 命令系统 + MCP 扩展能力”。  
它在上游基础上强化了多 Provider 接入、技能系统、插件与远程控制能力。

## 2. 总体架构（一句话）

从 `bootstrap-entry.ts` 进入，`entrypoints/cli.tsx` 做启动分流，`main.tsx` 完成初始化与运行态装配，`screens/REPL.tsx` 承担交互循环，`query.ts` 驱动模型推理与工具调用，`tools.ts` 和 `commands.ts` 提供可用能力池，`skills/loadSkillsDir.ts` 动态加载技能，`state/AppStateStore.ts` 维护全局状态。

## 3. 核心模块分层

- `src/entrypoints/*`：启动入口与模式分流（CLI、MCP、init）。
- `src/main.tsx`：应用装配层（配置、策略、命令/工具/插件/MCP 集合、REPL 启动）。
- `src/screens/REPL.tsx`：交互 UI 与会话编排层（输入、消息、任务、权限弹窗、状态展示）。
- `src/query.ts`：模型请求与工具编排引擎（流式输出、压缩、恢复、工具执行）。
- `src/tools/*` + `src/tools.ts`：工具定义与聚合（Bash/Read/Edit/Grep/Web 等）。
- `src/commands/*` + `src/commands.ts`：Slash 命令系统（内置命令 + 技能命令 + 插件命令）。
- `src/skills/*`：技能加载、条件激活、动态发现（包含 legacy commands 兼容）。
- `src/services/*`：横切服务（analytics、api、mcp、compact、lsp、policyLimits 等）。
- `src/state/*`：全局应用状态与 store。
- `src/utils/*`：基础设施与公共能力（权限、model、session、hooks、git、settings）。

## 4. 关键方法（高频）

- `main()`（`entrypoints/cli.tsx`）：启动参数快速分流，按需动态 import，最后进入 `main.tsx`。
- `init()`（`entrypoints/init.ts`）：配置系统与环境初始化、遥测初始化准备、清理注册。
- `getCommands()`（`commands.ts`）：聚合内置/插件/技能/工作流命令并做可用性过滤。
- `getSkillDirCommands()`（`skills/loadSkillsDir.ts`）：从多来源加载并去重技能，处理条件技能。
- `getTools()`（`tools.ts`）：按权限和运行模式产出最终工具集合。
- `processUserInput()`（`utils/processUserInput/processUserInput.ts`）：把输入分流到普通 prompt、slash、bash。
- `query()`（`query.ts`）：执行主推理循环，处理工具调用、上下文压缩、错误恢复。
- `getSystemContext()/getUserContext()`（`context.ts`）：拼接系统上下文与用户上下文。
- `startMCPServer()`（`entrypoints/mcp.ts`）：以 MCP 标准暴露本地工具能力。
- `getDefaultAppState()`（`state/AppStateStore.ts`）：构造全局默认状态。

## 5. 模块关联（主链路）

1. CLI 启动：`bootstrap-entry.ts` -> `entrypoints/cli.tsx` -> `main.tsx`
2. 初始化：`main.tsx` -> `entrypoints/init.ts` + settings/policy/telemetry
3. 命令工具装配：`main.tsx` -> `commands.ts` + `tools.ts` + `skills/loadSkillsDir.ts`
4. 进入交互：`main.tsx` -> `screens/REPL.tsx`
5. 处理输入：`REPL.tsx` -> `processUserInput()` -> slash/bash/prompt 分支
6. 模型与工具执行：`REPL.tsx` -> `query()` -> `runTools()` -> 具体 Tool
7. 状态回写：工具/查询结果 -> `AppState`/消息流 -> REPL 渲染

## 6. 你可以怎么读这个项目

- 先读入口：`bootstrap-entry.ts`、`entrypoints/cli.tsx`、`main.tsx`
- 再读主循环：`screens/REPL.tsx`、`utils/processUserInput/*`、`query.ts`
- 再读能力层：`tools.ts`、`commands.ts`、`skills/loadSkillsDir.ts`
- 最后读横切能力：`services/*`（mcp、compact、analytics、api）与 `state/*`

## 7. 统一治理后端补充（2026-04-09）

当前仓库在原有 CLI 主链路之外，新增了治理后端子工程 `brain-server/`，用于承接**辅助编排能力**（权限、网关、治理）；主决策大脑仍为 `src/`：

1. 服务形态：Fastify + TypeScript + Prisma + PostgreSQL + Redis。
2. 已落地能力：
   - 健康检查：`/api/health`、`/api/ready`
   - 鉴权：`/api/v1/auth/login`、`/api/v1/auth/refresh`、`/api/v1/auth/me`
   - 用户管理：`/api/v1/admin/users`（创建/更新）
  - 权限治理：`/api/v1/admin/permissions/datasets`、`/api/v1/admin/permissions/dataset-owners`、`/api/v1/admin/permissions/skills`、`/api/v1/admin/permissions/memory-profiles`
  - 上下文下发：`/api/v1/brain/context`（含 `allowedDatasets/allowedDatasetOwners/allowedSkills/allowedMemoryProfiles`）
   - 记忆映射：`memory_profiles` 已落库，`profileId` 由真实映射驱动
   - 审计查询：`/api/v1/admin/audits`，写操作已接入 `audit_logs`
   - RagFlow 联通探测：`/api/v1/integrations/ragflow/health`
   - 文件网关：`files/upload`、`files/{id}/download`、`skills/indicator-verification/run`，元数据已落库到 `file_assets`
   - 文件存储：支持 `local/s3` 双后端，已验证 MinIO（复用 RagFlow MinIO）
   - 文件哈希：`upload` 返回 `sha256Hex`，`file_assets` 已存储哈希字段
   - 运维脚本：已补 `backfill-file-sha256` 与 `maintenance-tick`
   - 迁移脚本：已补 `migrate-local-assets-to-s3`，用于历史 local 路径存量迁移
3. 当前约束：
   - `admin` 仅可管理“自己 + 直属 user”。
   - 资源授权默认拒绝，需显式授予。
4. 运行方式：`deploy/docker-compose-brain-ts.yml` 可直接拉起 `brain-server + postgres + redis`。
5. 技能封装补充：`skills/cad_text_extractor` 已补充 `SKILL.md` 与 `run_skill.py`，可作为后续治理接入样例。
6. 当前测试结论：
   - RagFlow：联通可用，`POST /api/v1/rag/query` 已能返回“什么是半面积”的真实知识库答案（通过 `chats_openai` 路径）。
   - 指标校核技能：通过“上传文件 -> 运行技能 -> 下载结果”链路验证成功，可产出 JSON/DXF/Excel 三类结果。
   - 部署约束：已按“仅启动本项目 brain + ragflow”执行，无关容器保持未启动。
   - 对象清理：`ops:cleanup-s3-orphans` 脚本可扫描并清理无引用对象（当前扫描 6，删除 0）。
   - 哈希回填：历史记录回填脚本可执行，当前识别出 4 条 local 路径记录并安全跳过（s3 模式）。
   - 存量迁移：local 路径迁移脚本可执行，当前识别 4 条历史记录已缺失文件（missing=4）。
   - 缺失治理：`file_assets` 已新增状态字段，迁移脚本会自动将缺失文件标记为 `missing`，下载与技能运行会返回 410 防止继续消费脏记录。
   - 管理闭环：已新增 `GET /api/v1/admin/files` 与 `POST /api/v1/admin/files/{fileId}/status`，支持管理侧筛选缺失资产并手动回切状态（回切前校验存储可读）。
   - 批量与导出：已新增 `POST /api/v1/admin/files/status/batch` 与 `GET /api/v1/admin/files/export`，支持批量状态维护与 missing 资产 CSV 导出。
   - 回归脚本：已新增 `ops:smoke-admin-file-status`，可一键冒烟验证“查询/单条更新/批量更新/导出”四类接口。
   - 定时回归：`brain-maintenance` 已接入“`maintenance-tick` 后自动 smoke”流程，支持 `MAINTENANCE_ENABLE_SMOKE/MAINTENANCE_INTERVAL_SECONDS` 配置并输出 `[ALERT]` 日志。
   - 前因后果：该自动链路用于“文件型技能治理”业务线（上传/下载/指标校核），目的是把数据维护与业务可用性校验组合执行，避免“脚本跑完但接口已不可用”。
   - 暂缓项：webhook 主动通知能力已按 `IGNORED_TODO` 暂缓，当前保持日志告警模式，后续有时间再启用。
  - 权限扩展：已新增 `POST /api/v1/admin/permissions/memory-profiles` 与 `POST /api/v1/admin/permissions/dataset-owners`，`brain/context` 已返回 `allowedMemoryProfiles/allowedDatasetOwners`。
  - DATASET_OWNER 回归：已完成 `grant -> context 命中 -> revoke -> context 移除` 端到端验证。
  - 回归脚本：`ops:smoke-admin-file-status` 最新执行通过（五项接口均 200）。
  - 运行注意：Docker 重建仍可能受 `pip` 外网不可达影响（`ezdxf`），当前可用“本地编译后同步 `dist` 到容器并重启”作为临时验证路径。
  - 测试目录：已新增 `brain-server/test/run_governance_e2e.py`，并提供 `test:e2e-governance`、`test:e2e-all` 脚本。
  - 全量复测：已按“`bun run build` + `docker cp dist` + 重启容器”路径重跑测试，治理回归与文件治理回归均通过。
  - 缓存失效：`policyVersion` 已改为 Redis 版本号，授权/用户变更后自动递增，治理回归已验证变更前后版本不同。
  - 细分审计：已落地 `tool_call_audits` 与 `rag_query_audits`，并接入 `indicator-verification` 与 `rag/query` 写入链路，数据库计数已验证有数据写入。
  - 审计查询：已新增 `GET /api/v1/admin/audits/skills` 与 `GET /api/v1/admin/audits/rag`（分页+过滤）。
  - 前端联调：`ragflow-frontend` 已确认可访问（`http://127.0.0.1:8086`，HTTP 200）。
  - 编排统一：已将前端服务纳入 `deploy/docker-compose-brain-ts.yml`，与 `brain-server` 置于同一 Docker 网络并直连代理。
  - 前端兼容：已完成第一批前端接口兼容改造（登录/用户/权限同步），不改动后端主逻辑即可对接 `brain`。
  - 测试账号：已补齐并验证可登录账号 `admin/admin123456`、`zhangsan/ChangeMe123!`。
  - 前端第二批兼容：`route_samples`、`skills audit`、`super_overview`、`datasets(只读)` 已改为消费 `brain` 现有 API。
  - 会话聊天适配：已在前端代理层补 `/api/user/conversations*` 与 `/api/v1/agent/chat/stream` 兼容，实现“不改后端主逻辑”的联调闭环。
  - RAG 链路保持：聊天回答仍来自 `brain-server -> ragflow`，前端仅做流式协议转换，不改 RAG 业务语义。
  - 无回复修复：针对 `zhangsan` 无 dataset 权限导致的 403，前端适配层改为“自动探测 datasetId + 友好提示 message 事件”，避免前端看起来无响应。
  - 架构回调：按“server 自主判断”要求已取消前端 dataset 预判，改由 `brain-server` 在 `rag/query` 内自动选择授权数据集；前端仅透传请求与展示 server 原始返回。
  - 路径修正：`RAGFLOW_QUERY_PATH` 已切换到 `/api/v1/chats/{chatId}/completions`（替代 `chats_openai`），恢复可用答复链路。
  - 权限分配：已将 RagFlow 现有知识库（前 3 个 dataset）授权给现有 `user` 账号，`zhangsan` 已具备可检索数据集。
  - 结果状态：前端流式现已展示 server 返回内容，不再出现固定文案拦截。
  - 关键发现：清空 RagFlow 聊天后，`server` 使用固定 `RAGFLOW_CHAT_ID` 调用会报 `You don't own the chat`，说明当前尚未实现“按用户自动创建/绑定 RagFlow chat”。
  - 已修复：`rag/query` 改为按用户自动创建/复用 RagFlow chat（Redis 映射），并在 ownership 失配时自动重建；新 chat 优先绑定已授权知识库。
  - Xinference 启动修复：已修正 `docker-compose-xinference.yml` 的 `models` 挂载路径并成功执行 `launch_xinference_models.py`，三模型（embedding/rerank/LLM）均启动成功。
  - 回归结果：`zhangsan` 提问“请调用ragflow技能，问什么是半面积”时，`rag/query` 返回知识库相关中文答案，确认 query 已真实传入 RagFlow。
  - UI 空白修复：已修复流式答案提取字段与 Redis 短暂不可写降级，前端不再出现“请求已完成，暂未返回可展示内容”。
  - 流式增强：前端代理层已输出多段 SSE token；并支持从 `raw/references/reference` 多路径提取引用数据。
  - 现状说明：已移除 `brain -> ragflow-backend` 依赖，当前链路为 `frontend -> brain-server -> ragflow-server`，可提供流式、引用、文档/图片透传。
  - 架构偏差：该链路仍未经过 `src` 大脑语义路由，不等同于最终目标（`src` 决策 -> skill/toolcall -> brain-server 辅助编排 -> ragflow）。
  - 现状验证：在 `ragflow-backend` 停止状态下，流式仍可返回（`token_events=68`），`rag/query` 返回 6 条引用，`/api/document/get|image` 均 200。
  - 模型策略更新：已切换为“xinference 仅 embedding/rerank + Ollama `qwen3.5:9b` 作为 LLM”，并验证 `src` 可正常对话返回。
  - Compose 清理：`deploy/docker-compose-ragflow.yml` 已移除 `backend` 服务，避免引入与本项目无关的旧链路。
  - RagFlow↔Ollama 联通修复：`ragflow` 服务已加入 `host.docker.internal` 映射并验证可访问 `11434`；模型名规范为 `qwen3.5:9b`（非 `qwen3.5-9b`）。
  - 前后置拆分：`brain-server` 已按架构拆分前置/后置路由文件，`src` 在 skill 调度前后接入 brain 策略校验入口。
  - skills 契约统一：`rag_query` 与 `cad_text_extractor` 的 `run_skill.py` 已统一为“参数兼容 + JSON 结构化输出”模式，匹配当前项目技能调用方式。
  - 多用户联测完成：RAG 与 CAD 两条 skill 链路均验证了“有权放行、无权拒绝”；CAD 文件上传/产物下载全流程可用。
  - 前端已对接：新增 `agent/tool` 适配链路，支持在 UI 中完成“草稿 -> 上传文件 -> 审批执行 -> SSE 展示结果”。
  - 用户记忆已打通：每用户独立 profile 记忆可在前端编辑，`src` 会在每轮问答自动加载当前用户记忆参与决策。

## 9. 功能与测试代码对照（回顾用）

1. 鉴权功能：
   - 实现代码：`brain-server/src/server.ts`
   - 测试代码：`brain-server/test/run_governance_e2e.py`（`auth_login/auth_refresh/auth_me`）
2. 权限功能（四类资源）：
   - 实现代码：`brain-server/src/server.ts`
   - 测试代码：`brain-server/test/run_governance_e2e.py`（`perm_dataset/perm_dataset_owner/perm_skill/perm_memory_profile`）
3. 上下文功能：
   - 实现代码：`brain-server/src/server.ts` 的 `GET /api/v1/brain/context`
   - 测试代码：`brain-server/test/run_governance_e2e.py`（`brain_context_after_grant/revoke`）
4. 审计查询功能：
   - 实现代码：`brain-server/src/server.ts` 的 `GET /api/v1/admin/audits`
   - 测试代码：`brain-server/test/run_governance_e2e.py`（`audits_query_dataset_owner`）
5. 文件治理功能：
   - 实现代码：`brain-server/src/server.ts` + `brain-server/src/scripts/smokeAdminFileStatusApis.ts`
   - 测试代码：`ops:smoke-admin-file-status`
6. 策略版本失效功能：
   - 实现代码：`brain-server/src/server.ts`（Redis `policyVersion` 读写与 bump）
   - 测试代码：`brain-server/test/run_governance_e2e.py`（`brain_context_before_mutation/after_grant/after_revoke`）
7. 细分审计功能：
   - 实现代码：`brain-server/prisma/schema.prisma` + `brain-server/src/server.ts`
   - 测试代码：`brain-server/test/run_governance_e2e.py`（触发 + `audits_query_skills/audits_query_rag`）+ `psql count`（落库验证）

## 10. 前后端缺口清单（后续开展）

1. 前端依赖但后端缺失/不兼容：
   - `auth`、`permission`、`users` 仍有旧路径协议差异（`/api/user/*`、`/api/admin/permission*`、`/api/admin/users/admin|normal|promote-admin`）。
   - `datasets/documents`、`conversations`、`agent/chat/stream`、`agent/tool/*`、`admin/skills/*`、`admin/route-samples*` 等接口在 `brain-server` 尚未完整提供。
2. 后端已具备但前端未展示：
   - `DATASET_OWNER`、`MEMORY_PROFILE` 授权 UI 缺失。
   - `admin/files`（查询/单条/批量/导出）治理页面缺失。
   - `admin/audits/skills`、`admin/audits/rag` 新审计视图未接入。
3. 需先评估的大出入：
   - 聊天会话协议是否沿用旧 `agent` 体系（适配层）或切换到 `rag/query + 新会话 API`。
   - 数据集/文档管理是否由 `brain-server` 完整承接，或继续由 RagFlow 旧后端承接。
   - 技能管理采用“目录驱动”还是“注册中心驱动”作为主模式。

## 8. 技能挂载机制说明

1. Trae 对话技能（Agent 自身技能）：
   - 挂载位置：`.trae/skills/<skill-name>/SKILL.md`
   - 作用：控制 Agent 在对话里何时调用、怎么执行流程规范。
2. 项目运行时技能（业务技能）：
   - 挂载位置：`skills/<skill-name>/`
   - 典型结构：`SKILL.md`（说明） + 可执行脚本（如 `run_skill.py`）
   - 作用：被业务后端（如 `brain-server`）调用，执行真实任务并返回结果文件。
3. 当前已接入样例：
   - `indicator-verification`（原 `cad_text_extractor`）已通过文件网关接入并完成实测。
   - `rag-query` 已作为运行时技能封装完成，可直接调用治理后端 `rag/query` 并返回结构化结果。
- Brain Service 流式输出架构修复（2026-04-16）：
    - 问题：用户通过前端发送"RAG skill"指令时，skill 执行结果被 src 大脑的 LLM 截断并以默认回答输出，而不是直接流式返回 RAG 原始结果。
    - 根本原因：`brainService.ts` 的 `handleBrainQuery` 是同步阻塞模式，将所有查询结果聚合成 JSON 后返回，前端无法感知中间 skill 执行过程。
    - 解决方案：新增 `handleBrainQueryStream` + `processQueryThroughBrainStream` + `runSingleTurnStream` 流式处理链，支持 SSE 实时推送：
      - `chunk`：模型 token 流式输出
      - `skill_start/skill_end`：skill 调用开始/结束通知
      - `structured_result`：RAG 结构化引用数据
      - `done`：最终回答完成
    - 技术实现：
      - `brainService.ts` 新增 `/api/query` SSE 端点，将 query() 循环中的每个事件实时 yield
      - RAG 执行完成后，追加用户消息触发 LLM 总结，实现"流式 RAG -> LLM 总结"完整链路
      - `brain-server` 的 `/api/v1/brain/query` 已支持透传 SSE 流（原有 pipe 逻辑复用）
    - 验证方式：前端登录 `superadmin`，发送"请调用rag skill，什么是半面积"，观察 SSE 流是否包含 RAG 原始回答而非截断内容
- Brain-server 无法连接 Brain 服务修复（2026-04-16）：
    - 问题：brain-server 调用 brain 服务时报 `ConnectionRefused: http://brain:3100/api/query`
    - 原因：brain 使用 `network_mode: host`，Docker 网络中无法解析 `brain:3100`
    - 修复：`brain-server/src/server.ts` 中改为 `http://host.docker.internal:3100/api/query`
    - 验证：RAG query 正常返回知识库内容（CAD 半面积定义）
