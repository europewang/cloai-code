# 前端路由、侧边栏排序与智能问答输入改造记录

- 日期：2026-05-15
- 类型：前端 Bug 修复 + 交互改造 + 代码拆分
- 范围：`frontend/src/App.jsx`、`frontend/src/main.jsx`、`frontend/src/components/*`、`frontend/src/utils/*`

## 背景

本次改造聚焦以下问题：

1. 侧边栏中“智能问答”固定在顶部，不能像其他栏目一样自由拖拽排序。
2. 智能问答页面保留了“当前记忆 profile 可选”和默认示例提示语，干扰主输入流程。
3. 输入框 `@技能` 仅有局部候选能力，未按使用频率排序，也没有稳定的语义改写策略。
4. 前端页面仍使用单一 URL + `activeTab` 内存态切换，刷新后无法保持当前页面。
5. `App.jsx` 持续膨胀，应用壳层与业务组件耦合过重，不利于维护。

## 改动概览

### 1. 真实子路由落地

- 在 `frontend/src/main.jsx` 接入 `BrowserRouter`
- 新增 `frontend/src/utils/appRouting.js`
- 建立页面与路径映射：
  - `/qa`
  - `/knowledge`
  - `/databases`
  - `/skill-library`
  - `/models`
  - `/overview`
  - `/users`
  - `/permissions`
  - `/skill-management`
  - `/memory`
- `App` 不再依赖单纯的本地 `activeTab` 状态切页，而是从当前 URL 推导当前页面

### 2. 默认首页改为“侧边栏排序后的第一项”

- 侧边栏顺序继续按用户保存到 `localStorage`
- 登录后、刷新后、根路径访问时，统一取当前排序后的第一个栏目作为默认首页
- 这样既满足“刷新保持当前路由”，也满足“首次进入时以用户排序后的首栏目作为主页”

### 3. 侧边栏排序解锁

- 抽离 `frontend/src/components/AppSidebar.jsx`
- 将“智能问答”从特殊固定项改为可排序项
- 主导航与聊天子侧边栏逻辑在同一组件文件内维护
- 侧边栏相关函数同步补充注释，说明：
  - 为什么智能问答也需要纳入同一套拖拽体系
  - 为什么默认首页依赖排序结果

### 4. 智能问答界面精简

- 移除“当前记忆 profile（可选）”输入框及其展示说明
- 移除输入框下方默认示例提示语
- 保留最小必要输入区，仅保留上传文件、输入、发送等核心能力

### 5. `@技能` 能力增强

- 新增 `frontend/src/utils/skillMentions.js`
- 输入框内 `@` 候选排序改为：
  1. 关键字匹配分数
  2. 本地记录的技能使用频率
  3. 名称字典序
- 命中 `@技能名` 后，统一改写为“请使用 xxx 技能”
- 技能库弹窗对话也统一走这套语义，而不是保留旧的 `@skill` 前缀拼接
- 技能使用频率保存到本地存储，便于前端快速排序，不依赖后端变更

### 6. 代码拆分

- 新增 `frontend/src/components/AppSidebar.jsx`
- 新增 `frontend/src/components/SkillChatModal.jsx`
- 新增 `frontend/src/components/chat/ChatMessagesPanel.jsx`
- 新增 `frontend/src/components/chat/ChatComposer.jsx`
- 新增 `frontend/src/components/chat/ToolDraftCard.jsx`
- 新增 `frontend/src/utils/appRouting.js`
- 新增 `frontend/src/utils/skillMentions.js`
- `App.jsx` 删除侧边栏和技能弹窗的大段内联实现，职责收敛为：
  - 应用壳层
  - 路由编排
  - 主要页面入口装配
- `ChatInterface` 继续收敛为状态与行为编排层，消息流、输入区、技能草稿区分别迁移到独立组件

### 7. 后续补充修复

- 修复 `DatabaseLibrary` 页面运行时报错：`Plus is not defined`
- 原因是拆分导入时误删了 `lucide-react` 中的 `Plus` 图标导入
- 已在 `frontend/src/App.jsx` 恢复导入，避免数据库页面和其他“添加”按钮区域崩溃

## 关键实现说明

### 路由策略

- 路由和页面 ID 通过单独的 `TAB_PATHS` 做映射，避免散落硬编码
- 未命中路径时，统一重定向到当前排序后的默认首页
- 管理页路由在非管理员场景下会回退到默认首页

### `@技能` 语义改写策略

- 输入文本中的 `@xxx` 会先尝试匹配技能目录
- 匹配成功后改写为自然语言提示，而不是在链路中保留原始 `@xxx`
- 这样可以复用现有脑服务和普通对话入口，减少特殊分支

### 组件拆分原则

- 将“应用壳层”和“独立交互单元”优先拆出
- 拆分后的文件保持低耦合：
  - `AppSidebar.jsx` 只关注导航、排序、会话入口
  - `SkillChatModal.jsx` 只关注技能弹窗会话
  - `appRouting.js` 只关注页面路径映射
  - `skillMentions.js` 只关注技能频率和排序分值

## 验证

- 本次未启动 Docker
- 本地前端构建验证通过：

```bash
cd frontend
npm run build
```

- 结果：构建成功，Vite 产物正常输出

## 后续建议

1. 继续迁移 `DatabaseLibrary -> pages/databases/DatabasePage.jsx`
2. 视复用度继续把知识库/数据库/技能/模型页共用的分组导航、分组区块、分组弹窗继续下沉为共享基础件
3. 为路由增加会话级 URL（例如 `/qa/:conversationId`），进一步提升刷新恢复能力
4. 将技能使用频率从本地存储升级为后端统一存储，实现跨设备一致排序

## 追加进展：一级页面迁移

在完成上述路由与交互改造后，已继续落地第一批页面级大件拆分：

### 已完成

1. `ChatInterface -> frontend/src/pages/chat/ChatPage.jsx`
2. `DatasetManager -> frontend/src/pages/knowledge/KnowledgePage.jsx`

### 同步抽离

为支撑页面独立迁移，已将聊天页和知识库页所需共享接口持续抽离到：

- `frontend/src/lib/appApi.js`

其中新增了知识库页相关 API 封装：

1. `fetchDatasets`
2. `createDataset`
3. `updateDatasetShare`
4. `deleteDataset`
5. `deleteDatasets`
6. `updateDataset`
7. `updateDocument`
8. `fetchDocuments`
9. `uploadDocument`
10. `deleteDocuments`
11. `runDocuments`
12. `getDocumentFile`
13. `fetchChunks`

### 当前结论

- `App.jsx` 已不再直接装配旧的 `DatasetManager`，而是通过路由装配 `KnowledgePage`
- 第一批大件拆分已完成两块，下一优先级为数据库页迁移
- 本轮迁移后本地 `npm run build` 继续通过
