# cloai-code 项目进度总览

> 更新时间：2026-05-13（第八次）
> 作用：唯一进度来源。每次改动后同步更新，其他文档引用本文件。

---

## 1. 总体阶段

| 阶段 | 状态 |
|---|---|
| 规划阶段 | ✅ 已完成 |
| 实施准备 | ✅ 已完成 |
| Phase 1（治理骨架） | ✅ 已完成 |
| Phase 2（权限主干） | ✅ 已完成 |
| Phase 3（多用户端到端验证） | 🔄 进行中 |

---

## 2. 已完成内容

### 2.1 工程与基础设施

1. 新建 `brain-server` 子工程（Fastify + TypeScript + Prisma + PostgreSQL）
2. Docker 编排落地：
   - `deploy/docker-compose-brain-ts.yml`
   - `brain-server/Dockerfile`
   - `deploy/docker-compose-xinference.yml`（可选）
3. 启动提速：Docker 层缓存、BuildKit 包缓存、Postgres/Redis/MongoDB 持久卷缓存
4. `brain-server` 运行态：容器 `ai4kb-brain-server`，端口 8091
5. `brain` 主服务：容器 `ai4kb-brain`，端口 3100（host 网络）
6. Ollama LLM：容器 `ollama-local`，端口 11434（GPU）
7. 前端：生产容器 `ai4kb-frontend`（8086）、开发容器 `ai4kb-frontend-dev`（8087）

### 2.2 数据库（Prisma Schema）

共 14 张表：

| 表名 | 用途 |
|---|---|
| `users` | 账号（super_admin/admin/user，bcrypt 密码，managerUserId 上下级） |
| `permissions` | 授权关系（DATASET/DATASET_OWNER/SKILL/MEMORY_PROFILE 四类） |
| `dataset_ownerships` | 知识库所有权映射 |
| `knowledge_bases` | RagFlow 知识库元信息（ragDatasetId、isShared、ownerId） |
| `memory_profiles` | 用户记忆命名空间（profileId 唯一映射到 userId） |
| `conversations` | 会话主表（userId、title、messageCount） |
| `messages` | 会话消息（role、content、metadata JSON） |
| `audit_logs` | 通用审计流水 |
| `tool_call_audits` | 工具/技能调用审计 |
| `rag_query_audits` | RAG 查询审计 |
| `file_assets` | 文件元数据（storagePath、sha256Hex、category、status） |
| `skills` | 技能注册中心（name、mongoDocId、scriptPath、ownerId） |
| `skill_shortcuts` | 技能快捷方式（fixedParams JSON） |
| `llm_models` | LLM 模型配置（baseUrl、apiKey、maxTokens、isActive、isDefault） |

### 2.3 认证与用户

1. `POST /api/v1/auth/login` — 用户名密码登录，签发 JWT（access + refresh）
2. `POST /api/v1/auth/refresh` — refreshToken 换 accessToken
3. `GET /api/v1/auth/me` — 当前登录用户信息（含 profileId）
4. `POST /api/v1/admin/users` — 创建用户（super_admin/admin 可操作）
5. `PATCH /api/v1/admin/users/{id}` — 更新用户（角色、状态、manager）
6. `DELETE /api/v1/admin/users/{id}` — 删除用户
7. `seedAdmin` 启动种子：admin/superadmin 账号自动初始化
8. JWT 8 小时过期 + 前端 401 自动刷新

### 2.4 权限体系

1. `permissions` 表支持四类授权：DATASET / DATASET_OWNER / SKILL / MEMORY_PROFILE
2. `datasetOwnership` 表管理知识库所有权
3. 权限管理接口：
   - `POST /api/v1/admin/permissions/datasets` — 授予/撤销数据集权限
   - `POST /api/v1/admin/permissions/dataset-owners` — 授予/撤销所有权权限
   - `POST /api/v1/admin/permissions/skills` — 授予/撤销技能权限
   - `POST /api/v1/admin/permissions/memory-profiles` — 授予/撤销记忆配置权限
   - `GET /api/v1/admin/users/{id}/permissions` — 查询用户所有权限快照
4. `brain/context` 下发 allowedDatasets / allowedDatasetOwners / allowedSkills / allowedMemoryProfiles
5. Redis 缓存 + `policyVersion` 递增失效机制
6. 权限写操作自动落 `audit_logs`

### 2.5 审计体系

1. `audit_logs` 通用审计表（traceId、action、result、payloadJson）
2. `tool_call_audits` 工具调用审计（toolName、trigger、latencyMs、inputJson、outputJson）
3. `rag_query_audits` RAG 查询审计（datasetId、chatId、queryText、result、latencyMs）
4. 管理接口：
   - `GET /api/v1/admin/audits` — 通用审计（支持 traceId/userId/action 过滤）
   - `GET /api/v1/admin/audits/skills` — 技能调用审计
   - `GET /api/v1/admin/audits/rag` — RAG 查询审计

### 2.6 文件网关

1. `POST /api/v1/files/upload` — 上传文件，`file_assets` 元数据落库（sha256Hex）
2. `GET /api/v1/files/{id}/download` — 文件下载
3. `GET /api/v1/brain/files/download` — brain 服务文件透传下载
4. `indicator-verification` 技能执行链路：upload → run → download
5. 存储支持 `local / S3（MinIO）` 双后端
6. 文件状态治理：`active / missing`，410 拒绝读取 missing 文件
7. 管理接口：
   - `GET /api/v1/admin/files` — 文件列表（支持 status/category/ownerUserId 过滤）
   - `POST /api/v1/admin/files/{fileId}/status` — 单条状态更新（含可读性校验）
   - `POST /api/v1/admin/files/status/batch` — 批量状态更新
   - `GET /api/v1/admin/files/export` — CSV 导出

### 2.7 文档透传（RagFlow → brain-server → 前端）

1. `GET /api/v1/integrations/ragflow/health` — RagFlow 联通探测
2. `GET /api/v1/document/get/{id}` — 文档原文透传
3. `GET /api/v1/document/image/{id}` — 文档图片透传

### 2.8 RAG 检索

1. `POST /api/v1/rag/query` — RAG 查询代理（非流式）
2. `POST /api/v1/rag/query/stream` — RAG 查询代理（流式 SSE）
3. Redis `user → ragflow chatId` 映射，自动创建会话
4. SSE 事件类型：`chunk / skill_start / skill_end / rag_token / rag_content / done`
5. 流式文本答案 + 引用 `references` 提取
6. 引用点击打开原文/图片（`/document/get/{id}`、`/document/image/{id}`）

### 2.9 记忆系统

1. `memory_profiles` 表 + 文件系统（`memory-profiles/<storageRoot>/MEMORY.md`）
2. 接口：
   - `GET /api/v1/memory/profiles` — 查询用户所有 profile
   - `GET /api/v1/memory/current` — 当前 profile 的记忆内容
   - `PUT /api/v1/memory/current` — 更新当前 profile 的记忆
3. `src` 每轮 system prompt 注入当前用户记忆
4. 前端"记忆管理"页签：查看、切换、编辑

### 2.10 会话管理

1. `conversations` 表 + `messages` 表（会话与消息持久化）
2. 接口：
   - `GET /api/v1/conversations` — 会话列表
   - `POST /api/v1/conversations` — 创建会话
   - `PATCH /api/v1/conversations/:id` — 重命名会话
   - `DELETE /api/v1/conversations/:id` — 删除会话
   - `GET /api/v1/conversations/:id/messages` — 消息历史
   - `POST /api/v1/conversations/:id/messages` — 发送消息
3. `User.settings Json` 字段 — 保存用户偏好（对话排序、组件库分组）
4. 接口：`GET/PATCH /api/v1/user/settings` — 用户设置（对话顺序、库分组）
5. 前端：智能问答子侧边栏（拖拽排序 + 置顶 + 重命名 + 删除 + 新建对话）
6. 前端会话统计图表：BarChart、LineChart、PieChart
7. 四大模块（知识库/技能库/模型库/数据库）统一「吸顶分组导航栏 + 分组区块 + 拖拽卡片到分组」交互
8. 四大模块分组数据统一通过 `/v1/user/settings` API 持久化

### 2.11 Brain 推理（src brain service）

1. `src/services/brainOrchestration/brainService.ts`
2. 接口：
   - `POST /api/v1/brain/query` — 大脑查询（直连 brain service，SSE 流式）
   - `GET /api/v1/pre/context` — 前置上下文（brain → brain-server 获取用户上下文）
3. SSE 事件：`chunk / skill_start / skill_end / rag_token / rag_content / done / error`
4. 权限检查工厂：`createBrainServiceCanUseTool()`
5. 记忆注入：`buildSystemPromptWithMemory()`

### 2.12 Agent 工具链路

1. `GET /api/v1/agent/tool/catalog` — 工具目录（rag-query、indicator-verification）
2. `POST /api/v1/agent/tool/draft` — 创建工具草稿
3. `POST /api/v1/agent/tool/upload` — 工具文件上传
4. `POST /api/v1/agent/tool/approve` — 工具执行审批（SSE 返回 tool_result）
5. `POST /api/v1/agent/chat/stream` — Agent 聊天流（前端适配层代理到 `brain/query/stream`）
6. 前端技能意图识别：命中 RAG 关键词自动带 `skillId`，命中 CAD 先返 `tool_draft`

### 2.13 Skills 技能系统

1. `skills/rag_query`：RAG 检索技能（`context: fork`）
2. `skills/cad_text_extractor`（`indicator-verification`）：CAD 指标校核
3. `POST /api/v1/skills/indicator-verification/run` — CAD 技能执行接口
4. 技能注册中心：`skills` 表 + `skill_shortcuts` 表 + MongoDB `skill_docs` 集合
5. 统一输入输出 JSON 格式

### 2.14 前端适配层（`frontend/server.js`）

1. 所有 `/api/*` 代理到 `brain-server`
2. `/api/user/conversations*` 会话 CRUD（本地会话存储）
3. `/api/v1/agent/chat/stream` → brain-server SSE 流式
4. 技能工具链路：catalog/draft/upload/approve
5. 接口协议转换：前端旧协议 → brain-server 新协议
6. 流式输出：真实 SSE（TTFB ~1.8s，逐 token 到达）
7. Markdown 支持：remark-gfm 表格语法

### 2.15 前端 UI（`frontend/src/App.jsx`）

页面/标签：

| 功能 | 说明 |
|---|---|
| 登录 | 用户名/密码 |
| 对话界面 | Markdown 渲染、流式输出、引用可点击 |
| 数据集管理 | 列表、创建、共享设置、删除 |
| 用户管理 | 创建、角色升级、删除 |
| 权限管理 | 用户权限查询 |
| 会话统计 | BarChart/LineChart/PieChart |
| 路由样本 | RAG 查询审计 |
| 工具调用 | 目录、草稿、上传、审批流 |
| 记忆管理 | profile 切换与编辑 |
| PDF 预览 | react-pdf |
| Word 预览 | mammoth |
| 图片查看 | 放大/缩小 |

依赖：lucide-react、react-markdown、remark-gfm、react-pdf、pdfjs-dist、recharts、tailwind-merge、clsx

### 2.16 运维与脚本

1. `ops:cleanup-s3-orphans` — S3 孤立对象清理
2. `ops:backfill-file-sha256` — 历史文件哈希回填
3. `ops:migrate-local-assets-to-s3` — local 存量迁移 S3
4. `ops:maintenance-tick` — 回填 + 迁移组合执行
5. `ops:smoke-admin-file-status` — 文件治理接口回归脚本
6. `ops:smoke-admin-file-status`（Docker 运行态）
7. `test/run_governance_e2e.py` — Docker 运行态统一回归（鉴权/权限/context/审计）
8. `launch_xinference_models.py` — Xinference 模型启动脚本

---

## 3. 进行中内容

1. 多用户端到端验证：持续验证各角色权限隔离正确性
2. 接口鉴权强化：令牌轮换、refreshToken 黑名单机制
3. 管理侧查询能力：权限/审计查询的分页与过滤

---

## 4. 已完成内容（按日期）

### 2026-05-13 前端：会话管理迁移到子侧边栏
- **问题**：ChatInterface 左侧有独立对话面板 + `>` 按钮，与智能问答子侧边栏功能重复
- **修复**：移除左侧面板和 `>` 按钮，所有会话管理功能（查看/新建/置顶/重命名/删除/排序）完全集成到子侧边栏
- **子侧边栏增强**：新增行内重命名（输入框模式）、删除确认按钮
- **架构**：App 层统一管理 conversations 状态，ChatInterface 通过 useImperativeHandle 暴露切换/同步方法
- **API 修复**：前端从 `/user/conversations` 迁移到 `/v1/conversations`（7 处）
- **Bug 修复**：normalize 函数提升到模块级别解决作用域问题；handleSwitchConversation 顺序调整解决初始化错误

### 2026-05-13 前端：四大模块统一「吸顶分组导航 + 分组区块」交互

---

### 2026-05-13（第四次）前端：分组持久化调试 + 拖拽视觉修复 + 导航增强 ✅

**概述**：修复技能库/数据库/模型库分组不持久化、拖拽时分组标题悬浮、点击分组标签无法跳转。

**持久化修复**：
- `loadGroups`/`saveGroups` 增加错误级别日志（console.error），API 失败时有可调试的日志输出
- `loadGroups` 增加数组类型兜底判断，防止空对象 {} 导致渲染错误
- 四个模块（知识库/技能库/数据库/模型库）全部补全日志

**拖拽视觉修复**：
- `DroppableGroupSection` 标题栏移除 `sticky top-[56px]`，改为 `flex flex-col` 布局
- 拖拽时分组标题随卡片一起滚动，不再悬浮在卡片上方
- 空状态文案改为通用文本（适配所有四个模块）

**导航增强**：
- "全部"按钮 `scrollTo({ top: -62 })` 绕过 sticky 导航栏
- 分组点击偏移改为 `top - 64px`（56px 导航栏 + 8px 空隙）
- `SkillLibrary`/`ModelLibrary`/`DatabaseLibrary` 均添加 `onRenameGroup` 支持

---

### 2026-05-13（第三次）前端：四大模块分组导航交互修复与增强 ✅

**问题修复**：
- `DatabaseLibrary`：修复 `currentItems` → `currentDbs` 引用错误；添加 `activeGroupId` state、`navGroups`/`sectionGroups`/`currentDbs` 状态与 useMemo 定义；添加 `GroupNavBar` 渲染
- `ModelLibrary`：添加缺失的 `activeGroupId` state 及 `navGroups`/`sectionGroups`/`currentModels` useMemo；修复「添加模型」按钮 bug（`setGroupMode` 改为 `setShowForm`）
- `GroupNavBar`：`navGroups.length > 0 &&` 条件移除，导航栏始终显示「全部」按钮

**交互增强**：
- IntersectionObserver 触发后自动 `scrollIntoView` 将高亮卡片滚动到可视区域
- hover 分组卡片时显示编辑/删除图标按钮（`group-hover/card` CSS 组合类）
- scroll offset `Math.max(0, offset)` 防止滚动到负值

**测试**：前端 `npm run dev` → http://localhost:3000/ ✅
- **问题**：四大模块分组视图交互不一致（知识库有独立 groupMode，数据库/技能库/模型库各有一套逻辑），体验割裂
- **修复**：引入 `GroupNavBar`（吸顶横向卡片导航）+ `GroupSection`（分组区块标题栏+分割线）+ `CardGrid` 三个通用组件
- **统一交互**：吸顶导航栏、横向滚动、点击分组滚动到区块、页面滚动时自动高亮当前分组（IntersectionObserver）
- **模块**：DatasetManager、DatabaseLibrary、SkillLibrary、ModelLibrary 全部重构
- **ModelLibrary**：补充缺失的 groupMode 渲染逻辑（之前有状态有按钮但无渲染实现）

### 2026-05-12 前端改造
- **智能问答子侧边栏**：`Sidebar` 智能问答菜单项点击展开对话列表，支持拖拽排序、置顶、新建对话
- **组件库分组管理**：知识库/数据库/技能库/模型库均支持自定义分组创建和内容分配
- **后端用户设置 API**：`User.settings Json` 字段 + `/api/v1/user/settings` GET/PATCH 接口
- **前端适配层**：代理 `/api/v1/user/settings` 到 brain-server

## 5. 待完成内容

### 高优先级
1. 令牌轮换策略（refresh 失效机制）
2. 审计/权限管理端分页与过滤
3. 模型管理 UI（`llm_models` 表已有，UI 待完善分组功能）

### 中优先级
1. `test/run_governance_e2e.py` 扩展：新增 user/admin 边界与 rag/query 权限分支用例
2. OpenAPI 自动校验与生成流程

### 低优先级
1. 根目录统一启动脚本

---

## 6. 架构不符合项

1. 接口测试主要是脚本回归，自动化测试覆盖不足
2. RagFlow 上游连接稳定性问题（偶发 `APIConnectionError`）
3. 历史 local 存量存在 `missing` 场景，需确认清理策略

---

## 6. 前后端能力差距

### 6.1 前端依赖但后端尚未完整实现

| 差距项 | 前端调用 | 后端实际 | 状态 |
|---|---|---|---|
| 鉴权路径 | `/api/user/auth/login` | `/api/v1/auth/login` | ✅ 已适配 |
| 权限管理 | `/api/admin/permission/*` | `/api/v1/admin/permissions/*` | ✅ 已适配 |
| 数据集 CRUD | `/api/admin/datasets*` | `/api/v1/admin/datasets` | ✅ 已实现 |
| 会话管理 | `/api/user/conversations*` | `/api/v1/conversations*` + `/api/v1/user/settings` | ✅ 已适配 |
| 用户设置 | 无 | `/api/v1/user/settings` (settings Json) | ✅ 已实现 |
| 技能注册 | `/api/admin/skills/*` | 仅执行 + 审计，无注册中心 | 🔄 待评估 |
| 模型管理 | 无 | `llm_models` 表已落地 | 🔄 待 UI 开发 |
| 连接管理 | 无 | `database_connections` 表已落地 | 🔄 待评估 |

### 6.2 后端已实现但前端尚未展示

| 能力 | 后端接口 | 前端状态 |
|---|---|---|
| 权限细分（DATASET_OWNER/MEMORY_PROFILE） | `brain/context` 含字段 | 无对应操作页 |
| 文件治理 | `admin/files` 全套接口 | 无资产治理页 |
| 细分审计查询 | `/audits/skills`、`/audits/rag` | 未切到新维度 |

### 6.3 待评估的大出入项

1. 保留旧协议 + 适配层，还是前端直连新 API
2. 技能管理：本地目录驱动还是数据库注册驱动
3. RagFlow 上游稳定性是否可接受

---

## 7. 功能与代码映射

| 功能 | 业务实现 | 测试/运维 |
|---|---|---|
| 鉴权链路 | `brain-server/src/server.ts` | `test/run_governance_e2e.py` |
| 权限授权 | `brain-server/src/server.ts` | `test/run_governance_e2e.py` |
| 上下文下发 | `brain-server/src/server.ts` | `test/run_governance_e2e.py` |
| 审计查询 | `brain-server/src/server.ts` | `test/run_governance_e2e.py` |
| 文件治理 | `brain-server/src/server.ts` | `ops:smoke-admin-file-status` |
| Brain 推理 | `src/services/brainOrchestration/brainService.ts` | 手动测试 |
| Docker 部署 | `deploy/docker-compose-brain-ts.yml` | `docker cp` + `docker restart` |
| Prisma Schema | `brain-server/prisma/schema.prisma` | `npx prisma migrate` |
| API 规范 | `programDoc/specs/api.yaml` | — |
