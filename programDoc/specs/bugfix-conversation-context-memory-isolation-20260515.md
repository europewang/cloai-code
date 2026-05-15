# 会话上下文与用户记忆隔离修复记录

- 日期：2026-05-15
- 类型：后端上下文修复 + 前端记忆入口修复
- 范围：
  - `brain-server/src/routes/conversations.ts`
  - `src/services/brainOrchestration/brainService.ts`
  - `frontend/src/components/AppSidebar.jsx`
  - `frontend/src/App.jsx`

## 问题现象

用户反馈当前项目存在三类明显问题：

1. 某个用户新建的对话没有上下文，连续追问时像“失忆”
2. 记忆虽然有概念，但用户维度隔离感不明显
3. 前端“记忆管理”功能形同虚设，普通用户几乎无法使用

## 现状排查结论

### 1. 数据层本身已有用户级隔离

后端 Prisma 模型中：

- `Conversation` 绑定 `userId`
- `Message` 绑定 `conversationId`
- `MemoryProfile` 绑定 `userId`

同时 `brain-server/src/server.ts` 中已有：

- `ensureAndGetProfileByUserId(userId)`：每个用户自动派生默认 `profile-{userId}`
- `loadUserPermissionContext()`：当前用户总会把自己的 `profileId` 放入 `allowedMemoryProfiles`

因此：

- 数据模型层面并不是“完全没有用户隔离”
- 真正的问题出在“上下文没有送进脑服务”和“普通用户没有可用的记忆入口”

### 2. 脑服务未真正使用 `conversationId`

前端调用 `/api/v1/brain/query` 时已经传入 `conversationId`，后端 `brain-server/src/server.ts` 也把它转发给了 `brain-service`。

但 `src/services/brainOrchestration/brainService.ts` 里原先存在两个缺口：

1. `processQueryThroughBrainStream()` 没有接住并使用 `conversationId`
2. 脑服务只拉取了：
   - 权限预上下文
   - 当前 memory profile 内容

却没有把该对话的历史消息注入模型消息上下文。

结果就是：

- 即使消息已经保存在 conversations/messages 表中
- 模型推理时仍像在处理一条“孤立新问题”
- 用户体感就是“新建对话或连续追问都没有上下文”

### 3. 前端记忆入口只对管理员可见

`frontend/src/App.jsx` 里原先：

- `/memory` 路由仅 `admin/super_admin` 可见
- `frontend/src/components/AppSidebar.jsx` 中“记忆管理”也只出现在管理员菜单

这导致：

- 普通用户虽然在后端拥有自己的 `profile-{userId}`
- 但前端没有自然入口去查看和维护自己的记忆
- 因此“记忆功能形同虚设”

## 修复方案

## 1. 为当前用户增加正式的会话上下文接口

在 `brain-server/src/routes/conversations.ts` 中新增：

- `GET /api/v1/conversations/:id/context`

特性：

- 受 `authGuard` 保护
- 复用会话访问校验
- 只返回当前用户可访问对话的最近 N 条消息
- 返回顺序为时间正序，便于直接注入模型上下文

同时把原来的：

- `GET /api/v1/internal/conversations/:id/context`

也补上鉴权与访问校验，避免无鉴权读取会话上下文。

## 2. 脑服务真正注入对话历史

在 `src/services/brainOrchestration/brainService.ts` 中新增：

- `fetchConversationContextFromBrainServer()`
- `buildConversationHistoryMessages()`

处理逻辑：

1. 当本次 query 携带 `conversationId` 时，先从 brain-server 拉取最近历史消息
2. 将历史消息转换为内部 `Message[]`
3. 再把当前轮用户消息追加到历史之后送入模型

另外做了一个关键去重：

- 前端在发起流式问答前会先把当前用户消息保存到数据库
- 如果直接把最新历史整段拿来，再额外追加当前 query，会造成“当前轮用户消息重复”
- 因此现在会自动移除与当前 query 相同的最后一条用户消息，避免重复注入

## 3. 普通用户开放“记忆管理”入口

前端调整：

- `frontend/src/components/AppSidebar.jsx`
  - 将“记忆管理”移入通用菜单，所有登录用户可见
- `frontend/src/App.jsx`
  - `/memory` 路由改为所有已登录用户可访问

这样普通用户现在可以直接管理自己的默认记忆 profile。

## 设计结果

本次修改后，项目的“记忆与上下文”职责分层变为：

### 会话上下文

- 作用：保存并恢复某个具体 conversation 的最近消息历史
- 粒度：按 `conversationId`
- 用途：保证同一对话里的连续问题能带上下文

### 用户记忆

- 作用：保存当前用户长期稳定偏好、规则、常驻背景
- 粒度：按 `MemoryProfile -> userId`
- 用途：作为长期系统提示的一部分参与推理

### 两者关系

- 会话上下文：短期、当前对话级
- 用户记忆：长期、当前用户级
- 本次修复后两条链路都已进入脑服务

## 验证

### 代码诊断

- `brain-server/src/routes/conversations.ts`：无错误
- `src/services/brainOrchestration/brainService.ts`：无错误
- `frontend/src/components/AppSidebar.jsx`：无错误
- `frontend/src/App.jsx`：无新增错误，仅保留历史 Hint

### 构建验证

```bash
cd /home/ubutnu/code/cloai-code/frontend
npm run build

cd /home/ubutnu/code/cloai-code/brain-server
npm run build
```

均已通过。

### curl 验证

已验证普通用户 `zhangsan`：

- `POST /api/v1/auth/login` 登录成功
- `GET /api/v1/memory/profiles` 返回：
  - `currentProfileId = profile-49`
  - `allowedProfileIds = ["profile-49"]`
- `GET /api/v1/memory/current` 返回当前用户自己的记忆内容

说明：

- 用户级 memory profile 已实际隔离
- 普通用户本就有自己的 profile
- 这次前端入口开放后，该能力可以真正被用户使用

### 运行态上线验证

已按项目既有 Docker 方式执行：

```bash
cd /home/ubutnu/code/cloai-code
docker compose -f deploy/docker-compose-brain-ts.yml build brain-server brain
docker compose -f deploy/docker-compose-brain-ts.yml up -d brain-server brain
```

健康检查通过：

- `GET http://localhost:8091/api/ready`
- `GET http://localhost:3100/health`

上线后完成两组关键验证：

#### 1. 会话上下文接口在线生效

- `POST /api/v1/conversations` 创建测试会话，得到 `conversationId=50`
- `POST /api/v1/conversations/50/messages` 写入用户消息：
  - `请记住，我的名字叫赵六。`
- `GET /api/v1/conversations/50/context?limit=10` 返回：
  - 用户消息 `请记住，我的名字叫赵六。`
  - 助手消息 `收到。`

#### 2. 同一对话连续追问已带上上下文

- 对同一 `conversationId=50` 调用：

```json
{
  "query": "基于刚才对话，我叫什么名字？只回答名字。",
  "conversationId": "50"
}
```

- `POST /api/v1/brain/query` SSE 返回：

```text
赵六
```

这说明：

- 同一对话的历史上下文已经真实进入脑服务模型推理链路
- 不再是只有数据库里有消息、但模型看不到历史

### 前端运行态验证

在 `http://10.0.19.250:8087` 以普通用户 `zhangsan` 登录后，实测：

- 侧边栏已出现“记忆管理”
- 直接访问 `/memory` 可打开记忆页
- 页面中已显示：
  - `profile-49`
  - “刷新”按钮
  - “保存记忆”按钮
  - 记忆编辑文本框

说明普通用户现在不仅能看到入口，而且可以进入自己的记忆管理页面。

## 结论

本次问题的根因不是数据库层面没有用户隔离，而是：

1. 脑服务没有把 conversation 历史消息真正注入模型
2. 普通用户没有前端入口管理自己的记忆

修复后：

- 同一对话的上下文链路已补齐
- 用户级记忆仍保持按 `profile-{userId}` 隔离
- 普通用户可以直接在前端使用自己的记忆管理能力
