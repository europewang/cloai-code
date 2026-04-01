# Doge Code

> Claude Code 的一个 Fork。不是官方正史，而是平行世界番外篇；不是萌豚整活仓库，而是“认真修、顺手发癫一点点”的工程分支。

[![Fork](https://img.shields.io/badge/Fork-Claude%20Code-f59e0b)](README.md)
[![Status](https://img.shields.io/badge/status-restored%20%2B%20modded-10b981)](README.md)
[![Runtime](https://img.shields.io/badge/runtime-Bun%20%2B%20Node-3b82f6)](README.md)
[![Config](https://img.shields.io/badge/config-~%2F.doge-8b5cf6)](README.md)
[![License](https://img.shields.io/badge/license-see%20upstream%20notice-lightgrey)](README.md)
[![Issues](https://img.shields.io/badge/issues-welcome-ef4444)](README.md)

![Preview](preview.png)

## 这是什么

[`Doge Code`](README.md) 基于一份还原后的 [`Claude Code`](README.md) 源码树继续修改而来。

可以把它理解为：

- 基底仍然是“通过 source map 逆向还原 + 缺失模块补齐”得到的可运行代码树
- 但在此之上，加入了这个 Fork 自己的目标和行为调整
- 目标不是“100% 忠于上游”，而是“让它更适合折腾、适合代理转接、适合自定义模型接入”

如果用 ACG 比喻，大概属于：

- 原作：[`Claude Code`](README.md)
- 本作：[`Doge Code`](README.md)
- 定位：不是官方 BD 修正集，而是高强度民间魔改但努力保持剧情逻辑自洽的外传 OVA

## 当前定位

这个仓库当前强调的是以下方向：

- 支持自定义 Anthropic 兼容接口地址
- 正在加入 OpenAI Chat Completions ↔ Anthropic Messages 转接能力
- 支持自定义 API Key
- 支持自定义模型与模型列表管理
- 尽量把自定义接入数据收口到 [`~/.doge`](README.md) 路径体系
- 在保留 CLI/TUI 主体结构的前提下，降低对官方登录流的绑定

换句话说，它现在更像一个“可自托管 / 可代理 / 可转接”的 [`Claude Code`](README.md) 变体。

## 与原版 Claude Code 的数据隔离

[`Doge Code`](README.md) 默认**不应**与原版 [`Claude Code`](README.md) 共用配置和缓存目录。

当前 Fork 已明确把默认用户目录收口到：

- 配置目录：[`~/.doge`](README.md)
- 全局配置文件：[`~/.doge/.claude.json`](README.md)

这样做的目的，是避免以下问题：

- 原版 [`Claude Code`](README.md) 的登录态污染 [`Doge Code`](README.md)
- 原版保存的 endpoint / token / model 配置影响 Doge 的代理转接逻辑
- 两边共用 [`.claude.json`](README.md) 或 [`.claude/`](README.md) 导致奇怪的网络、认证、模型或 UI 异常

如果用户以前装过原版 [`Claude Code`](README.md)，再运行 [`Doge Code`](README.md) 时出现“明明没这么配却读到了旧配置”的现象，通常就是历史数据混用导致的。

建议：

- 原版继续使用它自己的 [`.claude`](README.md) / [`.claude.json`](README.md)
- [`Doge Code`](README.md) 使用 [`.doge`](README.md) 目录
- 如需手动指定，也可以通过 [`CLAUDE_CONFIG_DIR`](README.md) 为 [`Doge Code`](README.md) 指向独立目录

一句话总结：

> 原版走原版的窝，狗子住狗子的窝，别把缓存、认证和配置炖成一锅。

## OpenAI 兼容接口说明

[`Doge Code`](README.md) 正在加入一个“中间转接层”模式，用来让内部仍按 Anthropic Messages 结构工作的主逻辑，转发到 OpenAI Chat Completions 接口。

目标行为是：

- 内部程序仍按 Anthropic Messages 模式组织请求
- 当选择 OpenAI API 格式时，由中间层把 Messages 请求改写成 Chat Completions 请求
- 远端返回 Chat Completions 流后，再由中间层回转成内部可消费的 Messages 风格流事件

这意味着它不是简单改一个 Base URL，而是协议级别的输入输出流转接。

当前状态：

- API 格式选择界面与配置持久化已加入
- OpenAI 兼容转接模块正在迭代中
- 目前仍属于开发中功能，可能出现流式事件不完整、消息映射异常、部分工具调用兼容不足等情况

如果你只是想稳定使用，建议优先走 Anthropic 兼容接口模式；如果你在测试 OpenAI 格式，请把它视为实验功能。

## 和原始还原仓库的关系

这个仓库**不是**上游官方源码仓库，也**不是** pristine 状态的 Claude Code。

它有两层历史：

1. 第一层：还原后的源码树
2. 第二层：基于该源码树继续进行的 Fork 改造

因此你会看到两类差异同时存在：

- 来自恢复过程的 shim、fallback、兼容层
- 来自 Doge Code 的主动魔改

这两类改动都是真实存在的，不建议把当前代码误判成“官方上游源码镜像”。

## 当前状态

- 该源码树已经可以在本地开发流程中恢复并运行
- [`bun install`](README.md) 可用于安装依赖
- [`bun run dev`](README.md) 可用于启动恢复后的 CLI/TUI
- [`bun run version`](README.md) 可用于输出当前版本信息
- 项目已被继续改造成 [`Doge Code`](README.md) 分支，部分行为和 UI 已不再与原始 Claude Code 一致
- 部分区域仍保留恢复期 fallback，因此行为可能与上游实现不同
- OpenAI API 格式转接功能仍在开发中，当前并非完全稳定

## 为什么会有这个仓库

因为 source map 并不能召唤完整原仓库，最多只能说“把灵魂碎片召回来一部分”。

常见缺口包括：

- 类型专用文件缺失
- 构建产物和中间文件缺失
- 私有包包装层无法恢复
- 原生绑定无法恢复
- 动态导入资源不完整

因此这个仓库的目标从一开始就不是考古式供奉，而是：

- 先恢复到可运行
- 再恢复到可维护
- 最后在能跑的基础上，按需求继续 Fork

简而言之：

> 先让它活，再让它能打，再让它变成狗。

## 运行方式

环境要求：

- Bun 1.3.5 或更高版本
- Node.js 24 或更高版本

安装依赖：

```bash
bun install
```

运行 [`Doge Code`](README.md) CLI：

```bash
bun run dev
```

输出版本号：

```bash
bun run version
```

## 说明与免责声明

- 本仓库是 [`Claude Code`](README.md) 的 Fork：[`Doge Code`](README.md)
- 它包含恢复期代码与后续 Fork 改动，不代表官方立场
- 如果某些行为看起来“很像官方，但又不完全像”，那通常不是你看错了，而是这确实是恢复版 + 魔改版的叠加态
- 如果某些文案偶尔带一点 ACG 味，那是彩蛋，不是类型系统坏掉了（至少不全是）
