# 变更日志

> 更新时间：2026-05-13
> 作用：每次重要改动后追加，按时间倒序排列。

---

## 2026-05-13

### 前端：会话管理完全迁移到子侧边栏 ✅

**概述**：彻底移除 ChatInterface 中的左侧对话面板和 `>` 按钮，所有会话管理功能（查看/新建/置顶/重命名/删除/排序）完全集成到智能问答的子侧边栏中。

**API 路径修复**：
- 前端从 `/user/conversations` 迁移到 `/v1/conversations`（后端实际路由）
- 修复了 7 处 API 路径调用

**子侧边栏功能增强**：
- `MiniConvItem` 新增**重命名**按钮（点击后在行内显示输入框，Enter 提交/Escape 取消）
- `MiniConvItem` 新增**删除**按钮（hover 显示，点击后 confirm 确认）
- `MiniConvItem` 保留**置顶**按钮（原有功能）
- `MiniConvItem` 保留**拖拽排序**功能（原有功能）

**架构重构**：
- `App` 层统一管理 `conversations` 状态（`appConversations`、`appConvOrder` 等）
- `ChatInterface` 通过 `useImperativeHandle` 暴露 `switchToConversation`、`syncConversationsFromApp`、`refreshTitle` 方法
- `ChatSidebarItem` 改为纯受控组件，接收所有 props
- 移除 `showConvPanel` 状态、左侧面板 DOM、`>` 按钮

**Bug 修复**：
- `normalizeConversationId`/`normalizeConversationTitle` 从 `ChatInterface` 内部提升到模块级别，解决 App 层引用时作用域错误导致会话列表为空
- `handleSwitchConversation` 移到 `useImperativeHandle` 之前定义，解决 "Cannot access before initialization" 错误

**API 验证（curl 测试全通过）**：
- `POST /api/v1/conversations` — 新建对话 ✅
- `GET /api/v1/conversations` — 对话列表 ✅
- `PATCH /api/v1/conversations/:id` — 重命名 ✅
- `DELETE /api/v1/conversations/:id` — 删除 ✅
- `PATCH /api/v1/user/settings` — 置顶/排序保存 ✅
- `GET /api/v1/user/settings` — 置顶/排序读取 ✅
- `POST /api/v1/conversations/:id/messages` — 发送消息 ✅
- `GET /api/v1/conversations/:id/messages` — 获取消息 ✅

**改动文件**：
- `frontend/src/App.jsx`（App 层状态管理 + ChatSidebarItem/MiniConvItem 重构 + 移除左侧面板）
- `frontend/server.js`（API 代理，删除旧 `/user/conversations` 路由）
- `programDoc/changelog.md`（本文档）
- `programDoc/progress.md`（会话管理章节更新）

---

## 2026-05-12

### 前端：智能问答子侧边栏 + 组件库分组管理 ✅

**概述**：为侧边栏和四大组件库添加了子侧边栏和分组管理功能。

**子侧边栏（智能问答）**：
- 点击智能问答菜单项，出现可展开子侧边栏
- 子侧边栏内显示已有对话列表，最多默认展示 10 条，超出显示省略号
- 支持拖拽排序，自动保存（通过后端 `/api/v1/user/settings`）
- 支持置顶/取消置顶
- "+" 按钮新建对话（复用现有 ChatInterface）
- 最大 20 条对话限制

**分组管理（知识库/数据库/技能库/模型库）**：
- 各组件新增「分组视图」切换按钮
- 支持创建自定义分组名称
- 在分组视图中可将已有内容拖入不同分组
- 分组配置通过后端 API 持久化（`/api/v1/user/settings`）

**后端改动**：
- `brain-server/prisma/schema.prisma`：`User` 模型新增 `settings Json?` 字段
- 新增 `brain-server/src/routes/userSettings.ts`：GET/PATCH `/api/v1/user/settings` 接口
- `brain-server/src/server.ts`：注册 `registerUserSettingsRoutes`
- `frontend/server.js`：代理 `/api/v1/user/settings` 到 brain-server

**前端改动**：
- `frontend/src/App.jsx`：
  - 新增 `ChatSidebarItem` + `MiniConvItem` 组件（智能问答子侧边栏）
  - `Sidebar` 组件改用 `ChatSidebarItem` 替代原有按钮
  - `ChatInterface` 改为 `forwardRef` 包装，支持 `externalConvId` 和 `triggerNewConversation`
  - `App` 新增 `selectConvId` 状态和 `handleChatSelectFromSidebar` 回调
  - `DatasetManager` 分组视图（基于现有 `groupMode`/`datasetGroups`）
  - `DatabaseLibrary` 分组管理（新增 state + 切换按钮 + 分组视图）
  - `SkillLibrary` 分组管理（新增 state + 切换按钮 + 分组视图）
  - `ModelLibrary` 分组管理（新增 state + 切换按钮 + 分组视图）

---

### 知识库权限过滤 Bug 修复 ✅

**问题**：`lisi`（普通 user）登录后前端可见 6 个库，其中 4 个不是他创建也未被授权。

**根因**：`GET /api/v1/admin/datasets` 中 `ownershipMap` 补充阶段存在**无条件 `else` 分支**，将 RagFlow 中所有 `knowledge_bases` 记录无条件写入 `ownershipMap`，绕过了权限过滤：

```typescript
// ❌ 修复前
kbRecords.forEach(kb => {
  const existing = ownershipMap.get(kb.ragDatasetId)
  if (existing) {
    existing.isShared = kb.isShared
  } else {
    // 无条件写入——所有角色都暴露他人库
    ownershipMap.set(kb.ragDatasetId, { ownerUserId: kb.ownerId, ... })
  }
})

// ✅ 修复后
kbRecords.forEach(kb => {
  const existing = ownershipMap.get(kb.ragDatasetId)
  if (existing) {
    existing.isShared = kb.isShared
  } else if (operator.role === 'super_admin') {
    // 仅 super_admin 可通过此路径看到无 ownership 关联的库
    ownershipMap.set(kb.ragDatasetId, { ownerUserId: kb.ownerId, ... })
  }
  // 非 super_admin 在 else 不做任何操作
})
```

**验证**：修复后 `lisi` 正确显示 2 个库（仅自己创建），`permissions` 表授权数为 0，两者一致。

**部署注意**：`brain-server` 运行在 Docker 容器 `ai4kb-brain-server` 中，修改代码后需执行：

```bash
# 快速调试
npx tsc -p tsconfig.json
docker cp dist/server.js ai4kb-brain-server:/app/dist/server.js
docker restart ai4kb-brain-server

# 标准发布
docker build -t deploy-brain-server:<日期> .
docker compose -f deploy/docker-compose-brain-ts.yml up -d --build
```

**详情**：[bugfix-kb-permission-filter-20260512.md](./specs/bugfix-kb-permission-filter-20260512.md)

---

## 2026-05-07

### Xinference 重启与 RagFlow 解析接口修复 ✅

- **问题**：直接用 `docker run` 启动 Xinference，端口 8085 无法正常访问
- **修复**：改用 `docker compose -f deploy/docker-compose-xinference.yml up -d`
- **验证**：`bge-m3`、`bge-reranker-v2-m3` 加载成功；RagFlow 文档解析正常（71 chunks）
- **文档**：`howtoload.md` 已更新启动命令

---

## 2026-04-17

### SSE 流式输出 + RAG/AI 内容区分显示 ✅

- `brainService.ts`：修复 `rag_content` 事件重复发送，`token` 事件聚合
- `App.jsx`：新增 `eventName === 'rag_content'` 处理逻辑，RAG 内容标记 `📚`，AI 总结标记 `🤖`
- `frontend/server.js`：透传 `raw` payload，扩展 `references/reference` 多路径提取
- **验证**：TTFB ~1.8s，`event: token` 连续到达，引用可点击

---

## 2026-04-17

### JWT Token 过期时间延长 + 自动刷新 ✅

- `JWT_ACCESS_EXPIRES_IN` 从 `30m` 改为 `8h`
- 前端 `apiFetch` 增加 401 自动刷新 token 逻辑，刷新失败才触发登出

---

## 2026-04-17

### 前端 Markdown 表格样式 ✅

- 安装 `remark-gfm` 插件（GFM 表格语法）
- `App.jsx` 的 `MarkdownWithCitations` 添加表格样式类

---

## 2026-04-15

### rag-query Skill 修复 ✅

- `skills/rag_query/SKILL.md` 添加 `context: fork` + 实际执行命令
- 之前 skill 内容只被当作 markdown 说明，LLM 不会真正执行 `run_skill.py`

---

## 2026-04-15

### Docker 启动与测试 ✅

- 发现 `ai4kb-brain` 容器 Restarting，错误 `Cannot find module 'src/bootstrap/state.js'`
- 执行 `docker compose -f docker-compose-brain-ts.yml down && up -d` 恢复正常
- 验证：`/api/health` 200、`/api/ready` 200

---

## 2026-04-12

### 每用户记忆 + src 记忆注入 ✅

- `brain-server` 新增 `GET/PUT /api/v1/memory/profiles` + `GET/PUT /api/v1/memory/current`
- 记忆落盘：`memory-profiles/<storageRoot>/MEMORY.md`，加入读写审计
- `src` 每轮 system prompt 注入当前用户记忆
- 前端新增"记忆管理"页签，支持查看、切换、编辑
- **验证**：`zhangsan` 写入 `profile-49` 后可读回，`lisi` 读 `profile-49` 返回 403

---

## 2026-04-12

### 前端适配层改造（第三批）✅

- 新增 `/api/v1/agent/tool/catalog`、`draft`、`upload`、`approve`
- `agent/chat/stream` 增加技能意图识别（命中 RAG 关键词自动带 `skillId`）
- **验证**：`zhangsan` RAG approve 返回引用，CAD approve 返回 3 个输出文件；`lisi` RAG approve 返回权限拒绝

---

## 2026-04-12

### 多用户端到端流程联测 ✅

- `zhangsan` 调 RAG → 200；`lisi` 调 RAG → 403（`skill permission denied`）
- `zhangsan` 上传 dxf → 调用 CAD → 成功产 3 文件；`lisi` 用 `zhangsan` 的 fileId → 403（`forbidden file access`）

---

## 2026-04-12

### brain-server 前后置拆分改造 ✅

- 新增 `routes/preServer.ts`（`/api/v1/pre/context`、`/api/v1/brain/context`）
- 新增 `routes/postServer.ts`（`/api/v1/post/toolcall/authorize`）
- `src` 接入后置鉴权：`SkillTool.checkPermissions` + brain 前后置策略检查

---

## 2026-04-16

### Brain Service Docker 部署修复 ✅

- Skills 目录未挂载 → `volumes: ../skills:/opt/skills:ro`
- 缺少 `.claude/skills` 符号链接 → Dockerfile 中创建
- Skill 名称匹配问题（`rag_query` vs `rag-query`）→ 支持下划线/连字符互换
- Python `requests` 模块缺失 → Dockerfile 安装

---

## 2026-04-16

### 流式输出架构（SSE 真流式）✅

- 新增 `handleBrainQueryStream` + `processQueryThroughBrainStream` + `runSingleTurnStream`
- SSE 事件类型：`chunk`、`skill_start/skill_end`、`rag_content`、`done`
- RAG 执行完成后追加用户消息触发 LLM 总结

---

## 2026-04-11

### brain-server 无法连接 brain 服务 ✅

- 错误：`ConnectionRefused: http://brain:3100/api/query`
- 根因：brain 使用 `network_mode: host`，Docker 网络无法解析 `brain:3100`
- 修复：改为 `http://host.docker.internal:3100/api/query`

---

## 2026-04-11

### RagFlow 对接 Ollama 连接修复 ✅

- 错误：`Cannot connect to host ollama:11434`
- 根因：`ragflow` 容器无法解析 `host.docker.internal`，模型名误写 `qwen3.5-9b`
- 修复：添加 `extra_hosts: host.docker.internal:host-gateway`，模型名改为 `qwen3.5:9b`
