# cloai-code 项目详细说明

## 概览

`cloai-code` 是一个基于 Bun + TypeScript 的终端 Agent 系统，包含：

- CLI 启动与模式分流
- 交互式 REPL 会话
- Query 推理循环与工具调用编排
- Slash 命令系统
- Skill 技能系统（静态 + 动态 + 条件激活）
- MCP / 插件扩展
- 全局 AppState 状态管理
- **brain-server**：企业级后端服务（认证、权限、RAG、文件管理、审计）
- **brain**（src brain）：AI 推理核心（LLM 调用、SkillTool 执行）
- **前端**：Web UI（Vue 3 + Vite）
- **RAGFlow**：知识库（RAG 检索引擎）
- **xinference**：Embedding / Reranker 模型服务（bge-m3 / bge-reranker-v2-m3）
- **Ollama**：LLM 推理服务（qwen3.5:9b）
- **PostgreSQL + Redis + MongoDB**：数据持久化与缓存

---

## 一、启动链路模块

### 1) `src/bootstrap-entry.ts`

- `ensureBootstrapMacro()`：确保宏环境可用
- `import('./entrypoints/cli.tsx')`：进入 CLI 入口

### 2) `src/entrypoints/cli.tsx`

- `main()`：CLI 第一入口
- 功能：
  - `--version` 等 fast path 直接返回，避免加载完整模块
  - 按参数切到 daemon / remote-control / mcp 等分支
  - 默认导入并执行 `main.tsx` 的 `main()`

### 3) `src/entrypoints/init.ts`

- `init()`：初始化配置、环境变量、代理/mTLS、清理钩子、异步预热
- `initializeTelemetryAfterTrust()`：在 trust 建立后初始化遥测

---

## 二、主装配与运行入口

### `src/main.tsx`

职责是"总装配器"：

- 解析启动参数与运行模式
- 组装 `commands`、`tools`、`mcp`、`plugins`、`skills`
- 获取 `getSystemContext()` / `getUserContext()`
- 构建默认 `AppState`
- 启动 REPL 或非交互流程

关键依赖：

- `getCommands()`（`src/commands.ts`）
- `getTools()`（`src/tools.ts`）
- `init()`（`src/entrypoints/init.ts`）
- `getDefaultAppState()`（`src/state/AppStateStore.ts`）

---

## 三、交互与消息主循环

### 1) `src/screens/REPL.tsx`

REPL 是核心运行层，负责：

- 用户输入、快捷键、命令队列
- 消息渲染与任务视图
- 权限弹窗、MCP elicitation、通知
- 触发 `processUserInput()` 与 `query()`
- 把工具执行结果回写到状态与界面

### 2) `src/utils/processUserInput/processUserInput.ts`

核心方法：

- `processUserInput(...)`
  - 统一输入入口
  - 执行 UserPromptSubmit hooks
  - 产生 `messages + shouldQuery` 结果

- `processUserInputBase(...)`
  - 分流三类输入：
    - slash 命令（`/xxx`）
    - bash 模式
    - 普通 prompt
  - 处理图片、附件、bridge 安全校验、ultraplan 关键词

### 3) `src/query.ts`

核心方法：

- `query(params)`：对外异步生成器
- `queryLoop(...)`：内部推理循环

核心流程：

1. 构建系统提示与上下文
2. 执行上下文治理（snip/microcompact/autocompact 等）
3. 流式请求模型并解析 assistant/tool_use 片段
4. 调度工具执行并注入 tool_result
5. 根据状态继续下一轮或结束

---

## 四、命令系统模块

### `src/commands.ts`

关键方法：

- `getCommands(cwd)`：合并所有命令来源并做过滤
- `findCommand(name, commands)`：按 name/alias 查找命令
- `filterCommandsForRemoteMode(commands)`：远程模式安全过滤
- `getSkillToolCommands(cwd)`：给 SkillTool 的可调用技能清单

命令来源包含：

- 内置命令（`src/commands/*`）
- 本地技能命令（`src/skills`）
- 插件命令与插件技能
- 工作流命令（按 feature 开启）

---

## 五、工具系统模块

### 1) `src/Tool.ts`

核心定义：

- `Tool` 接口：`call`、`checkPermissions`、`validateInput`、`prompt` 等
- `ToolUseContext`：工具执行所需上下文（状态、消息、权限、回调）
- `findToolByName()`：名称查找
- `getEmptyToolPermissionContext()`：默认权限上下文

### 2) `src/tools.ts`

关键方法：

- `getAllBaseTools()`：当前环境可用工具全集（受 feature/env 影响）
- `getTools(permissionContext)`：按模式和权限过滤最终内置工具集合
- `assembleToolPool(permissionContext, mcpTools)`：合并内置工具与 MCP 工具并去重

典型工具：

- 文件：Read/Edit/Write/NotebookEdit
- 搜索：Glob/Grep/WebFetch/WebSearch
- 协作：Agent/Task/Team/SendMessage
- 控制：AskUserQuestion/TodoWrite/TaskStop/PlanMode

---

## 六、技能系统模块

### `src/skills/loadSkillsDir.ts`

关键方法与作用：

- `parseSkillFrontmatterFields(...)`：解析前置元数据（描述、参数、allowed-tools、model、effort、hooks）
- `createSkillCommand(...)`：将技能 markdown 变为 `prompt` 命令
- `getSkillDirCommands(cwd)`：多来源加载技能并去重，拆分普通技能/条件技能
- `discoverSkillDirsForPaths(filePaths, cwd)`：按文件路径动态发现技能目录
- `addSkillDirectories(dirs)`：并入动态技能并触发缓存失效信号
- `activateConditionalSkillsForPaths(filePaths, cwd)`：按 paths 匹配激活条件技能

技能来源：

- managed skills（策略下发）
- user skills（用户目录）
- project skills（项目 `.claude/skills`）
- additional dirs（`--add-dir`）
- legacy commands 目录兼容加载

---

## 七、上下文与状态

### 1) `src/context.ts`

关键方法：

- `getGitStatus()`：会话开始时收集 git 快照
- `getSystemContext()`：系统上下文（git 状态、可选注入）
- `getUserContext()`：用户上下文（CLAUDE.md + 当前日期）

### 2) `src/state/AppStateStore.ts`

关键方法：

- `getDefaultAppState()`：构建默认全局状态

重要状态域：

- `toolPermissionContext`
- `mcp`（clients/tools/commands/resources）
- `plugins`（enabled/disabled/errors/installationStatus）
- `tasks`、`todos`、`notifications`、`elicitation`

---

## 八、MCP 模块

### `src/entrypoints/mcp.ts`

关键方法：

- `startMCPServer(cwd, debug, verbose)`
  - 处理 `ListToolsRequestSchema`
  - 处理 `CallToolRequestSchema`

执行步骤：

1. `getTools()` 获取工具集合
2. `findToolByName()` 定位工具
3. 构造 `ToolUseContext`
4. `validateInput` -> `tool.call` -> 返回 MCP 响应

---

## 九、brain-server 企业后端模块

> `brain-server` 是 `cloai-code` 项目的企业级后端服务，基于 Fastify + TypeScript 构建，负责认证授权、RAG 检索代理、技能管理、文件管理、会话管理和全链路审计。

### 1) `src/server.ts` — 主服务文件（核心入口）

**技术栈**：

- Fastify（HTTP 框架）
- PostgreSQL（用户/权限/会话/审计数据）
- Redis（policy version 缓存、rag chat 映射）
- MongoDB（Skill markdown 内容存储）
- S3 兼容存储（文件资产，支持 local / MinIO 切换）
- JWT（access + refresh 双 token）
- bcrypt（密码哈希）

**核心数据结构**：

```typescript
type Role = 'super_admin' | 'admin' | 'user'
type ResourceType = 'DATASET' | 'DATASET_OWNER' | 'SKILL' | 'MEMORY_PROFILE'
type TokenClaims = { sub, username, role, profileId, tokenType }
type AuthedRequest = FastifyRequest & { auth: Omit<TokenClaims, 'tokenType'> }
```

**JWT 认证**：

- `signToken()` / `signUserToken()`：签发 access / refresh token
- `verifyToken()`：验证 token 类型与有效期
- `parseBearerToken()`：从 header 提取 token（支持 query token 用于下载链接）
- `authGuard`：全局认证守卫，支持 query token 回退

**用户与权限**：

- `getActiveOperator()`：获取当前活跃操作员
- `canManageTargetUser()`：admin 只能管理自己及直属用户
- `loadUserPermissionContext()`：加载用户所有权限上下文（datasets / dataset_owners / skills / memory_profiles）
- `mutatePermissions()`：批量 grant/revoke 权限
- `bumpPolicyVersion()`：权限变更后递增 Redis 中的版本号，触发客户端刷新

**文件存储**：

- `storeFile()`：支持 local 文件系统 或 S3 存储双后端
- `readAssetBytes()`：统一读取接口
- `ensureS3BucketReady()`：启动时确保 S3 bucket 存在

**审计日志**：

- `writeAudit()`：通用审计日志（action 驱动）
- `writeToolCallAudit()`：工具调用专项审计
- `writeRagQueryAudit()`：RAG 查询专项审计

**RAGFlow 集成**：

- `buildRagflowHeaders()`：兼容 authorization / bearer token / api key 三种认证方式
- `getOrCreateUserRagflowChatId()`：Redis 缓存用户 chatId，支持自动重建
- `discoverRagflowChatId()`：从 RagFlow 发现已有 chat

**健康检查**：

- `GET /api/health`：进程级存活检查
- `GET /api/ready`：依赖就绪检查（PostgreSQL + Redis）

---

### 2) `src/routes/preServer.ts` — 前置上下文路由

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/brain/context` | GET | 获取用户完整权限上下文 |
| `/api/v1/pre/context` | GET | 获取带 memoryScope 包装的上下文 |

---

### 3) `src/routes/postServer.ts` — 后置鉴权路由

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/post/toolcall/authorize` | POST | 工具调用鉴权，支持 skill/dataset/memory_profile 权限校验 |

---

### 4) `src/routes/skills.ts` — 技能管理路由

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/skills` | GET | 列出所有技能（内部服务可跳过认证） |
| `/api/v1/skills/:name` | GET | 获取单个技能详情（含 markdown） |
| `/api/v1/skills` | POST | 创建技能（admin+） |
| `/api/v1/skills/:name` | PUT | 更新技能（owner 或 super_admin） |
| `/api/v1/skills/:name` | DELETE | 删除技能（super_admin） |
| `/api/v1/skills/:name/shortcuts` | GET | 列出技能快捷方式 |
| `/api/v1/skills/:name/shortcuts` | POST | 创建快捷方式（admin+） |
| `/api/v1/skills/:skillName/shortcuts/:shortcutId` | PUT | 更新快捷方式 |
| `/api/v1/skills/:skillName/shortcuts/:shortcutId` | DELETE | 删除快捷方式 |
| `/api/v1/agent/tool/catalog` | GET | 前端工具目录（skill → tool 格式转换） |
| `/api/v1/agent/tool/draft` | POST | 创建工具草稿（手动触发 skill） |
| `/api/v1/agent/tool/upload` | POST | 上传文件到 skill 输入目录 |
| `/api/v1/agent/tool/approve` | POST | 审批工具调用（代理到 brain service） |
| `/api/v1/internal/skills/:name/markdown` | GET | brain service 获取 skill markdown |

**存储架构**：Skill 元数据存储在 PostgreSQL，markdown 内容存储在 MongoDB（`skill_docs` collection）。

---

### 5) `src/routes/conversations.ts` — 会话管理路由

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/conversations` | GET | 列出当前用户会话（分页） |
| `/api/v1/conversations` | POST | 创建新会话 |
| `/api/v1/conversations/:id` | GET | 获取会话详情（含消息） |
| `/api/v1/conversations/:id` | PATCH | 更新会话标题 |
| `/api/v1/conversations/:id` | DELETE | 删除会话 |
| `/api/v1/conversations/:id/messages` | POST | 发送消息 |
| `/api/v1/conversations/:id/messages` | GET | 获取消息列表（支持 beforeId 分页加载） |
| `/api/v1/admin/users/:userId/conversations` | GET | 管理员查看用户会话 |
| `/api/v1/admin/conversations/:id` | GET | 管理员获取会话详情 |
| `/api/v1/admin/conversations/stats` | GET | 会话统计（30 天/7 天维度） |
| `/api/v1/internal/conversations/:id/messages` | POST | brain service 保存消息 |
| `/api/v1/internal/conversations/:id/context` | GET | brain service 获取最近 N 条上下文 |

---

### 6) `src/routes/` 中的其他管理路由（内嵌在 `server.ts`）

**用户管理**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/users` | GET | 列出用户（admin+） |
| `/api/v1/admin/users` | POST | 创建用户（admin+） |
| `/api/v1/admin/users/:id` | PATCH | 更新用户 |
| `/api/v1/admin/users/:id` | DELETE | 禁用用户（软删除） |

**RAGFlow 数据集管理**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/datasets` | GET | 列出 RagFlow 数据集 |
| `/api/v1/admin/datasets/:id/documents` | GET | 列出数据集中的文档 |
| `/api/v1/admin/datasets/:id/documents` | POST | 上传文档到数据集 |
| `/api/v1/admin/datasets/:id/documents` | DELETE | 删除文档 |
| `/api/v1/admin/datasets/:id/documents/run` | POST | 解析/向量化文档 |
| `/api/v1/admin/datasets/:id/documents/:docId/file` | GET | 获取文档文件 |
| `/api/v1/admin/datasets/:id/documents/:docId/chunks` | GET | 获取文档 chunks |
| `/api/v1/admin/datasets` | POST | 创建数据集 |
| `/api/v1/admin/datasets/:id` | PUT | 更新数据集 |
| `/api/v1/admin/datasets/:id` | DELETE | 删除数据集 |

**权限管理**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/permissions/dataset-owners` | POST | 授予/撤销数据集 owner 权限 |
| `/api/v1/admin/permissions/datasets` | POST | 授予/撤销数据集访问权限 |
| `/api/v1/admin/permissions/skills` | POST | 授予/撤销技能权限 |
| `/api/v1/admin/permissions/memory-profiles` | POST | 授予/撤销记忆 profile 权限 |
| `/api/v1/admin/users/:id/permissions` | GET | 查看用户所有权限 |

**审计查询**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/audits` | GET | 通用审计日志查询 |
| `/api/v1/admin/audits/skills` | GET | 工具调用审计 |
| `/api/v1/admin/audits/rag` | GET | RAG 查询审计 |

**文件管理**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/files/upload` | POST | 上传文件（input 类型） |
| `/api/v1/files/:fileId/download` | GET | 下载文件 |
| `/api/v1/admin/files` | GET | 列出文件资产（分页/过滤） |
| `/api/v1/admin/files/:fileId/status` | POST | 更新文件状态（active/missing） |
| `/api/v1/admin/files/status/batch` | POST | 批量更新文件状态 |
| `/api/v1/admin/files/export` | GET | 导出文件资产 CSV |
| `/api/v1/brain/files/download` | GET | 代理 brain-service 文件下载 |

**记忆管理**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/memory/profiles` | GET | 获取用户可见 profile 列表 |
| `/api/v1/memory/current` | GET | 读取当前 profile 记忆内容 |
| `/api/v1/memory/current` | PUT | 更新当前 profile 记忆内容 |

**文档代理**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/document/get/:documentId` | GET | 获取 RagFlow 文档 |
| `/api/document/image/:imageId` | GET | 获取 RagFlow 图片 |

**RAG 查询**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/rag/query` | POST | 非流式 RAG 查询 |
| `/api/v1/rag/query/stream` | POST | SSE 流式 RAG 查询 |

**Brain 推理**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/brain/query` | POST | 统一推理入口（代理到 brain service），支持 JSON / multipart，支持文件上传 |

**指标验证**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/skills/indicator-verification/run` | POST | 执行 CAD 指标验证 skill |

**集成健康**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/integrations/ragflow/health` | GET | 检测 RagFlow 连通性 |

---

### 7) `src/lib/mongodb.ts` — MongoDB 连接与 Skill 文档存储

```typescript
initMongoDB()           // 初始化连接
getSkillDocByName()    // 按 name 查 skill markdown
upsertSkillDoc()       // 原子 upsert
getAllSkillDocs()      // 全量查询
deleteSkillDoc()       // 删除
```

**Collection**：`ai4kb_brain.skill_docs`（索引：`name` unique）

---

### 8) `src/lib/prisma.ts` — Prisma 单例

全局 `PrismaClient` 实例，供所有路由模块使用。

---

### 9) Prisma 数据模型

| Model | 说明 |
|-------|------|
| `User` | 用户（role: super_admin/admin/user，managerUserId 树形管理） |
| `MemoryProfile` | 用户记忆 profile（profileId 唯一，按 userId 隔离） |
| `Permission` | 权限（userId + resourceType + resourceId 唯一约束） |
| `Conversation` | 会话（userId + title + messageCount + lastMessageAt） |
| `Message` | 消息（role + content + metadataJson，最多 1000 条/会话） |
| `AuditLog` | 通用审计日志 |
| `ToolCallAudit` | 工具调用审计 |
| `RagQueryAudit` | RAG 查询审计 |
| `FileAsset` | 文件资产（input/output 分类，active/missing 状态，sha256 校验） |
| `Skill` | 技能元数据（name + allowedRoles + status + scriptPath） |
| `SkillShortcut` | 技能快捷方式（fixedParams + displayName） |

---

## 十、brain service（src brain）

brain 是 cloai-code 在 Docker 容器中的封装核心，负责：

- 运行 SkillTool 执行 forked skills（如 rag-query、cad-text-extractor）
- 调用 Ollama（qwen3.5:9b）进行 LLM 推理
- 通过 `BRAIN_SERVER_BASE_URL` 与 brain-server 通信获取权限上下文

部署方式：Docker，与宿主共享 skills 目录和 skill-files volume。

---

## 十一、模块间关联（重点）

主链路（前端）：

1. `bootstrap-entry.ts` -> `entrypoints/cli.tsx` -> `main.tsx`
2. `main.tsx` 装配 commands/tools/skills/mcp/state 后进入 `REPL.tsx`
3. `REPL.tsx` 调用 `processUserInput()` 处理输入
4. 若需模型推理，`REPL.tsx` 调 `query()`
5. `query()` 调工具编排，执行 `tools/*`
6. 执行结果回写消息和 `AppState`，再渲染到 REPL

主链路（后端）：

1. 前端 POST `/api/v1/brain/query` -> `server.ts`（认证 + 权限校验）
2. `server.ts` 代理到 `brain-service`（port 3100）
3. brain 调用 Ollama（port 11434）推理
4. brain 若需 RAG，调用 `/api/v1/rag/query` -> `server.ts` -> RagFlow
5. brain 若需 skill，调用 `/api/v1/internal/skills/:name/markdown` 获取 skill markdown
6. skill 执行结果通过 `/api/v1/files/upload` 等接口注册到 `server.ts`
7. `server.ts` 将结果 SSE 流式返回前端

关键依赖关系：

- `commands.ts` 依赖 `skills/loadSkillsDir.ts`（技能命令化）
- `query.ts` 依赖 `Tool.ts` + `tools.ts`（工具调度）
- `REPL.tsx` 同时依赖 commands/tools/query/processUserInput/state
- `context.ts` 为 query 提供系统/用户上下文
- `server.ts` 依赖 `prisma`（数据）+ `mongodb`（skill markdown）+ `redis`（缓存）+ `pg`（连接池）

---

## 十二、阅读建议（从快到深）

1. 入口：`bootstrap-entry.ts`、`entrypoints/cli.tsx`、`main.tsx`
2. 主循环：`screens/REPL.tsx`、`utils/processUserInput/*`、`query.ts`
3. 能力层：`commands.ts`、`tools.ts`、`skills/loadSkillsDir.ts`
4. 横切服务：`services/mcp/*`、`services/compact/*`、`services/api/*`
5. 状态：`state/AppStateStore.ts`
6. **后端入口**：`brain-server/src/server.ts`
7. **后端路由**：`routes/preServer.ts`、`routes/postServer.ts`、`routes/skills.ts`、`routes/conversations.ts`
8. **后端数据**：`prisma/schema.prisma`
