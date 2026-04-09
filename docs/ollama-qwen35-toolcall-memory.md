# Ollama + Qwen3.5 9B 接入与 Tool Call 验证记录

## 目标

将 `cloai-code` 从 xinference 切换到 Ollama，启用 `qwen3.5:9b`，并验证项目内是否可以正常执行工具调用。

## 环境结论

- 显卡：`NVIDIA GeForce RTX 5090`
- 总显存：`32607MiB`
- 检查时占用：约 `28373MiB / 32607MiB`
- 结论：可以加载 `qwen3.5:9b`，但同时保留 xinference 大模型时显存会比较紧张

## 已完成步骤

### 1. 检查当前显存

执行：

```bash
nvidia-smi
```

关注：

- 总显存是否足够
- 当前是否已有 xinference / embedding / reranker / ollama 进程占用显存

### 2. 启动 Ollama 服务

如果本机未直接安装 `ollama`，可通过 Docker 启动兼容服务。

确认服务地址：

```text
http://127.0.0.1:11434
```

### 3. 检查并下载模型

先确认模型是否存在，再进行拉取：

```bash
ollama list
ollama pull qwen3.5:9b
```

结论：

- `qwen3.5:9b` 存在
- 已成功下载
- 模型体积约 `6.6GB`

### 4. 验证 Ollama 侧是否支持 Tool Call

使用 OpenAI 兼容接口验证模型是否会返回 `tool_calls`。

验证重点：

- base URL：`http://127.0.0.1:11434`
- model：`qwen3.5:9b`
- 能否返回工具调用结构

结论：

- `qwen3.5:9b` 在 Ollama 中可以返回 `tool_calls`

### 5. 修改 cloai 持久化 Provider 配置

修改文件：

- `~/.cloai/.credentials.json`

将 Ollama 加入 `customApiEndpoint.providers`，并切为当前激活 Provider。

关键配置：

```json
{
  "customApiEndpoint": {
    "activeProvider": "ollama",
    "activeModel": "qwen3.5:9b",
    "baseURL": "http://127.0.0.1:11434",
    "apiKey": "ollama-local",
    "model": "qwen3.5:9b"
  }
}
```

同时保留原 xinference 配置，便于随时切回。

备份文件：

- `~/.cloai/.credentials.json.bak-ollama-switch`

### 6. 在项目中验证 Tool Call

进入项目目录：

```bash
cd /home/ubutnu/code/cloai-code
```

执行验证命令：

```bash
bun run ./src/bootstrap-entry.ts --bare -p "请使用 Bash 工具执行 date 命令，并只返回命令输出" --output-format text --max-turns 2 --dangerously-skip-permissions
```

验证结果：

- `--max-turns 1` 时会提示 `Reached max turns (1)`，因为第一轮通常是模型发起工具调用
- `--max-turns 2` 时成功返回 `date` 的执行结果

这说明：

- `cloai-code` 已成功接入 Ollama
- `qwen3.5:9b` 已在项目中生效
- Tool Call 可以正常工作

## 常用命令

### 启动项目

```bash
cd /home/ubutnu/code/cloai-code
bun run dev
```

### 快速测试 Tool Call

```bash
cd /home/ubutnu/code/cloai-code
bun run ./src/bootstrap-entry.ts --bare -p "请使用 Bash 工具执行 date 命令，并只返回命令输出" --output-format text --max-turns 2 --dangerously-skip-permissions
```

### 查看当前模型列表

```bash
ollama list
```

### 查看显存

```bash
nvidia-smi
```

## 注意事项

- xinference 的 `transformers` 后端不适合当前这个“流式输出 + tool_calls”场景
- Ollama + `qwen3.5:9b` 已验证可用于该项目的 Tool Call
- 如果显存持续偏高，建议停掉不必要的 xinference 模型或其他 embedding / reranker 进程
- 若后续出现 “Not logged in · Please run /login”，优先检查 `~/.cloai/.credentials.json` 中的 active provider 是否仍指向 Ollama

## 回切到 xinference 的思路

如需切回 xinference，只需把 `~/.cloai/.credentials.json` 中 `customApiEndpoint.activeProvider`、`activeModel`、`baseURL`、`apiKey` 改回原先配置即可。

## 最终结论

当前机器可以改用 Ollama，并启用 `qwen3.5:9b` 接入 `cloai-code`。项目内 Tool Call 已通过实际命令验证，可正常使用。
