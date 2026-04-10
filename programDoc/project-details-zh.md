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

职责是“总装配器”：

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

## 九、模块间关联（重点）

主链路：

1. `bootstrap-entry.ts` -> `entrypoints/cli.tsx` -> `main.tsx`
2. `main.tsx` 装配 commands/tools/skills/mcp/state 后进入 `REPL.tsx`
3. `REPL.tsx` 调用 `processUserInput()` 处理输入
4. 若需模型推理，`REPL.tsx` 调 `query()`
5. `query()` 调工具编排，执行 `tools/*`
6. 执行结果回写消息和 `AppState`，再渲染到 REPL

关键依赖关系：

- `commands.ts` 依赖 `skills/loadSkillsDir.ts`（技能命令化）
- `query.ts` 依赖 `Tool.ts` + `tools.ts`（工具调度）
- `REPL.tsx` 同时依赖 commands/tools/query/processUserInput/state
- `context.ts` 为 query 提供系统/用户上下文

---

## 十、阅读建议（从快到深）

1. 入口：`bootstrap-entry.ts`、`entrypoints/cli.tsx`、`main.tsx`
2. 主循环：`screens/REPL.tsx`、`utils/processUserInput/*`、`query.ts`
3. 能力层：`commands.ts`、`tools.ts`、`skills/loadSkillsDir.ts`
4. 横切服务：`services/mcp/*`、`services/compact/*`、`services/api/*`
5. 状态：`state/AppStateStore.ts`
