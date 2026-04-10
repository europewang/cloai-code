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

当前仓库在原有 CLI 主链路之外，新增了治理后端子工程 `brain-server/`，用于承接统一治理能力：

1. 服务形态：Fastify + TypeScript + Prisma + PostgreSQL + Redis。
2. 已落地能力：
   - 健康检查：`/api/health`、`/api/ready`
   - 鉴权：`/api/v1/auth/login`、`/api/v1/auth/refresh`、`/api/v1/auth/me`
   - 用户管理：`/api/v1/admin/users`（创建/更新）
   - 权限治理：`/api/v1/admin/permissions/datasets`、`/api/v1/admin/permissions/skills`
   - 上下文下发：`/api/v1/brain/context`
   - 记忆映射：`memory_profiles` 已落库，`profileId` 由真实映射驱动
   - 审计查询：`/api/v1/admin/audits`，写操作已接入 `audit_logs`
   - RagFlow 联通探测：`/api/v1/integrations/ragflow/health`
   - 文件网关：`files/upload`、`files/{id}/download`、`skills/indicator-verification/run`，元数据已落库到 `file_assets`
   - 文件存储：支持 `local/s3` 双后端，已验证 MinIO（复用 RagFlow MinIO）
   - 文件哈希：`upload` 返回 `sha256Hex`，`file_assets` 已存储哈希字段
   - 运维脚本：已补 `backfill-file-sha256` 与 `maintenance-tick`
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
