# 变更日志

> 更新时间：2026-05-15（第十七次）
> 作用：每次重要改动后追加，按时间倒序排列。

---

## 2026-05-15（第十七次）资源卡片左上角移出按钮改为悬浮显示 ✅

**需求**：
1. 知识库、技能库、数据库、模型库中的内容卡片，左上角 `×` 不要持久显示
2. 只有鼠标悬浮到卡片上时才显示，并与右上角操作区交互一致

**修改**：
- 在 `frontend/src/App.jsx` 的共享分组卡片容器中补充 `group`
- 将左上角“移出分组”按钮改为：
  - 默认 `opacity-0`
  - 悬浮时 `group-hover:opacity-100`
  - 聚焦时 `focus:opacity-100`
- 在 `frontend/src/pages/knowledge/KnowledgePage.jsx` 中同步相同改法

**影响范围**：
- 知识库卡片
- 技能库卡片
- 数据库卡片
- 模型库卡片

**验证**：
- `KnowledgePage.jsx` 诊断无错误
- `App.jsx` 无新增错误，仅保留历史 Hint
- 本地执行 `cd frontend && npm run build` 通过 ✅

**专项文档**：
- `programDoc/specs/bugfix-card-hover-remove-button-20260515.md`

---

## 2026-05-15（第十六次）智能问答历史会话侧边栏显示修复 ✅

**问题**：
1. 用户反馈已有历史会话在前端“智能问答”侧边栏中不显示
2. 视觉上表现为“历史对话不见了”

**排查**：
- 使用 `curl` 直接验证后端接口：
  - 管理员账号 `GET /api/v1/conversations` 返回 2 条历史会话
  - 普通用户 `zhangsan` 返回 4 条历史会话
- 结论是后端会话数据存在，问题不在接口返回
- 继续排查代码后确认：`frontend/src/App.jsx` 仍在调用 `normalizeConversationId/Title`，但函数定义在聊天页迁移时被一起移走了

**根因**：
- `App.jsx` 会话加载成功后，在映射会话数据阶段触发 `ReferenceError`
- 原先异常被 `catch {}` 静默吞掉，导致 `chatConversations` 一直保持空数组
- 同时 `AppSidebar.jsx` 对排序状态缺少兜底，也会放大“历史会话不显示”的现象

**修复**：
- 在 `frontend/src/App.jsx` 中补回 `normalizeConversationId` 和 `normalizeConversationTitle`
- 将静默 `catch {}` 改为 `console.error(...)`
- 在 `frontend/src/components/AppSidebar.jsx` 中增加历史会话兜底合并逻辑
- 进入“智能问答”页时自动展开会话列表，避免误判为“没有会话”

**验证**：
- `AppSidebar.jsx` 诊断无错误
- 本地执行 `cd frontend && npm run build` 通过 ✅

**专项文档**：
- `programDoc/specs/bugfix-chat-history-sidebar-20260515.md`

---

## 2026-05-15（第十五次）知识库页迁移到独立页面 ✅

**需求**：
1. 按侧边栏一级栏目做大件拆分，让 `App.jsx` 继续退回编排层
2. 在已完成 `ChatPage` 的基础上，继续迁出知识库页
3. 保持知识库列表、分组、详情、文档上传/解析/预览等能力不变

**改动概述**：

### 页面迁移
- 新增 `frontend/src/pages/knowledge/KnowledgePage.jsx`
- 将原 `DatasetManager` 的主流程迁移为独立页面路由组件
- 知识库页内部同时收纳了知识库详情、文档表格、文档预览、分组导航、拖拽落组等专属子组件
- `frontend/src/App.jsx` 的知识库路由改为直接装配 `KnowledgePage`

### 共享 API 抽离
- 扩展 `frontend/src/lib/appApi.js`
- 新增知识库页相关接口封装：
  - `fetchDatasets`
  - `createDataset`
  - `updateDatasetShare`
  - `deleteDataset`
  - `deleteDatasets`
  - `updateDataset`
  - `updateDocument`
  - `fetchDocuments`
  - `uploadDocument`
  - `deleteDocuments`
  - `runDocuments`
  - `getDocumentFile`
  - `fetchChunks`
- 让页面级迁移不再依赖 `App.jsx` 内部 API helper

### AppShell 收敛进展
- `ChatPage` 已独立
- `KnowledgePage` 已独立
- `App.jsx` 继续从“页面实现文件”收敛为“路由装配层”
- 下一优先迁移目标收敛为 `DatabasePage`

**验证**：
- `GetDiagnostics`：
  - `frontend/src/pages/knowledge/KnowledgePage.jsx` 无错误
  - `frontend/src/lib/appApi.js` 无错误
- 本地执行 `cd frontend && npm run build` 通过 ✅

**专项文档**：
- `programDoc/specs/bugfix-frontend-routing-sidebar-chat-20260515.md`
- `programDoc/specs/frontend-app-shell-refactor-plan-20260515.md`

---

## 2026-05-15（第十四次）前端路由、侧边栏排序与智能问答输入改造 ✅

**需求**：
1. 侧边栏“智能问答”支持与其他栏目一致的自由拖拽排序
2. 智能问答页移除记忆 profile 输入和默认提示语
3. 输入框 `@技能` 自动弹出候选，并按使用频率排序，统一语义为“请使用 xxx 技能”
4. 刷新页面时保持当前页面，且默认首页取侧边栏排序后的第一项
5. 拆分过大的 `frontend/src/App.jsx`

**改动概述**：

### 路由与默认页
- `frontend/src/main.jsx` 接入 `BrowserRouter`
- 新增 `frontend/src/utils/appRouting.js`，统一管理 `tab -> path` 映射
- `App` 改为从 URL 推导当前页面，并用 `<Routes>` 渲染各页面
- 根路径 `/` 和未知路径统一跳转到“当前侧边栏排序后的第一项”

### 侧边栏排序
- 新增 `frontend/src/components/AppSidebar.jsx`
- 将“智能问答”从固定项改为可拖拽项，和其余菜单共享同一套排序逻辑
- 侧边栏顺序继续按用户维度保存在本地存储

### 智能问答输入精简与增强
- 移除“当前记忆 profile（可选）”输入框
- 移除输入框下方预置示例语句
- 新增 `frontend/src/utils/skillMentions.js`
- `@技能` 候选按“关键字匹配 + 使用频率 + 名称”排序
- 匹配到 `@技能名` 后统一改写为“请使用 xxx 技能”

### 代码拆分
- 新增 `frontend/src/components/SkillChatModal.jsx`
- 新增 `frontend/src/components/chat/ChatMessagesPanel.jsx`
- 新增 `frontend/src/components/chat/ChatComposer.jsx`
- 新增 `frontend/src/components/chat/ToolDraftCard.jsx`
- `App.jsx` 删除内联的侧边栏与技能弹窗实现，职责收敛到应用壳层和页面编排
- 新文件补充了关键注释，说明拖拽排序、路由默认页和技能语义改写逻辑
- `ChatInterface` 继续拆分为“消息流 / 输入区 / 技能草稿区”三个独立组件
- 新增长期重构方案文档 `programDoc/specs/frontend-app-shell-refactor-plan-20260515.md`，作为后续智能体执行“按侧边栏一级栏目拆分 `App.jsx`”的统一说明

### 追加修复
- 修复数据库页面运行时报错：`Plus is not defined`
- 原因为图标导入遗漏，已在 `frontend/src/App.jsx` 补回 `Plus`

**验证**：
- 未启动 Docker
- 本地执行 `cd frontend && npm run build` 通过 ✅

**专项文档**：
- `programDoc/specs/bugfix-frontend-routing-sidebar-chat-20260515.md`

---

## 2026-05-14（第十三次）分组交互彻底改造：移除"全部"按钮 + 空分组常显 + 点击滚动定位 ✅

**需求**：
1. 所有分组始终全部显示（空分组常显，不隐藏）
2. 移除"全部"按钮（无意义）
3. 点击分组只做页面滚动定位，不做过滤/隐藏

**改动概述**：

### GroupNavBar 组件（4 处调用点同步更新）
- **移除** `activeGroupId` prop（无视觉高亮状态）
- **移除** IntersectionObserver（不再需要页面滚动自动高亮联动）
- **移除** "全部"按钮
- 导航栏仅保留：自定义分组按钮 + 新建分组按钮
- 视觉风格统一：白底灰字边框，无蓝色高亮

### 四个模块统一改造（DatasetManager / DatabaseLibrary / SkillLibrary / ModelLibrary）
| 模块 | 改动 |
|---|---|
| DatasetManager | `activeGroupId` → `scrollGroupId`（仅滚动用）；移除 `currentDatasets` useMemo；移除 `__all__` skip 条件 |
| DatabaseLibrary | 同上，移除 `currentDbs` useMemo 和 skip 条件 |
| SkillLibrary | 同上，移除 `currentSkills` useMemo 和 skip 条件 |
| ModelLibrary | 同上，移除 `currentModels` useMemo 和 skip 条件 |

### 渲染逻辑
- 所有分组（即使为空）始终渲染 `DroppableGroupSection` 区块
- 空分组显示 "暂无内容" 占位文字（灰色虚线框）
- 拖拽进入时高亮蓝色，松开提示"拖拽到这里"
- 点击分组按钮 → 页面平滑滚动到该分组区块（`group-section-{id}` 锚点，偏移 -64px 避开 sticky 导航栏）

**涉及文件**：`frontend/src/App.jsx`

**部署**：`npm run build && docker cp dist/. ai4kb-frontend:/app/dist/ && docker cp dist/. ai4kb-frontend-dev:/app/dist/`

**验证**：8086/8087 均 200，知识库/技能库/数据库/模型库四个模块均已测试通过。

---

## 2026-05-14（第十二次）空分组隐藏条件修复 ✅

**问题描述**：创建空分组后，在"全部"视图下该分组区块不显示（需要点击该分组才显示）。

**根因**：四个模块的渲染条件为：
```js
// ❌ 修复前 — `&& groupXxx.length === 0` 条件：当分组内容为空时返回 null
if (activeGroupId !== '__all__' && activeGroupId !== group.id && group.id !== '__ungrouped__' && groupDs.length === 0) return null
```

这导致在非"全部"视图时（`activeGroupId !== '__all__'`），空分组仍然被隐藏。更关键的是，即使在"全部"视图，如果 `IntersectionObserver` 触发时将 `activeGroupId` 设为空分组ID，空分组也会被隐藏。

**修复**：将四个模块的条件统一改为：
```js
// ✅ 修复后 — 完全移除长度判断，空分组始终可见
if (activeGroupId !== '__all__' && activeGroupId !== group.id && group.id !== '__ungrouped__') return null
```

**涉及文件**：`frontend/src/App.jsx`
- DatasetManager 第 3235 行
- DatabaseLibrary 第 10214 行
- SkillLibrary 第 10526 行
- ModelLibrary 第 11071 行

**验证**：`npm run build && docker cp dist/. ai4kb-frontend-dev:/app/dist/ && docker cp dist/. ai4kb-frontend:/app/dist/`
- 旧模式 `length === 0 && activeGroupId` 已全部移除 ✅
- 新 skip 条件 4/4 正确 ✅
- 前端服务正常（8087/8086 均 200）✅

---

## 2026-05-14（第十一次）空分组占位显示修复 ✅

**问题描述**：创建分组后即使没有内容也不显示"暂无内容"占位，分组区块完全消失。

**根因**：四个模块的渲染逻辑中，空分组条件判断将 `groupDs.length === 0` 放在 `&&` 链首，导致无内容时直接 `return null`。

**修复**：`frontend/src/App.jsx` 四处位置，将条件从：
```js
// ❌ 修复前
if (groupDs.length === 0 && activeGroupId !== '__all__' && ...group.id !== '__ungrouped__') return null
```
改为：
```js
// ✅ 修复后
if (activeGroupId !== '__all__' && activeGroupId !== group.id && group.id !== '__ungrouped__' && groupDs.length === 0) return null
```

**涉及文件**：`frontend/src/App.jsx` 第 3233、10204、10508、11073 行

**验证**：`npm run build` → `docker cp dist/. ai4kb-frontend:/app/dist/ && docker cp dist/. ai4kb-frontend-dev:/app/dist/`
- 旧模式已全部移除 ✅
- 新模式 4/4 全部正确 ✅
- 前端服务正常（8087、8086 均 200）✅

---

**问题描述**：知识库、技能库、数据库、模型库拖拽分组后重新打开页面，数据丢失，分组不持久化。

**根因排查过程**：
1. 前端代码审查：`loadGroups`/`saveGroups` 实现正确，API 调用路径正确
2. 数据库直接测试：PATCH 返回 `{"success": true}` 但 `models` 字段未写入 DB
3. 容器代码检查：**容器内 `userSettings.js` 是旧版本（May 12），不包含 `models`/`skills`/`databases`/`knowledge` 字段**
4. **根因确认**：`ai4kb-brain-server` 容器自 5 月 12 日后未重新部署新编译代码，`saveSettingsSchema` 缺少必要字段导致 Zod 校验静默失败

**修复措施**：
- `brain-server/src/routes/userSettings.ts`：`saveSettingsSchema` 增加独立 `knowledge`/`skills`/`databases`/`models` 四个 flat array 字段
- 编译：`npx tsc -p tsconfig.json`
- 部署：`docker cp dist/. ai4kb-brain-server:/app/dist/ && docker restart ai4kb-brain-server`
- 前端：`npm run build && docker cp dist/. ai4kb-frontend:/app/dist/ && docker cp dist/. ai4kb-frontend-dev:/app/dist/`

**验证结果**（curl 全链路测试）：
- `PATCH /v1/user/settings { models: [...] }` → 返回 200，DB 确认写入 ✅
- `PATCH /v1/user/settings { skills: [...] }` → 返回 200，DB 确认写入 ✅
- `PATCH /v1/user/settings { databases: [...] }` → 返回 200，DB 确认写入 ✅
- `PATCH /v1/user/settings { knowledge: [...] }` → 返回 200，DB 确认写入 ✅
- 重新 GET 可正确读取已保存数据 ✅
- 通过前端代理（`localhost:8087`）全链路测试通过 ✅

**教训**：容器内代码版本可能与主机源码不同步，排查持久化问题时必须同时检查容器内实际运行的代码。

---

## 2026-05-14（第九次）四大模块分组功能 Bug 修复 ✅

**概述**：修复空分组不显示、拖拽高亮延迟、技能库移除无效、模型库分组不持久化四个问题。

### 问题1：空分组不显示
- **根因**：四个模块在渲染分组区块时，当 `groupDs.length === 0` 且 `activeGroupId` 既不是"全部"也不是当前分组时，直接 `return null`，导致空分组完全不渲染
- **修复**：增加 `&& group.id !== '__ungrouped__'` 条件，使空的自定义分组始终显示带"暂无内容"占位的区块，方便用户感知可拖入内容
- **涉及**：DatasetManager、DatabaseLibrary、SkillLibrary、ModelLibrary

### 问题2：拖拽分组高亮触发延迟
- **根因**：DndContext 使用 `collisionDetection={closestCenter}`，只在鼠标指针精确落在 droppable 区域中心时才触发碰撞检测，导致需要拖到分组正中央才高亮
- **修复**：改用 `rectIntersection` 碰撞检测（@dnd-kit/core 内置），当拖拽卡片进入分组区块的矩形范围时即触发高亮，体验更流畅
- **涉及**：DatasetManager、DatabaseLibrary、SkillLibrary、ModelLibrary

### 问题3：技能库移除按钮无效
- **根因**：`DroppableGroupSection` 调用 `onRemove(ds.id)`，而技能库传的是 `onRemove={(skillName) => handleRemoveFromGroup(group.id, skillName)}`，但实际 `renderCard` 回调传回的是技能对象 `s` 而非字符串，导致 `filter(n => n !== s)` 比对失败（字符串 vs 对象），移除不生效
- **修复**：改为 `onRemove={(skill) => handleRemoveFromGroup(group.id, skill.name)}`，正确传递 skill 对象的 name 字段
- **涉及**：SkillLibrary

### 问题4：模型库分组不持久化
- **根因**：`ModelLibrary` 的 `loadGroups` 读取后端响应时，只检查 `data?.groups`，但 `PATCH /v1/user/settings` 保存时后端以 `models` 字段存储，`type=models` GET 返回的是 `data.models` 而非 `data.groups`，导致下次加载分组数据永远为空
- **修复**：`loadGroups` 增加 `Array.isArray(data?.models)` 分支，正确读取 `data.models`
- **涉及**：ModelLibrary

---

## 2026-05-13（第八次）固定标签体系（固定标签 + 自定义分组双模式） ✅

### 后端 API 变更
- `server.ts`：GET `/v1/admin/datasets` 响应加入 `fixedLabel`，POST 接受 `fixedLabel` 参数
- `server.ts`：PUT `/v1/admin/datasets/:id` 支持 `fixedLabel` 更新，PATCH `/v1/admin/datasets/:id` 独立更新标签
- `resources.ts`：`/api/v1/kb` GET/POST/PUT，`/api/v1/models` GET/POST/PUT，`/api/v1/db-connections` GET/POST 均加入 `fixedLabel`
- `resources.ts`：新增 `PATCH /api/v1/kb/:id/fixed-label`、`PATCH /api/v1/db-connections/:id/fixed-label`、`PATCH /api/v1/models/:id/fixed-label`
- `skills.ts`：GET `/v1/skills`、GET `/v1/skills/:name`、PUT `/v1/skills/:name` 响应加入 `fixedLabel`，新增 `PATCH /v1/skills/:name/fixed-label`
- `userSettings.ts`：GET 按 type 返回 `{ groups, viewMode }`，PATCH 接受 `viewMode` 结构

### 前端变更
- 全局定义 `FIXED_LABELS` 常量、`FixedLabelBadge` 组件、`FixedLabelPicker` 组件、`FixedGroupNavBar` 组件
- 四个模块（知识库/技能库/数据库/模型库）各自：
  - Header 添加 ⚙️ 设置按钮，点击弹出视图模式切换菜单
  - Header 创建表单加入标签下拉选择
  - 支持 `viewMode` 状态，保存到后端
  - 固定模式：显示7个固定标签分组，`FixedGroupNavBar` 横向标签导航，点击标签滚动到对应区块
  - 自定义模式：保留原有的 `GroupNavBar` + 用户自定义分组
  - 卡片左上角显示 `FixedLabelBadge`
  - admin/super_admin 可点击标签进入编辑弹窗修改标签

---

## 2026-05-13（第七次）前端：技能库/数据库/模型库分组存储隔离 + 数据库迁移 ✅

**问题**：技能库/数据库/模型库三个模块共用同一个 `groups` 字段，PATCH 时互相覆盖，导致分组混乱。

**后端改动**：
- `brain-server/src/routes/userSettings.ts`：GET/PATCH 支持独立的 `skills`/`databases`/`models` 三个 key（flat array 格式）
- GET 按 `type` 参数读对应字段：`type=skills → settings.skills`，`type=databases → settings.databases`，`type=models → settings.models`
- PATCH 接受 `skills`/`databases`/`models` flat array 格式
- 保留 `groups` 旧格式兼容（仅 GET 读取 fallback），PATCH 不再接收 `groups` 字段

**前端改动**（三个模块各自独立）：
- `DatabaseLibrary`：`loadGroups` → `GET /v1/user/settings?type=databases`，`saveGroups` → `PATCH { databases: newGroups }`
- `SkillLibrary`：`loadGroups` → `GET /v1/user/settings?type=skills`，`saveGroups` → `PATCH { skills: newGroups }`
- `ModelLibrary`：`loadGroups` → `GET /v1/user/settings?type=models`，`saveGroups` → `PATCH { models: newGroups }`

**数据库迁移**：
- 新建 `brain-server/src/scripts/migrateGroupsToModules.ts` 一次性脚本
- 将 `settings.groups`（旧测试数据）迁移到 `settings.skills`
- 清除 `settings.groups` 字段，避免 fallback 干扰
- 已执行：14 个用户扫描，2 个有旧数据，迁移完成

**部署**：`docker cp dist/. ai4kb-brain-server:/app/dist/` + `docker restart ai4kb-brain-server` ✅

---

## 2026-05-13（第六次）前端：分组持久化调试日志 + 拖拽视觉修复 + 导航增强 ✅

**概述**：修复技能库/数据库/模型库分组不持久化、拖拽时分组标题悬浮不动、点击分组标签无法跳转三个问题。

### 问题1：技能库/数据库/模型库分组不持久化

**根因**：`saveGroups` / `loadGroups` 对错误静默吞掉（`catch {}`），API 调用失败时无任何日志。

**修复**（四个模块统一实施）：
- `loadGroups`：增加 `!res.ok` 分支 `console.error`，`catch` 打印错误对象
- `saveGroups`：对非 2xx 响应 `console.error` 打印状态码和响应体，`catch` 打印错误对象
- `loadGroups` 增加数组类型兜底判断，打印 `unexpected data shape` 警告

### 问题2：拖拽卡片时分组标题悬浮不动

**根因**：`DroppableGroupSection` 标题栏使用 `sticky top-[56px]`，在页面滚动时标题吸附在顶部不动，卡片在其下方滚动，看起来标题"悬浮"在移动的卡片上方。

**修复**：
- 移除标题栏的 `sticky top-[56px] z-10`
- 外层容器加 `flex flex-col` 使标题自然位于内容上方
- 外层移除 `sticky`，改为内容区各自 `pt-6` 避开顶部导航栏
- 空状态文案改为通用 "暂无内容" / "拖拽到这里"（适配所有四个模块）

### 问题3：点击分组标签无法跳转 / "全部"按钮滚动位置错误

**根因**：
1. `GroupNavBar` "全部"按钮 `scrollTo({ top: 0 })` 导致页面停在 sticky 导航栏下方，内容仍被遮盖
2. `SkillLibrary`/`ModelLibrary`/`DatabaseLibrary` 调用 `GroupNavBar` 时未传 `onRenameGroup`，导致无法重命名分组

**修复**：
- "全部"按钮改为 `scrollTo({ top: -62 })`（向上偏移绕过 sticky 导航栏高度）
- 分组点击改为 `offset = top - 64`（导航栏高度 56px + 8px 空隙）
- `SkillLibrary`/`ModelLibrary`/`DatabaseLibrary` 的 `GroupNavBar` 均添加 `onRenameGroup` 处理函数

**部署**：`npm run build` + `docker cp dist/. ai4kb-frontend:/app/dist/` + `docker restart ai4kb-frontend` ✅

---

## 2026-05-13（第五次）前端：知识库卡片遮挡修复 + 技能库/数据库/模型库拖拽分组功能补全 ✅

**概述**：修复知识库卡片被遮盖问题，并将拖拽分组功能扩展到技能库、数据库、模型库。

### 问题1：知识库卡片被遮盖

**根因**：`renderDatasetCard` 用 `<div key={ds.id} style={{ opacity: 0, transform: 'translateY(16px)' }} className="animate-fade-in">` 包裹，导致卡片初始 opacity=0，在动画未生效或 DOM 更新时不可见。

**修复**：
- 移除 `renderDatasetCard` 中多余的 `<div>` 包裹和 `animate-fade-in` 样式，直接返回 `DatasetCard` 组件
- 统一 `DroppableGroupSection` section header 的 sticky 定位为 `top-[56px]`，与其他三个模块一致

### 问题2：技能库/数据库/模型库缺少拖拽功能

**根因**：之前仅在知识库（`DatasetManager`）实现了拖拽分组，其余三个模块仅有分组导航栏和分组分配弹窗，没有 DragContext 和可拖拽卡片。

**修复**（三个模块统一实施）：

**DatabaseLibrary**：
- 添加拖拽状态：`activeId`、`overGroupId`、`sensors`
- 添加 `handleDragStart`、`handleDragOver`、`handleDragEnd` 处理函数
- 添加 `SortableCard` 组件（用 `useSortable` 包装数据库卡片）
- 用 `DndContext + DragOverlay` 包裹内容区
- 将分组区块渲染替换为 `DroppableGroupSection` 组件
- 修复 `loadGroups` 未被调用的问题（原来 `useEffect(() => { if (groups.length > 0) {} })` 无效，改为 `useEffect(() => { loadGroups() }, [loadGroups])`）

**SkillLibrary**：
- 添加拖拽状态、handler、传感器
- 添加 `SortableSkillCard` 组件（用 `useSortable` 包装技能卡片）
- 用 `DndContext + DragOverlay` 包裹内容区
- 将分组区块渲染替换为 `DroppableGroupSection` 组件

**ModelLibrary**：
- 添加拖拽状态、handler、传感器
- 添加 `SortableModelCard` 组件（用 `useSortable` 包装模型卡片）
- 用 `DndContext + DragOverlay` 包裹内容区
- 将分组区块渲染替换为 `DroppableGroupSection` 组件

**共同行为**：
- 拖拽卡片时卡片变为半透明（opacity: 0.35）
- 鼠标经过分组区域时背景高亮 + "松开鼠标加入该分组" 提示
- 松开后自动归属到新分组，导航栏计数实时更新
- 分组数据通过 `/v1/user/settings` API 持久化到后端

**部署**：`docker cp dist/. ai4kb-frontend:/app/dist/ && docker restart ai4kb-frontend` ✅

---

## 2026-05-13（第四次）前端：知识库分组持久化 + 拖拽功能 + 空对象 Bug 修复 ✅

**概述**：修复知识库分组无法持久化、拖拽功能缺失、知识库列表不显示三个问题。

### 问题1：创建分组后切换页面再回来消失
**根因**：`DatasetManager` 用 `localStorage` 存分组，换浏览器/清缓存/换设备就没了
**修复**：`DatasetManager` 分组改为调用后端 API `/v1/user/settings?type=knowledge` 加载和保存，与技能库/数据库/模型库保持一致。

### 问题2：知识库页面看不到已有知识库（superadmin 登录只显示"未分组(12)"但无内容）
**根因**：`loadGroups` 接收后端返回的 `{}`（空对象，superadmin 尚未创建分组时返回）后，`Array.isArray({})` 返回 `false`，`datasetGroups` 被设为 `{}` 对象。随后 `datasetGroups.flatMap()` 在对象上调用导致 React 渲染崩溃，整个组件树空白。
**修复**：`loadGroups` 增加兜底判断，确保 `datasetGroups` 永远是数组。同时修复 `brain-server` 的 GET 逻辑，让 `type=knowledge` 时正确返回 `settings.knowledge`（数组）而非空对象。

### 问题3：各个区块不可拖拽到各个分组
**修复**：
- 引入 `@dnd-kit` 的 `useDroppable`
- 创建 `DroppableGroupSection` 组件（分组区块 + 放置目标区域，hover 高亮 + 拖拽提示）
- `SortableDatasetCard` 包装知识库卡片（`useSortable`）
- `handleDragStart/Over/End` 实现拖拽结束时自动将卡片加入目标分组，松开后高亮消失

### 后端 Schema 修复
`brain-server/src/routes/userSettings.ts`：
- `knowledge` 字段从 `z.record(...)` 改为 `z.array(...)`（匹配前端发送的 flat array 格式）
- GET 时 `type=skills/databases/models` 额外兼容读取 `settings.groups`（flat array 格式）

**改动文件**：
- `frontend/src/App.jsx`（`loadGroups`/`saveGroups` 重构 + 拖拽功能 + `DroppableGroupSection`）
- `brain-server/src/routes/userSettings.ts`（Schema + GET 逻辑）
- `programDoc/changelog.md`（本文档）
- `programDoc/progress.md`（进度更新）

**验证**：http://localhost:8087/ → superadmin 登录 → 知识库页面应正常显示12个知识库，可以创建分组、拖拽卡片加入分组、切换页面分组持续保留。

**问题修复**：
- `DatabaseLibrary`：`currentItems` 未定义（引用错误），修复为 `currentDbs`；添加 `activeGroupId` state、`navGroups`、`GroupNavBar` 渲染
- `ModelLibrary`：添加缺失的 `activeGroupId` state、`navGroups`/`sectionGroups`/`currentModels` 定义；修复「添加模型」按钮只切换 `groupMode` 不展开表单的 bug
- `GroupNavBar`：`navGroups.length > 0 &&` 条件导致无分组时导航栏不显示 → 改为始终渲染，保证「全部」按钮始终可见

**交互增强**：
- `GroupNavBar` 滚动联动：IntersectionObserver 触发后自动将高亮卡片滚动到可视区域（`scrollIntoView`）
- `GroupNavBar` 卡片内操作：hover 分组卡片时显示编辑/删除按钮（`group/card` CSS 组合类实现），点击编辑弹出 `window.prompt` 重命名
- `GroupNavBar` scroll offset 优化：`Math.max(0, offset)` 防止滚动到负值区域

---

## 2026-05-13（第四次）前端：四大模块修复 — 白屏/遮挡/空分组问题 ✅

**根因分析**：
1. **ModelLibrary 白屏**：重构后引入 `renderModelCard` 引用但函数不存在（原来内联 `models.map`，重构时遗漏）
2. **知识库只显示"未分组(12)"**：① `navGroups` 缺少"未分组"虚拟分组 ② 分组区块内部 `sectionGroups.map` 使用 `currentDatasets.filter` 二次过滤导致空结果
3. **技能库被导航栏遮盖**：`GroupSection` 的 `sticky top-[52px]` 在 flex 布局中相对于滚动容器定位，被导航栏覆盖
4. **数据库/模型库白屏**：`sectionGroups.map` 使用 `currentModels.filter` / `currentDbs.filter` 二次过滤（根因同上）

**修复内容**：
- **ModelLibrary**：从 git 历史恢复 `renderModelCard` 函数（包含模型卡片的完整 UI）
- **DatasetManager/SkillLibrary/DatabaseLibrary/ModelLibrary**：所有 `sectionGroups.map` 内部过滤改用原始数据（`datasets`/`skills`/`items`/`models`）而非过滤后的 `current*` 状态，避免双重过滤
- **GroupSection sticky offset**：改为 `sticky top-0` + 每个区块标题内加 `style={{ marginTop: '56px' }}` 避开导航栏高度
- **navGroups**：补充"未分组"虚拟分组，确保未分组内容也能出现在导航栏

**测试**：前端 `npm run dev` → http://localhost:3000/ ✅

**问题修复**：
- `DatabaseLibrary`：`currentItems` 未定义（引用错误），修复为 `currentDbs`；添加 `activeGroupId` state、`navGroups`、`GroupNavBar` 渲染
- `ModelLibrary`：添加缺失的 `activeGroupId` state、`navGroups`/`sectionGroups`/`currentModels` 定义；修复「添加模型」按钮只切换 `groupMode` 不展开表单的 bug
- `GroupNavBar`：`navGroups.length > 0 &&` 条件导致无分组时导航栏不显示 → 改为始终渲染，保证「全部」按钮始终可见

**交互增强**：
- `GroupNavBar` 滚动联动：IntersectionObserver 触发后自动将高亮卡片滚动到可视区域（`scrollIntoView`）
- `GroupNavBar` 卡片内操作：hover 分组卡片时显示编辑/删除按钮（`group/card` CSS 组合类实现），点击编辑弹出 `window.prompt` 重命名
- `GroupNavBar` scroll offset 优化：`Math.max(0, offset)` 防止滚动到负值区域

---

## 2026-05-13

### 前端：四大模块统一「吸顶分组导航 + 分组区块」交互 ✅

**概述**：知识库、技能库、模型库、数据库四大模块统一实现「固定吸顶分组导航栏 + 滚动联动 + 分组区块展示」交互。

**通用组件（新增）**：
- `GroupNavBar`：吸顶横向分组卡片导航栏，支持「全部 + 各分组 + 新建分组」按钮，点击分组卡片页面平滑滚动到对应区块，页面滚动时当前可视分组自动高亮（IntersectionObserver）
- `GroupSection`：分组区块组件，含吸顶标题栏 + 1px 半透明灰色分割线，内容由 children 决定
- `CardGrid`：统一卡片网格包装器，支持空状态展示

**四大模块改动**：
- `DatasetManager`：移除旧的 groupMode 切换按钮，引入 GroupNavBar + GroupSection，有分组时显示「全部/分组卡片/未分组」区块
- `DatabaseLibrary`：同上，统一交互体验
- `SkillLibrary`：同上，统一交互体验
- `ModelLibrary`：补充缺失的 groupMode 渲染逻辑（之前有状态有按钮但无渲染），引入 GroupNavBar + GroupSection

**交互体验**：
- 吸顶导航栏：页面标题下方，随页面滚动保持吸顶（`sticky top-0 z-20`）
- 横向滚动：超出宽度时支持左右滑动（`overflow-x-auto scrollbar`）
- 滚动联动：IntersectionObserver 监听各分组区块，自动高亮当前可视分组
- 视觉风格：卡片按钮高亮时蓝底白字，未选中时白底灰字

---

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
