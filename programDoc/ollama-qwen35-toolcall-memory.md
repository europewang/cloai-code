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

## 补充：问题根因与修复（2026-04-11）

### 现象

- CLI 进入对话后长期停留在 `Thinking...`，看起来像“模型不可用”。
- 但 `ollama /api/chat` 可返回，说明服务并未完全故障。

### 根因

- `ollama-local` 容器最初启动时未带 GPU 参数，导致模型在 CPU 推理。
- 通过 `ollama ps` 可见：
  - `qwen3.5:9b`
  - `PROCESSOR = 100% CPU`
- 同时 `nvidia-smi` 显示显存主要被 xinference 模型占用（尤其 `deepseek-r1-distill-qwen-14b`），进一步放大了响应慢与超时风险。

### 修复动作

1. 卸载 xinference 大模型（至少 `deepseek-r1-distill-qwen-14b`）：

```bash
curl -X DELETE http://127.0.0.1:8085/v1/models/deepseek-r1-distill-qwen-14b
```

2. 为避免抢显存，额外卸载 embedding/reranker：

```bash
curl -X DELETE http://127.0.0.1:8085/v1/models/bge-m3
curl -X DELETE http://127.0.0.1:8085/v1/models/bge-reranker-v2-m3
```

3. 重建 Ollama 容器并显式启用 GPU：

```bash
docker rm -f ollama-local
docker run -d --name ollama-local --restart unless-stopped \
  --gpus all \
  -p 11434:11434 \
  -v ollama_data:/root/.ollama \
  ollama/ollama:latest
```

### 修复后验证

- `ollama ps` 显示：
  - `qwen3.5:9b`
  - `PROCESSOR = 100% GPU`
- `nvidia-smi` 可见 `/usr/bin/ollama` 占用约 `9.4GB` 显存。
- 命令验证通过：

```bash
timeout 240s bun run ./src/bootstrap-entry.ts --bare -p "你好" --output-format text
```

返回正常中文回复，不再长时间卡在 `Thinking...`。

## 2026-04-11 目标模式（按最新要求）

目标改为：

- xinference 仅保留两个小模型：
  - `bge-m3`
  - `bge-reranker-v2-m3`
- LLM 统一使用 Ollama：
  - `qwen3.5:9b`
- 不再使用：
  - `deepseek-r1-distill-qwen-14b-custom`
  - `deepseek-r1-distill-qwen-14b`

### 已完成配置修改

1. `launch_xinference_models.py` 已改造为“只启动两小模型，不再注册/启动 deepseek LLM”。
2. `deploy/docker-compose-ragflow.yml` 中 `backend` 默认 LLM 改为：

```text
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_MODEL=qwen3.5:9b
```

### 当前实测状态

- xinference 模型列表：
  - `bge-m3`
  - `bge-reranker-v2-m3`
- `ollama ps`：
  - `qwen3.5:9b`，`PROCESSOR=100% GPU`
- `src` 验证：
  - `bun run ./src/bootstrap-entry.ts --bare -p "你好，请只回复：SRC_OLLAMA_OK" --output-format text`
  - 返回：`SRC_OLLAMA_OK`

### 在 RagFlow 中配置 Ollama（UI 操作）

1. 打开 RagFlow 控制台：`http://127.0.0.1:8084`
2. 进入模型提供方配置（Model Provider / LLM 配置）。
3. 新增 OpenAI-compatible Provider，填写：
   - Base URL：`http://host.docker.internal:11434/v1`
   - API Key：`ollama-local`（Ollama 默认不校验，可填占位值）
   - Model：`qwen3.5:9b`
4. 保存并设为默认 chat 模型。
5. 在知识库聊天中发起测试提问，观察是否返回并可引用。

> 备注：容器内访问本机 Ollama 必须使用 `host.docker.internal`，不能写 `127.0.0.1`。

### 故障排查：`Cannot connect to host ollama:11434`

报错：

```text
Fail to access model(Ollama/qwen3.5-9b)
CONNECTION_ERROR - Cannot connect to host ollama:11434
```

根因与修复：

1. 主机名错误  
   - `ollama` 仅在 Docker 网络内存在同名服务时可解析。  
   - 当前环境应改为 `host.docker.internal`。
2. 模型名错误  
   - 错误写法：`qwen3.5-9b`
   - 正确写法：`qwen3.5:9b`
3. Compose 侧补丁（已执行）  
   - `deploy/docker-compose-ragflow.yml` 的 `ragflow` 服务新增：

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

推荐填写：

- 若 RagFlow 提供方选择 **Ollama**：
  - Base URL：`http://host.docker.internal:11434`（**不要加 `/v1`**）
  - Model：`qwen3.5:9b`
- 若 RagFlow 提供方选择 **OpenAI-compatible**：
  - Base URL：`http://host.docker.internal:11434/v1`
  - API Key：`ollama-local`（占位值）
  - Model：`qwen3.5:9b`

### 你截图这个 404 的直接修复

- 你当前配置是：Provider=`Ollama` + Base URL=`http://host.docker.internal:11434/v1`
- 正确配置应为：Provider=`Ollama` + Base URL=`http://host.docker.internal:11434`
- 保存后在 RagFlow 里点一次模型连通性测试，再发起聊天验证。

## 2026-04-11 RagFlow 实测（新建聊天 + 提问“什么是半面积”）

已按 API 完成验证：

1. 新建聊天并绑定知识库；
2. 将聊天模型切换为 `qwen3.5:9b@Ollama`；
3. 提问：`什么是半面积`；
4. 返回成功（HTTP 200），可得到正常中文回答。

### 关键发现

- 当前共有 8 个知识库，但其中 5 个未完成解析，无法加入聊天：
  - 报错：`The dataset <id> doesn't own parsed file`
- 可加入并可用的知识库共 3 个：
  - `建筑面积`
  - `课程作业`
  - `规定`

### 建议

- 如需“全部知识库都可加入聊天”，请先在 RagFlow 中对那 5 个数据集执行解析（Chunk 生成完成）后再重试。
