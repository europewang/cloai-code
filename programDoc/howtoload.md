# cloai-code 项目启动与重启指南

本文档包含项目各模块的启动、重启和验证命令。

---

## 1. 项目架构

```
┌─────────────────────────────────────────────────────────────┐
│                     前端 (8086)                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              brain-server (8091) - Docker                    │
│  - pre-server: 获取上下文、权限                               │
│  - post-server: skill鉴权、审计                              │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   brain (3100)         │     │    RAGFlow (8084)       │
│   Docker               │     │    Docker               │
│   src brain + SkillTool│     │    知识库检索            │
│   使用 Ollama qwen3.5  │     └─────────────────────────┘
└─────────────────────────┘
              │
              ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   Ollama (11434)        │     │  xinference (8085)       │
│   Docker                 │     │  Docker                  │
│   qwen3.5:9b            │     │  bge-m3 (embedding)     │
│                         │     │  bge-reranker-v2-m3     │
└─────────────────────────┘     └─────────────────────────┘
```

**说明**：brain 是 src brain 的封装，负责：
- 运行 SkillTool 执行 forked skills（如 rag-query）
- 调用 Ollama 进行 LLM 推理

---

## 2. 快速启动（首次部署）

```bash
cd /home/ubutnu/code/cloai-code

docker compose -f deploy/docker-compose-brain-ts.yml build frontend
docker compose -f deploy/docker-compose-brain-ts.yml up -d frontend


# 1. 启动所有Docker服务（包括 brain-server 和 brain）
docker compose -f deploy/docker-compose-brain-ts.yml up -d

# 2. 等待服务就绪后，启动xinference模型
python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py

# 3. 重启xinference（确保模型加载）
docker restart xinference && sleep 15 && python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py

# 4. 验证所有服务
curl -s http://localhost:8091/api/v1/pre/context -H "Authorization: Bearer test" 2>&1 | head -1
curl -s http://localhost:3100/health
```

---

## 3. 各模块重启命令

### 3.1 Ollama + qwen3.5

```bash
# 重启Ollama容器
docker restart ollama-local && sleep 5

# 验证qwen3.5是否就绪
curl -s http://localhost:11434/api/tags | jq -r '.models[].name'
```

### 3.2 xinference (bge-m3, bge-reranker-v2-m3)

```bash
# 方法1：如果xinference正常运行，直接运行启动脚本
python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py

# 方法2：如果xinference卡死，需要重启容器
docker restart xinference && sleep 15 && python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py

# 验证模型是否就绪
curl -s http://localhost:8085/v1/models | jq -r '.data[].id'
```

### 3.3 brain-server (Docker)

```bash
# 重新构建并重启
cd /home/ubutnu/code/cloai-code
docker compose -f deploy/docker-compose-brain-ts.yml build brain-server
docker compose -f deploy/docker-compose-brain-ts.yml up -d brain-server

# 停止并删除旧容器
docker stop ai4kb-frontend
docker rm ai4kb-frontend

# 重新启动生产前端
docker compose -f deploy/docker-compose-brain-ts.yml up -d frontend

# 验证
sleep 3 && docker ps --filter name=ai4kb-frontend --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 仅重启（不重新构建）
docker compose -f deploy/docker-compose-brain-ts.yml restart brain-server

# 验证
curl -s http://localhost:8091/api/v1/pre/context -H "Authorization: Bearer test" 2>&1 | head -1
```

### 3.4 brain (Docker)

```bash
# 重启brain容器
docker compose -f deploy/docker-compose-brain-ts.yml restart brain

# 验证
curl -s http://localhost:3100/health
```

### 3.5 RAGFlow

```bash
# 重启RAGFlow
docker restart ragflow-server && sleep 10

# 验证
curl -s http://localhost:8084 | head -1
```

---

## 4. 一键重启所有服务

```bash
# 重启xinference模型
python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py

# 重启brain-server 和 brain（Docker内）
cd /home/ubutnu/code/cloai-code && docker compose -f deploy/docker-compose-brain-ts.yml restart brain-server brain
```

---

## 5. 验证命令

### 5.1 检查所有模型状态

```bash
# Ollama qwen3.5
curl -s http://localhost:11434/api/tags | jq -r '.models[].name'

# xinference embedding/rerank
curl -s http://localhost:8085/v1/models | jq -r '.data[].id'
```

### 5.2 验证brain-server

```bash
# 登录获取token
# 注意：用户名是 superadmin（不是 admin），密码是 ChangeMe123!
TOKEN=$(curl -s -X POST http://localhost:8091/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "superadmin", "password": "ChangeMe123!"}' | jq -r '.accessToken')

# 测试普通问答（应直接回答）
curl -s -X POST http://localhost:8091/api/v1/brain/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "你好"}'

# 测试RAG调用（应返回知识库检索结果）
curl -s -X POST http://localhost:8091/api/v1/brain/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "请调用rag skill，什么是半面积"}'
```

### 5.3 验证brain直接调用

```bash
# 获取token
TOKEN=$(curl -s -X POST http://localhost:8091/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "superadmin", "password": "ChangeMe123!"}' | jq -r '.accessToken')

# 直接调用brain（通过brain-server代理）
curl -s -X POST http://localhost:8091/api/v1/brain/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "你好"}'
```

---

## 6. 常见问题排查

### 6.1 "brain_service_unavailable"

检查brain是否在3100端口运行：
```bash
curl -s http://localhost:3100/health
```

### 6.2 "Model not found in the model list, uid: bge-m3"

xinference模型未启动，执行：
```bash
python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py
```

### 6.3 "JSON.stringify cannot serialize BigInt"

brain-server版本过旧，需要重新构建：
```bash
cd /home/ubutnu/code/cloai-code
docker compose -f deploy/docker-compose-brain-ts.yml build brain-server
docker compose -f deploy/docker-compose-brain-ts.yml up -d brain-server
```

### 6.4 RAGFlow返回 "You don't own the chat"

RAGFlow API认证配置错误，检查：
```bash
cat /home/ubutnu/code/cloai-code/.env.brain | grep RAGFLOW
```

---

## 7. Docker服务管理

```bash
# 查看所有运行中的容器
docker ps

# 查看brain相关容器
docker ps | grep -E "brain|postgres|redis"

# 查看容器日志
docker logs ai4kb-brain-server --tail 50
docker logs ai4kb-brain --tail 50
docker logs ai4kb-frontend --tail 50
docker logs xinference --tail 50
docker logs ollama-local --tail 50

# 停止所有brain服务
docker compose -f deploy/docker-compose-brain-ts.yml down

# 强制重建并启动
docker compose -f deploy/docker-compose-brain-ts.yml build --no-cache
docker compose -f deploy/docker-compose-brain-ts.yml up -d
```

---

## 8. 前端部署说明

### 8.1 两种前端模式对比

| 模式 | 端口 | 构建方式 | 热更新 | 适用场景 |
|------|------|----------|--------|----------|
| **生产前端** | 8086 | Dockerfile (静态文件) | ❌ | 正式测试/生产环境 |
| **开发前端** | 8087 | Dockerfile.dev (Vite) | ✅ | 前端开发调试 |

### 8.2 生产前端操作

```bash
# 进入项目目录
cd /home/ubutnu/code/cloai-code

# 重新构建生产前端镜像
docker compose -f deploy/docker-compose-brain-ts.yml build frontend

# 启动/重启生产前端
docker compose -f deploy/docker-compose-brain-ts.yml up -d frontend

# 访问地址
http://localhost:8086
```

### 8.3 开发前端操作

开发前端使用 `--profile dev`，默认不启动。

```bash
cd /home/ubutnu/code/cloai-code

# 启动开发前端（Vite 热更新）
docker compose -f deploy/docker-compose-brain-ts.yml --profile dev up -d frontend-dev

# 访问地址
http://localhost:8087

# 停止开发前端
docker compose -f deploy/docker-compose-brain-ts.yml --profile dev down

# 查看开发前端日志
docker logs ai4kb-frontend-dev --tail 50
```

### 8.4 前端代码修改后重新部署

**方法1：使用 Docker Compose（推荐）**
```bash
cd /home/ubutnu/code/cloai-code
docker compose -f deploy/docker-compose-brain-ts.yml build frontend
docker compose -f deploy/docker-compose-brain-ts.yml up -d frontend
```

**方法2：手动复制构建产物**
```bash
# 1. 进入前端目录并构建
cd /home/ubutnu/code/cloai-code/frontend
npm run build

# 2. 复制构建产物到容器
docker cp dist/. ai4kb-frontend:/app/dist/

# 3. 重启前端容器
docker restart ai4kb-frontend
```

### 8.5 清除冗余开发前端

如果不需要开发前端，可以停止并移除 `frontend-dev` 服务：

```bash
cd /home/ubutnu/code/cloai-code/deploy

# 停止开发前端容器
docker stop ai4kb-frontend-dev
docker rm ai4kb-frontend-dev

# 从 docker-compose 中移除（可选，编辑 docker-compose-brain-ts.yml 删除 frontend-dev 部分）
```

---

## 9. 前端开发模式 API 测试

### 8.1 一键启动

使用 `--profile dev` 启动前端开发服务（与主服务共享网络）：

```bash
cd /home/ubutnu/code/cloai-code

# 启动前端开发模式（使用 profile，自动连接到 ai4kb-brain-net 网络）
docker compose -f deploy/docker-compose-brain-ts.yml --profile dev up -d frontend-dev

# 验证启动
sleep 5 && docker logs ai4kb-frontend-dev
```

**说明：**
- 前端开发服务使用 **8087 端口**（避免与生产前端 8086 冲突）
- 已添加到 `docker-compose-brain-ts.yml` 的 `frontend-dev` 服务中
- 通过 `profiles: ["dev"]` 控制，默认不启动

### 8.2 Vite 代理配置说明

前端 `vite.config.js` 中的代理配置确保 API 请求正确转发到后端：

```javascript
proxy: {
  // 对话相关（重写到 brain/query）
  '/api/v1/agent/chat/stream': {
    target: backendUrl,
    changeOrigin: true,
    ws: true,
    rewrite: (path) => '/api/v1/brain/query'
  },
  // 其他 /api/v1/ 请求直接转发
  '/api/v1/': {
    target: backendUrl,
    changeOrigin: true,
    rewrite: (path) => path
  },
  // ...
}
```

### 8.3 API 测试

#### 登录获取 Token

```bash
# 超级管理员账号
TOKEN=$(curl -s -X POST http://localhost:8087/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ChangeMe123!"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

echo "Token: ${TOKEN:0:50}..."
```

#### 测试 1：普通问答

```bash
curl -s -N -X POST http://localhost:8087/api/v1/agent/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"你好"}'
```

**预期输出：**
```
event: message
data: {"answer":"你好！很高兴见到你。有什么我可以帮你的吗？"}
```

#### 测试 2：RAG 查询

```bash
curl -s -N -X POST http://localhost:8087/api/v1/agent/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"请调用rag skill，什么是半面积"}'
```

**预期输出（应包含完整 SSE 事件流）：**
```
event: skill_start
data: {"type":"skill_start","skillName":"rag-query"}

event: skill_end
data: {"type":"skill_end","skillName":"rag-query","result":"根据知识库中的信息...",...}

event: message
data: {"answer":"根据查询结果，**半面积**是指...",...}
```

### 8.4 常见问题

#### 前端无法连接后端（DNS 解析失败）

如果日志显示 `getaddrinfo EAI_AGAIN ai4kb-brain-server`：
```bash
# 检查容器网络
docker network inspect ai4kb-brain-net --format '{{range .Containers}}{{.Name}} {{end}}'

# 重新连接容器到网络
docker network connect deploy_ai4kb-brain-net ai4kb-frontend-dev
```

#### 404 错误

确保 `vite.config.js` 中包含 `/api/v1/agent/chat/stream` 的代理规则。

---

## 10. Ollama 配置（qwen3.5 模型调优）

> **重要：** qwen3.5 模型默认开启 thinking 模式，thinking 内容会膨胀到 8K-20K tokens。
> 这会消耗大量 `max_output_tokens` budget，导致 content 被截断为 0，回答为空甚至卡死。
> 需通过增大 `CLAUDE_CODE_MAX_OUTPUT_TOKENS` 解决。

### 9.1 当前配置（docker-compose-brain-ts.yml）

```yaml
ollama-local:
  image: ollama/ollama:latest
  container_name: ollama-local
  restart: unless-stopped
  network_mode: bridge
  ports:
    - "11434:11434"
  environment:
    - OLLAMA_HOST=0.0.0.0:11434
    - OLLAMA_MODELS=/root/.ollama/models
    # 模型保活时间（默认5分钟，0为永久）
    - OLLAMA_KEEP_ALIVE=5m
    # 最大并发数（qwen3.5:9b 建议设为1，避免显存竞争）
    - OLLAMA_NUM_PARALLEL=1
    # 加载超时（模型较大时可调大）
    - OLLAMA_LOAD_TIMEOUT=5m0s
  volumes:
    - ollama_data:/root/.ollama
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
```

**brain 服务的额外配置（确保 output token 预算充足）：**

```yaml
brain:
  # ... 其他配置 ...
  environment:
    # ... 其他 env ...
    # qwen3.5 thinking 模式需要更大的 output token budget（thinking 可能长达 8K-20K tokens）
    - CLAUDE_CODE_MAX_OUTPUT_TOKENS=20000
```

### 9.2 可调整参数说明

| 参数 | 位置 | 默认值 | 推荐值 | 说明 |
|------|------|--------|--------|------|
| `OLLAMA_KEEP_ALIVE` | ollama-local | `5m` | `5m` | 模型保活时间，0为永久 |
| `OLLAMA_NUM_PARALLEL` | ollama-local | `1` | `1` | 最大并发数，避免显存竞争 |
| `OLLAMA_LOAD_TIMEOUT` | ollama-local | `5m0s` | `5m0s` | 模型加载超时时间 |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | brain | `8192` | **`20000`** | **关键参数**，thinking 可能很长 |
| `OLLAMA_MAX_LOADED_MODELS` | ollama-local | `0`（无限制） | `0` | 同时加载模型数 |

### 9.3 问题根因说明

qwen3.5:9b 模型在 OpenAI-compatible API 下的行为：
1. 先执行 thinking（8K-20K tokens）
2. 再输出 content
3. `max_output_tokens` 默认 8192（`CLAUDE_CODE_MAX_OUTPUT_TOKENS` 默认值）
4. thinking 就把 8192 吃完了 → content 被截断为 0 → 回答为空
5. 长时间 context 满了之后 → 模型卡死

### 9.4 验证修复

```bash
# 重启 ollama-local 和 brain 后测试
TOKEN=$(curl -s -X POST http://localhost:8091/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"ChangeMe123!"}' | jq -r '.accessToken')

curl -s -N -X POST http://localhost:8091/api/v1/brain/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"你好，今天是星期几？"}'

# 预期：有内容、格式良好的回答（非空）
# 响应时间应 <5 秒
```

### 9.5 常见问题

- **修改 `OLLAMA_NUM_PARALLEL` 后不生效？** 需要重建容器 `docker compose up -d --force-recreate ollama-local`
- **模型加载慢？** 增加 `OLLAMA_LOAD_TIMEOUT`，如 `10m0s`
- **回答仍然为空？** 确认 `CLAUDE_CODE_MAX_OUTPUT_TOKENS=20000` 已设置在 **brain** 容器而非 ollama-local
- **显存不够？** 确保 xinference 模型先占用后，Ollama 再加载；减少 `OLLAMA_NUM_PARALLEL` 为 1

---

## 11. 环境变量参考

brain (Docker内运行) 需要的环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| OPENAI_BASE_URL | http://host.docker.internal:11434/v1 | Ollama API地址（通过host.docker.internal访问宿主机） |
| ANTHROPIC_API_KEY | (空) | Ollama不需要key |
| ANTHROPIC_BASE_URL | http://host.docker.internal:11434/v1 | Ollama API地址 |
| ANTHROPIC_MODEL | qwen3.5:9b | 模型名称 |
| BRAIN_SERVER_BASE_URL | http://brain-server:8091 | brain-server服务地址（Docker内部DNS） |
| BRAIN_SERVER_ACCESS_TOKEN | (空) | 本地开发可不填 |
| CLAUDE_CODE_MAX_OUTPUT_TOKENS | 20000 | qwen3.5 thinking 模式需要更大的 output budget |
