# 变更日志

> 更新时间：2026-05-12  
> 作用：每次重要改动后追加，按时间倒序排列。

---

## 2026-05-12

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
