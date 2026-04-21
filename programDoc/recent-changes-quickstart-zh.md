# cloai-code 近期改造要点（2026-04-15 ~ 2026-04-17）

> 更新时间：2026-04-18
> 作用：新会话快速启动，了解最近完成的关键改造，无需逐条阅读完整迭代记录。

---

## 一、最近改造概览

| 日期 | 改造项 | 关键文件 | 状态 |
|------|--------|----------|------|
| 2026-04-17 | SSE 流式输出 + RAG/AI 内容区分显示 | `brainService.ts`, `App.jsx` | ✅ 完成 |
| 2026-04-17 | JWT Token 过期时间延长 + 自动刷新 | `config.ts`, `App.jsx` | ✅ 完成 |
| 2026-04-15 | rag-query skill 修复 | `SKILL.md` | ✅ 完成 |
| 2026-04-15 | Docker 启动与测试 | `docker-compose-brain-ts.yml` | ✅ 完成 |
| 2026-04-12 | 每用户记忆 + src 记忆注入 | `server.ts`, `client.ts`, `QueryEngine.ts`, `REPL.tsx` | ✅ 完成 |
| 2026-04-12 | 前端接口对接改造 | `frontend/server.js` | ✅ 完成 |
| 2026-04-12 | 整项目流程联测 | 多文件 | ✅ 完成 |

---

## 二、详细改造说明

### 2.1 SSE 流式输出 + RAG/AI 内容区分显示（2026-04-17）

**目标**：让前端能同时看到 RAG 检索内容和 LLM 总结，以流式方式输出，且区分显示。

**问题排查过程**：
1. 最初 SSE 只有 `message` 事件，缺少 `rag_content` 事件
2. 检查 `extractSkillResultFromToolResult` 函数，发现正则匹配不到 `__STRUCTURED_RESULT__` 标记
3. 发现正则 `/__STRUCTURED_RESULT__:(.+)$/` 无法正确匹配多行 JSON（`.` 不匹配换行符）
4. 添加详细调试日志，重新构建后确认 structuredResult 正确提取

**修改内容**：
- `src/services/brainOrchestration/brainService.ts`
  - 修复 `extractSkillResultFromToolResult` 正则（改用 `[\s\S]` 匹配换行）
  - 添加详细调试日志
  - `structured_result`/`rag_content` 事件同时发送 `message` 和 `rag_content` 两种 SSE 事件
- `frontend/src/App.jsx`
  - 新增 `eventName === 'rag_content'` 处理逻辑（三处）
  - RAG 内容添加 `📚 RAG检索结果` 标记头
  - LLM 回答添加 `🤖 AI回答` 标记头（仅在有 RAG 内容后首次出现 LLM 输出时添加）
  - 添加 `payload.type === 'rag_content'` 过滤，避免 message 和 rag_content 重复处理

**验证结果**：
- SSE 输出：`skill_start` → `skill_end` → `message` (rag_content) → `rag_content` → LLM总结 → `[DONE]`
- 前端显示：`📚 RAG检索结果` 内容 → 分隔线 → `🤖 AI回答` 内容
- references 数组包含 image_id，可通过 `/api/document/image/:imageId` 获取图片

---

### 2.2 JWT Token 过期时间延长 + 自动刷新（2026-04-17）

**目标**：延长 JWT access token 过期时间，减少前端频繁登出的问题。

**问题**：access token 默认只有 30 分钟，前端经常需要重新登录。

**修改内容**：
- `brain-server/src/config.ts`
  - `JWT_ACCESS_EXPIRES_IN` 从 `'30m'` 改为 `'8h'`
- `frontend/src/App.jsx`
  - 新增 `getRefreshToken()` 函数
  - `apiFetch` 函数增加自动刷新 token 逻辑：
    - 401 时尝试用 refreshToken 获取新 accessToken
    - 刷新成功后重试原请求
    - 刷新失败才触发登出事件

**验证结果**：
- access token 现在 8 小时过期
- 前端会自动刷新 token，无需手动重新登录

---

### 2.3 rag-query skill 修复（2026-04-15）

**目标**：修复 rag-query skill 不执行真正 RAG 调用的问题。

**问题根因**：
- `skills/rag_query/SKILL.md` 原本没有 `context: fork` 配置
- skill 内容只是被当作 markdown 说明读给 LLM，LLM 不会真正执行 `run_skill.py`
- 因此 RAG 查询从未真正执行

**修复内容**：
- 在 `skills/rag_query/SKILL.md` 添加 `context: fork`
- 添加实际可执行命令：`python3 skills/rag_query/run_skill.py $ARGUMENTS`
- 明确告诉子 agent 要实际执行命令，不只是描述

**同步更新**：
- `programDoc/howtoload.md`：更新测试命令为 "什么是半面积"
- `programDoc/05_recordAiOperate.md`：添加本条迭代记录

**下一步**：重启 Docker 测试 rag skill 是否真正执行 RAG 调用

---

### 2.4 Docker 启动与测试（2026-04-15）

**目标**：重启项目并测试 API 是否正常。

**操作内容**：
1. 检查当前 docker 容器状态，发现 `ai4kb-brain` 容器处于 Restarting 状态
2. 检查 `ai4kb-brain` 日志发现错误：`Cannot find module 'src/bootstrap/state.js'`
3. 执行 `docker compose -f docker-compose-brain-ts.yml down` 停止所有容器
4. 执行 `docker compose -f docker-compose-brain-ts.yml up -d` 重新启动所有容器

**验证结果**：
- `GET /api/health` 返回正常：`{"status":"ok","ts":"2026-04-15T07:53:24.070Z","service":"brain-server"}`
- `GET /api/ready` 返回正常：`{"status":"ok","checks":{"postgres":"ok","redis":"ok"}}`
- `ai4kb-brain` 服务正常启动，监听 3100 端口
- 前端 `ai4kb-frontend` (8086端口) 正常返回 HTML

**服务状态**：
| 服务名 | 端口 | 状态 |
|--------|------|------|
| ai4kb-brain-server | 8091 | ✅ 正常 |
| ai4kb-brain | 3100 | ✅ 正常 |
| ai4kb-frontend | 8086 | ✅ 正常 |
| ai4kb-brain-postgres | 5433 | ✅ 正常 |
| ai4kb-brain-redis | 6380 | ✅ 正常 |

---

### 2.5 每用户记忆 + src 记忆注入（2026-04-12）

**目标**：实现"每用户记忆可编辑 + src 每轮读取当前用户记忆 + profile 可切换"。

**代码改动**：
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
  - 新增"记忆管理"页签与编辑器
  - 聊天请求支持携带 `memoryProfileId`

**验证**：
- 前端经 `8086` 调用记忆接口成功
- `zhangsan` 写入 `profile-49` 后可读回，`lisi` 读取该 profile 返回 403
- `src` 在不同 token/profile 下回答分别命中对应记忆定义（`profile-49` 与 `profile-79` 回答不同）

---

### 2.6 前端接口对接改造（2026-04-12）

**背景**：前端展示形态可用，但接口契约与后端现状不一致，导致工具流不可跑通。

**改造文件**：`frontend/server.js`

**新增能力**：
- `/api/v1/agent/tool/catalog`：返回两类技能目录（rag-query/cad）
- `/api/v1/agent/tool/draft`：生成草稿并缓存 toolCallId
- `/api/v1/agent/tool/upload`：上传文件到 `brain-server /api/v1/files/upload` 并关联草稿
- `/api/v1/agent/tool/approve`：执行技能并通过 SSE 返回 `tool_result/message/[DONE]`
- `/api/v1/agent/chat/stream`：增加关键词意图适配（RAG 自动带 `skillId`；CAD 先返回 `tool_draft`）

**联调结果**：
- `zhangsan` 在前端可完成 RAG 与 CAD 全链路
- `lisi` 调 RAG 收到权限拒绝事件
- CAD 上传后可获得输出文件下载 URL

---

### 2.7 整项目流程联测（2026-04-12）

**目标**：验证"src 大脑 + brain-server 前后置 + ragflow/ollama + 文件型 CAD skill"完整链路。

**执行**：
- **用户与权限**：
  - `zhangsan`：授予 `rag-query`、`indicator-verification`
  - `lisi`：仅授予 `indicator-verification`，显式撤销 `rag-query`
- **RAG 测试**：
  - `zhangsan` 调 `POST /api/v1/rag/query`（`skillId=rag-query`）=> 200
  - `lisi` 同请求 => 403 `skill permission denied`
- **CAD 测试**：
  - `zhangsan` 上传 dxf 至 `/api/v1/files/upload`，再调用 `/api/v1/skills/indicator-verification/run`
  - 成功生成 3 个产物并可下载（xlsx/dxf/json）
  - `lisi` 使用 `zhangsan` 的 `fileId` 调用 => 403 `forbidden file access`
- **src prompt 联测**：
  - 强制调用 `indicator-verification`，输入目录 `/home/ubutnu/code/cloai-code/skills/cad_text_extractor/input/样例`
  - 输出目录 `/tmp/cad_skill_from_src`
  - 成功返回文件列表并落地产物

---

## 三、快速测试命令

### 3.1 Docker 服务启动
```bash
# 进入项目目录
cd /home/ubutnu/code/cloai-code

# 停止所有容器
docker compose -f deploy/docker-compose-brain-ts.yml down

# 启动所有容器
docker compose -f deploy/docker-compose-brain-ts.yml up -d

# 检查服务状态
docker ps | grep ai4kb
```

### 3.2 API 测试
```bash
# 健康检查
curl http://localhost:8091/api/health

# 就绪检查
curl http://localhost:8091/api/ready

# 登录测试（正确的凭据）
# superadmin: ChangeMe123! (role: super_admin)
curl -X POST http://localhost:8091/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"ChangeMe123!"}'

# zhangsan: ChangeMe123! (role: user)
curl -X POST http://localhost:8091/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"zhangsan","password":"ChangeMe123!"}'

# RAG 测试（使用 skill）
python3 skills/rag_query/run_skill.py --query "什么是半面积" \
  --username "superadmin" --password "ChangeMe123!"
```

### 3.3 前端访问
- 前端地址：http://127.0.0.1:8086
- 测试账号：`superadmin / ChangeMe123!` (超级管理员) 或 `zhangsan / ChangeMe123!` (普通用户)

### 3.4 已知账号清单
| 用户名 | 密码 | 角色 |
|--------|------|------|
| superadmin | ChangeMe123! | super_admin |
| zhangsan | ChangeMe123! | user |
| lisi | ChangeMe123! | user |
| admin | admin123456 | admin |

---

## 四、关键文件路径

### 4.1 核心服务
- `brain-server/src/server.ts` - 主服务入口
- `brain-server/src/config.ts` - 配置管理
- `src/services/brainOrchestration/brainService.ts` - 大脑服务

### 4.2 前端
- `frontend/src/App.jsx` - 前端主组件
- `frontend/server.js` - 前端代理服务

### 4.3 Skills
- `skills/rag_query/SKILL.md` - RAG 技能定义
- `skills/rag_query/run_skill.py` - RAG 技能执行脚本
- `skills/cad_text_extractor/run_skill.py` - CAD 技能执行脚本

### 4.4 部署
- `deploy/docker-compose-brain-ts.yml` - Docker 编排

---

## 五、相关文档

- [项目进度总览](./project-progress-tracker-zh.md) - 完整迭代记录
- [项目摘要](./project-summary-zh.md) - 项目概述
- [AI 操作记录](./05_recordAiOperate.md) - 详细迭代日志
- [快速加载指南](./howtoload.md) - 快速启动指南
