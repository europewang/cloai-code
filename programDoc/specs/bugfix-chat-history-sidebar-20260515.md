# 智能问答历史会话侧边栏不显示修复记录

- 日期：2026-05-15
- 类型：前端 Bug 修复
- 范围：`frontend/src/App.jsx`、`frontend/src/components/AppSidebar.jsx`

## 问题现象

用户进入前端“智能问答”页面后，既有历史会话没有在左侧会话列表中显示，看起来像历史会话丢失。

## 使用 curl 的接口验证

已直接使用 `curl` 验证后端接口，确认历史会话数据真实存在，不是后端未返回：

### 管理员账号

- `POST /api/v1/auth/login` 登录成功
- `GET /api/v1/conversations?page=1&pageSize=50` 返回：
  - `id=4 title=test1`
  - `id=3 title=新对话`

### 普通用户账号 `zhangsan`

- `POST /api/v1/auth/login` 登录成功
- `GET /api/v1/conversations?page=1&pageSize=50` 返回 4 条历史会话：
  - `技能:RAG 检索`
  - `测试对话`
  - `测试对话`
  - `新对话`

结论：

- 后端接口正常
- 历史会话并未丢失
- 问题出在前端会话加载链路，而不是接口返回

## 根因

主因有两层：

1. `frontend/src/App.jsx` 中 `loadAppConversations()` 和 `handleAppLoadMore()` 仍在调用：
   - `normalizeConversationId(item)`
   - `normalizeConversationTitle(item)`

2. 这两个函数在聊天页迁移后已从 `App.jsx` 中移除，但调用点还保留着

结果是：

- 会话接口请求成功
- 映射会话列表时抛出 `ReferenceError`
- 异常又被原先的 `catch {}` 静默吞掉
- `chatConversations` 最终保持空数组
- 侧边栏因此显示“暂无对话”

次级问题是：

- `AppSidebar.jsx` 原先只按 `convOrder.pinned` / `convOrder.order` 渲染
- 即便未来再次出现排序状态脏数据，也可能导致部分历史会话不显示

## 修复

已做两层修复：

### 1. 修正 `App.jsx` 会话加载链路

- 在 `frontend/src/App.jsx` 中补回：
  - `normalizeConversationId`
  - `normalizeConversationTitle`
- 将原先静默的 `catch {}` 改为 `console.error(...)`
- 这样如果后续再发生类似问题，浏览器控制台能直接看到错误来源

### 2. 增强 `AppSidebar.jsx` 容错能力

- 增加会话列表容错合并逻辑：
  1. 优先按 `convOrder.pinned` 渲染置顶会话
  2. 再按 `convOrder.order` 渲染普通排序会话
  3. 最后把未命中的历史会话自动补到列表后面
- 进入“智能问答”页面时自动展开历史会话列表，避免视觉上误判为“没有会话”

## 验证

### 前端诊断

- `frontend/src/App.jsx` 无新增错误，仅保留历史 Hint
- `frontend/src/components/AppSidebar.jsx` 无错误

### 构建验证

```bash
cd frontend
npm run build
```

构建通过。

## 结论

本次问题不是后端会话丢失，而是前端在聊天页迁移后遗漏了 `App.jsx` 的会话标准化函数，导致会话加载成功却在映射阶段抛错并被静默吞掉；侧边栏容错修复则用于防止排序状态异常再次隐藏历史会话。
