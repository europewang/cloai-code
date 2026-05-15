# 前端 AppShell 大件拆分方案

- 日期：2026-05-15
- 类型：前端架构重构规划
- 目标：让 `frontend/src/App.jsx` 从“超大业务文件”收敛为“应用编排层”
- 适用对象：后续继续接手前端重构的任意智能体或开发者

## 1. 背景

当前前端虽然已经完成以下改造：

1. 接入子路由，页面刷新可保持当前页面
2. 侧边栏独立为 `AppSidebar.jsx`
3. 技能弹窗、聊天输入区、消息流、工具草稿区已做第一轮拆分

但 `frontend/src/App.jsx` 仍然同时承担以下职责：

1. 认证态判断
2. 路由编排
3. 页面装配
4. 各一级栏目页面实现
5. 大量页面内局部交互

这导致 `App.jsx` 仍然过大，后续继续在文件内细拆，会出现“局部更清晰、整体仍然臃肿”的问题。

因此后续重构主线应调整为：

**优先按侧边栏一级栏目做大件拆分，再在各页面内部做二级拆分。**

---

## 2. 核心原则

### 2.1 App.jsx 的目标定位

`App.jsx` 最终应只负责：

1. 登录态读取与退出登录
2. 当前用户角色判断
3. 侧边栏渲染
4. 路由分发与页面装配
5. 少量跨页面共享状态注入

`App.jsx` 不应继续承载完整页面实现。

### 2.2 拆分优先级

优先级顺序必须是：

1. 一级栏目页面拆分
2. 页面内共享模块抽取
3. 页面内小组件进一步细拆

不要继续把主要精力放在 `App.jsx` 内部做局部 JSX 切片，而应先把整块页面迁出。

### 2.3 模块边界

页面模块按侧边栏一级导航划分，不按“某一段 JSX”划分。

原因：

1. 侧边栏就是天然的业务边界
2. 路由已与页面 ID 一一对应
3. 权限控制、懒加载、页面级测试都更适合按页面进行

---

## 3. 当前建议目录

建议逐步形成如下结构：

```text
frontend/src/
  App.jsx
  main.jsx
  components/
    AppSidebar.jsx
    SkillChatModal.jsx
    chat/
      ChatMessagesPanel.jsx
      ChatComposer.jsx
      ToolDraftCard.jsx
  pages/
    auth/
      LoginPage.jsx
    chat/
      ChatPage.jsx
    knowledge/
      KnowledgePage.jsx
    databases/
      DatabasePage.jsx
    skills/
      SkillLibraryPage.jsx
    models/
      ModelLibraryPage.jsx
    memory/
      MemoryPage.jsx
    admin/
      OverviewPage.jsx
      UserManagementPage.jsx
      PermissionPage.jsx
      SkillManagerPage.jsx
  utils/
    appRouting.js
    skillMentions.js
```

说明：

1. `pages/` 只放一级页面
2. 页面内部的局部组件继续放各页面自己的子目录，或保留在 `components/`
3. 公共逻辑再视复用度下沉到 `components/` 或 `hooks/`

---

## 4. 一级栏目与目标页面映射

### 4.1 普通一级栏目

| 侧边栏栏目 | 当前来源 | 目标页面文件 |
|---|---|---|
| 智能问答 | `ChatInterface` | `pages/chat/ChatPage.jsx` |
| 知识库 | `DatasetManager` | `pages/knowledge/KnowledgePage.jsx` |
| 数据库 | `DatabaseLibrary` | `pages/databases/DatabasePage.jsx` |
| 技能库 | `SkillLibrary` | `pages/skills/SkillLibraryPage.jsx` |
| 模型库 | `ModelLibrary` | `pages/models/ModelLibraryPage.jsx` |
| 记忆管理 | `MemoryManager` | `pages/memory/MemoryPage.jsx` |

### 4.2 管理员栏目

| 侧边栏栏目 | 当前来源 | 目标页面文件 |
|---|---|---|
| 管理员总览 | `SuperAdminOverview` | `pages/admin/OverviewPage.jsx` |
| 用户管理 | `UserManagement` | `pages/admin/UserManagementPage.jsx` |
| 权限分配 | `PermissionManager` | `pages/admin/PermissionPage.jsx` |
| 技能管理 | `SkillManager` | `pages/admin/SkillManagerPage.jsx` |

### 4.3 其他独立页面

| 页面 | 当前来源 | 目标页面文件 |
|---|---|---|
| 登录 | `LoginScreen` | `pages/auth/LoginPage.jsx` |
| 路由样例/审计类页 | `RouteSampleManager` | 可后续单独规划 |

---

## 5. 推荐拆分顺序

### 第一批：优先拆最重的三个一级页面

1. `ChatInterface -> pages/chat/ChatPage.jsx`
2. `DatasetManager -> pages/knowledge/KnowledgePage.jsx`
3. `DatabaseLibrary -> pages/databases/DatabasePage.jsx`

原因：

1. 这三块体量最大
2. 交互最复杂
3. 拆完后 `App.jsx` 体积会明显下降

### 第二批：拆结构相似的库页面

1. `SkillLibrary -> pages/skills/SkillLibraryPage.jsx`
2. `ModelLibrary -> pages/models/ModelLibraryPage.jsx`

原因：

1. 两者和数据库/知识库有明显相似的分组、导航、卡片结构
2. 便于后续抽共享分组基础件

### 第三批：拆后台页面

1. `SuperAdminOverview`
2. `UserManagement`
3. `PermissionManager`
4. `SkillManager`
5. `MemoryManager`

原因：

1. 管理页之间依赖相对更弱
2. 页面边界清晰

### 第四批：抽共享基础件和 hooks

优先考虑抽出：

1. 分组导航组件
2. 分组区块组件
3. 分组分配弹窗
4. 通用拖拽分组 hook
5. 用户设置持久化 hook

---

## 6. 具体实施方式

### 6.1 每次迁移一个页面时的标准动作

1. 先把该页面的主组件整体迁出到 `pages/`
2. 保持原有 props 和行为不变
3. 在 `App.jsx` 里只保留 import + 页面装配
4. 页面迁出后再做页面内二级拆分

### 6.2 推荐做法

推荐：

1. 先“整块搬走”，后“内部清理”
2. 每次只迁移 1 到 3 个一级页面
3. 每完成一批就做构建验证和诊断

不推荐：

1. 先在 `App.jsx` 里继续切很多小组件，但页面仍留在原地
2. 一次性重构所有页面，回归风险太高
3. 同时改动页面逻辑和架构边界，难以定位问题

### 6.3 保持兼容的要求

迁移过程中必须确保以下能力不变：

1. 路由路径不变
2. 侧边栏排序逻辑不变
3. 用户设置持久化不变
4. 权限可见性不变
5. 现有页面交互和文案不做无关变更

---

## 7. 页面迁出后的 App.jsx 目标形态

迁移完成后，`App.jsx` 应接近如下职责模型：

1. 读取 `location`
2. 读取认证态和当前用户信息
3. 渲染 `Sidebar`
4. 渲染 `<Routes>`
5. 以 props 形式给页面传递必要依赖

可以把 `App.jsx` 理解为：

**应用壳层（AppShell） + 页面装配器（Page Composer）**

而不是：

**大而全的业务实现文件**

---

## 8. 后续智能体执行指南

后续智能体接手时，优先遵循以下顺序：

1. 先读本文件
2. 再读 `programDoc/progress.md`
3. 再读 `programDoc/changelog.md`
4. 再定位 `frontend/src/App.jsx` 中待迁移页面

### 单次任务建议模板

如果后续智能体继续执行，可按以下任务描述理解目标：

1. 将一个或多个一级页面从 `App.jsx` 迁移到 `frontend/src/pages/`
2. 不改变现有页面行为
3. 迁移后进行 `GetDiagnostics` 与 `npm run build`
4. 更新 `programDoc/changelog.md`、`programDoc/progress.md`
5. 若有阶段性架构变化，再追加更新本方案文档

### 推荐的下一步执行批次

最优先下一批：

1. `ChatPage`
2. `KnowledgePage`
3. `DatabasePage`

如果只做一项，优先：

1. `ChatPage`

因为它最复杂，也最能验证“AppShell 化”的边界是否合理。

---

## 8.1 当前迁移进展补充

截至 2026-05-15 当日晚些时候，第一批大件拆分已有以下落地结果：

1. `ChatInterface -> frontend/src/pages/chat/ChatPage.jsx` 已完成
2. `DatasetManager -> frontend/src/pages/knowledge/KnowledgePage.jsx` 已完成
3. `frontend/src/lib/appApi.js` 已开始承接页面迁移所需共享 API
4. `frontend/src/App.jsx` 已用页面级路由装配 `ChatPage` 和 `KnowledgePage`

这意味着下一步的最高优先级已经收敛为：

1. `DatabaseLibrary -> frontend/src/pages/databases/DatabasePage.jsx`
2. 迁移完成后清理 `App.jsx` 中已失效的页面实现和旧 helper
3. 再继续处理 `SkillLibrary` 与 `ModelLibrary`

---

## 9. 当前状态结论

截至 2026-05-15：

1. 路由壳层已经建立
2. 侧边栏已经独立
3. `ChatPage` 已完成页面级迁移
4. `KnowledgePage` 已完成页面级迁移
5. 下一阶段主线不应继续只做细粒度切片
6. 下一阶段主线应继续：**按侧边栏一级栏目做大件迁移**

这份文档即作为后续前端重构的统一执行说明。
