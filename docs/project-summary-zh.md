# cloai-code 项目简要总结

## 1. 项目定位

`cloai-code` 是一个以 Bun/TypeScript 为基础的 CLI 代码助手，核心形态是“终端交互式 Agent + 工具执行引擎 + 命令系统 + MCP 扩展能力”。  
它在上游基础上强化了多 Provider 接入、技能系统、插件与远程控制能力。

## 2. 总体架构（一句话）

从 `bootstrap-entry.ts` 进入，`entrypoints/cli.tsx` 做启动分流，`main.tsx` 完成初始化与运行态装配，`screens/REPL.tsx` 承担交互循环，`query.ts` 驱动模型推理与工具调用，`tools.ts` 和 `commands.ts` 提供可用能力池，`skills/loadSkillsDir.ts` 动态加载技能，`state/AppStateStore.ts` 维护全局状态。

## 3. 核心模块分层

- `src/entrypoints/*`：启动入口与模式分流（CLI、MCP、init）。
- `src/main.tsx`：应用装配层（配置、策略、命令/工具/插件/MCP 集合、REPL 启动）。
- `src/screens/REPL.tsx`：交互 UI 与会话编排层（输入、消息、任务、权限弹窗、状态展示）。
- `src/query.ts`：模型请求与工具编排引擎（流式输出、压缩、恢复、工具执行）。
- `src/tools/*` + `src/tools.ts`：工具定义与聚合（Bash/Read/Edit/Grep/Web 等）。
- `src/commands/*` + `src/commands.ts`：Slash 命令系统（内置命令 + 技能命令 + 插件命令）。
- `src/skills/*`：技能加载、条件激活、动态发现（包含 legacy commands 兼容）。
- `src/services/*`：横切服务（analytics、api、mcp、compact、lsp、policyLimits 等）。
- `src/state/*`：全局应用状态与 store。
- `src/utils/*`：基础设施与公共能力（权限、model、session、hooks、git、settings）。

## 4. 关键方法（高频）

- `main()`（`entrypoints/cli.tsx`）：启动参数快速分流，按需动态 import，最后进入 `main.tsx`。
- `init()`（`entrypoints/init.ts`）：配置系统与环境初始化、遥测初始化准备、清理注册。
- `getCommands()`（`commands.ts`）：聚合内置/插件/技能/工作流命令并做可用性过滤。
- `getSkillDirCommands()`（`skills/loadSkillsDir.ts`）：从多来源加载并去重技能，处理条件技能。
- `getTools()`（`tools.ts`）：按权限和运行模式产出最终工具集合。
- `processUserInput()`（`utils/processUserInput/processUserInput.ts`）：把输入分流到普通 prompt、slash、bash。
- `query()`（`query.ts`）：执行主推理循环，处理工具调用、上下文压缩、错误恢复。
- `getSystemContext()/getUserContext()`（`context.ts`）：拼接系统上下文与用户上下文。
- `startMCPServer()`（`entrypoints/mcp.ts`）：以 MCP 标准暴露本地工具能力。
- `getDefaultAppState()`（`state/AppStateStore.ts`）：构造全局默认状态。

## 5. 模块关联（主链路）

1. CLI 启动：`bootstrap-entry.ts` -> `entrypoints/cli.tsx` -> `main.tsx`
2. 初始化：`main.tsx` -> `entrypoints/init.ts` + settings/policy/telemetry
3. 命令工具装配：`main.tsx` -> `commands.ts` + `tools.ts` + `skills/loadSkillsDir.ts`
4. 进入交互：`main.tsx` -> `screens/REPL.tsx`
5. 处理输入：`REPL.tsx` -> `processUserInput()` -> slash/bash/prompt 分支
6. 模型与工具执行：`REPL.tsx` -> `query()` -> `runTools()` -> 具体 Tool
7. 状态回写：工具/查询结果 -> `AppState`/消息流 -> REPL 渲染

## 6. 你可以怎么读这个项目

- 先读入口：`bootstrap-entry.ts`、`entrypoints/cli.tsx`、`main.tsx`
- 再读主循环：`screens/REPL.tsx`、`utils/processUserInput/*`、`query.ts`
- 再读能力层：`tools.ts`、`commands.ts`、`skills/loadSkillsDir.ts`
- 最后读横切能力：`services/*`（mcp、compact、analytics、api）与 `state/*`

