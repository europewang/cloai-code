# cloai 对接本地 Xinference 模型实战指南

本文档用于在服务器环境中，把 Docker 里的 Xinference 模型接入到本项目 `cloai`，并完成可复现的启动与验证。

适用场景：
- 你已有 Xinference 容器，且模型已加载
- 你希望通过 `cloai` 在终端直接调用该模型
- 你希望有一套稳定的一键验证命令

---

## 1. 前置条件

- 操作系统：Linux
- 已安装：Docker、Bun（>= 1.3.5）、Node（>= 24）
- 已拉取项目源码：`/home/ubutnu/code/cloai-code`
- Xinference 容器已运行，并暴露 OpenAI 兼容接口（通常是 `http://127.0.0.1:8085`）

---

## 2. 确认 Xinference 容器与模型

### 2.1 查看容器是否运行

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"
```

你应能看到类似：
- 容器名：`xinference`
- 端口映射包含：`8085`

### 2.2 查看已注册模型

```bash
curl -sS http://127.0.0.1:8085/v1/models | jq .
```

若没有 `jq`：

```bash
curl -sS http://127.0.0.1:8085/v1/models
```

请记录你要使用的模型名，例如：
- `deepseek-r1-distill-qwen-14b`

### 2.3 直接验证模型可对话（不经过 cloai）

```bash
curl -sS http://127.0.0.1:8085/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model":"deepseek-r1-distill-qwen-14b",
    "messages":[{"role":"user","content":"你好，请回复ok"}],
    "stream":false
  }'
```

若返回 `choices` 且有文本内容，说明 Xinference 侧正常。

---

## 3. 安装项目依赖

在项目根目录执行：

```bash
cd /home/ubutnu/code/cloai-code
bun install
```

---

## 4. 对接 cloai 到 Xinference

本项目在 OpenAI-like 兼容通道下，会使用以下环境变量：

- `CLOAI_API_KEY`：API Key（Xinference 常见场景可填任意非空值）
- `ANTHROPIC_BASE_URL`：兼容网关地址（历史命名，不代表只能 Anthropic）
- `ANTHROPIC_MODEL`：模型名

示例：

```bash
export CLOAI_API_KEY="xinference-local"
export ANTHROPIC_BASE_URL="http://127.0.0.1:8085"
export ANTHROPIC_MODEL="deepseek-r1-distill-qwen-14b"
```

---

## 5. 一键验证（推荐先跑）

这是最稳定的“联通性冒烟测试”：

```bash
cd /home/ubutnu/code/cloai-code
CLOAI_API_KEY=xinference-local \
ANTHROPIC_BASE_URL=http://127.0.0.1:8085 \
ANTHROPIC_MODEL=deepseek-r1-distill-qwen-14b \
bun run ./src/bootstrap-entry.ts --bare -p "请只回复 xinference-connected" --output-format text --max-turns 1 --tools "" --dangerously-skip-permissions
```

预期输出包含：

```text
xinference-connected
```

说明：
- `--bare`：最小模式，减少非必要初始化干扰
- `-p`：非交互单次输出模式
- `--tools ""`：禁用工具，避免工具调用引起多轮行为
- `--max-turns 1`：只跑一轮

---

## 6. 启动方式

### 6.1 非交互（脚本/CI 常用）

```bash
CLOAI_API_KEY=xinference-local \
ANTHROPIC_BASE_URL=http://127.0.0.1:8085 \
ANTHROPIC_MODEL=deepseek-r1-distill-qwen-14b \
bun run dev -p "帮我写一个 hello world 的 python 示例" --output-format text --dangerously-skip-permissions
```

### 6.2 交互模式（人工使用）

```bash
export CLOAI_API_KEY="xinference-local"
export ANTHROPIC_BASE_URL="http://127.0.0.1:8085"
export ANTHROPIC_MODEL="deepseek-r1-distill-qwen-14b"

cd /home/ubutnu/code/cloai-code
bun run dev
```

启动后在 CLI 中直接输入问题即可。

---

## 7. 导入/切换模型怎么做

你有两种常见方式：

### 方式 A：仅通过环境变量切换（最简单）

只改 `ANTHROPIC_MODEL` 即可：

```bash
export ANTHROPIC_MODEL="你的另一个模型名"
```

### 方式 B：在 `~/.cloai` 的 provider 配置中持久化（适合长期使用）

项目支持 OpenAI-like Provider 持久化配置。若你希望重启 shell 后仍保留模型/网关，建议在项目命令体系里添加 provider（或写入 customApiStorage）并设为 active provider。

对于多数服务器场景，方式 A 已足够稳定。

---

## 8. 常见问题排查

### 8.1 `-p` 没有输出、像卡住

优先用第 5 节的一键命令（`--bare` + `--tools ""` + `--max-turns 1`）排除流程干扰。

### 8.2 返回 404 / 连接失败

检查：
- `ANTHROPIC_BASE_URL` 是否正确（`http://127.0.0.1:8085`）
- 容器端口是否映射
- 防火墙/网络命名空间是否隔离

### 8.3 模型名错误

用以下命令重新确认模型列表：

```bash
curl -sS http://127.0.0.1:8085/v1/models
```

### 8.4 流式输出出现额外结束标记

某些模型会带特殊结束片段（如 `<|im_end`），通常不影响功能联通。

---

## 9. 推荐日常命令

```bash
# 安装依赖
bun install

# 查看版本
bun run version

# 交互模式
bun run dev

# 非交互单次调用
bun run dev -p "你的问题" --output-format text --dangerously-skip-permissions
```

---

## 10. 快速复盘（最短路径）

1. 启动并确认 Xinference 容器与模型
2. `bun install`
3. 设置 3 个环境变量：`CLOAI_API_KEY`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL`
4. 先跑第 5 节的一键验证
5. 验证通过后再用 `bun run dev` 进入常规使用

完成以上步骤后，你就可以在 `cloai` 中稳定调用本地 Xinference 模型。
