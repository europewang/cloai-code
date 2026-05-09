# cloai-code 项目启动与重启指南

本文档包含项目各模块的启动、重启、验证和管理命令。

---

## 1. 项目整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                         前端 (8086/8087)                          │
│              Vue 3 + Vite（生产/开发两种模式）                     │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│              brain-server (8091) - Docker                        │
│  - Pre-server: 获取上下文、权限                                   │
│  - Post-server: skill鉴权、审计                                  │
│  - Skills路由: 技能CRUD、工具目录、文件上传下载                   │
│  - Conversations路由: 会话管理、消息存储                         │
│  - Admin路由: 用户/权限/审计/文件管理                            │
│  - Brain路由: 统一推理入口，代理到brain service                 │
│  - RAG路由: RagFlow检索代理（流式/非流式）                       │
│  - 技术栈: Fastify + PostgreSQL + Redis + MongoDB + S3          │
└──────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼──────────────────┐
              ▼               ▼                  ▼
┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────────┐
│  brain (3100)   │  │  RagFlow (8084)  │  │  PostgreSQL (5433)      │
│  Docker         │  │  Docker          │  │  Docker                 │
│  src brain      │  │  知识库检索      │  │  用户/权限/会话/审计     │
│  SkillTool执行  │  │                  │  │  MongoDB (27018)        │
│  Ollama推理     │  └──────────────────┘  │  Docker                 │
└─────────────────┘                        │  Skill markdown存储      │
              │                            │  Redis (6380)           │
              ▼                            │  Docker                 │
┌─────────────────────────┐                │  policy版本/chat映射    │
│  Ollama (11434)         │                └─────────────────────────┘
│  Docker                 │
│  qwen3.5:9b            │
└─────────────────────────┘
              │
              ▼
┌─────────────────────────┐  ┌─────────────────────────────────────┐
│  xinference (8085)      │  │  MinIO (9002) - Docker              │
│  Docker                 │  │  S3兼容存储（可选）                   │
│  bge-m3 (embedding)     │  └─────────────────────────────────────┘
│  bge-reranker-v2-m3     │
└─────────────────────────┘
```

**说明**：

- **brain-server**：企业后端，负责认证授权、权限管理、会话存储、文件管理、RAG代理、审计
- **brain**（src brain）：AI推理核心，运行SkillTool执行forked skills，调用Ollama进行LLM推理
- **brain** 通过 `BRAIN_SERVER_BASE_URL=http://localhost:8091` 与 brain-server 通信
- **brain** 使用 `host.docker.internal:3100` 以 host 网络模式运行，直接监听宿主机3100端口

---

## 2. Docker 服务依赖关系

### 2.1 必须服务（默认启动）

```
brain-postgres ──┐
                 ├── brain-server ──► brain ──► ollama-local
brain-redis  ────┤
brain-mongo  ────┤
                 └── frontend
```

### 2.2 可选服务

| 服务 | 用途 | 启动方式 |
|------|------|----------|
| `frontend-dev` | 前端开发（Vite热更新，8087） | `--profile dev` |
| `brain-maintenance` | 定时维护任务 | `--profile maintenance` |
| `xinference` | Embedding/Reranker模型 | 独立 `docker-compose-xinference.yml` |

---

## 3. 快速启动（首次部署）

### 3.1 一键启动所有服务

```bash
cd /home/ubutnu/code/cloai-code

# 1. 构建并启动所有服务（包括前端、brain-server、brain）
docker compose -f deploy/docker-compose-brain-ts.yml build
docker compose -f deploy/docker-compose-brain-ts.yml up -d

# 2. 启动 xinference（embedding/rerank 模型，独立 compose）
cd /home/ubutnu/code/cloai-code/deploy
docker compose -f docker-compose-xinference.yml up -d

# 3. 等待 xinference 就绪后，加载模型
sleep 15 && python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py

# 4. 验证所有服务
curl -s http://localhost:8091/api/health
curl -s http://localhost:8091/api/ready
curl -s http://localhost:3100/health
```

### 3.2 验证 brain-server 就绪状态

```bash
# 进程级健康（总是返回 ok）
curl -s http://localhost:8091/api/health

# 依赖就绪（检查 PostgreSQL + Redis）
curl -s http://localhost:8091/api/ready | jq .

# 预期输出（全部 ok）：
# {"status":"ok","checks":{"postgres":"ok","redis":"ok"}}
```

---

## 4. 各模块重启命令

### 4.1 Ollama + qwen3.5

```bash
# 重启 Ollama 容器
docker restart ollama-local && sleep 5

# 验证 qwen3.5 是否就绪
curl -s http://localhost:11434/api/tags | jq -r '.models[].name'

# 强制重新加载模型
curl -s -X POST http://localhost:11434/api/pull -d '{"name":"qwen3.5:9b"}'
```

### 4.2 xinference (bge-m3, bge-reranker-v2-m3)

```bash
# 方法1：使用 docker-compose 启动 xinference（推荐）
cd /home/ubutnu/code/cloai-code/deploy
docker compose -f docker-compose-xinference.yml up -d

# 方法2：如果 xinference 已运行，直接运行启动脚本
python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py

# 方法3：如果 xinference 卡死，需要重启容器后加载模型
docker restart xinference && sleep 15 && python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py

# 验证模型是否就绪
curl -s http://localhost:8085/v1/models | jq -r '.data[].id'
```

### 4.3 brain-server (Docker)

```bash
cd /home/ubutnu/code/cloai-code

# 重新构建并重启
docker compose -f deploy/docker-compose-brain-ts.yml build brain-server
docker compose -f deploy/docker-compose-brain-ts.yml up -d brain-server

# 仅重启（不重新构建）
docker compose -f deploy/docker-compose-brain-ts.yml restart brain-server

# 验证
curl -s http://localhost:8091/api/ready
```

### 4.4 brain (Docker)

```bash
# 重启 brain 容器（SkillTool + Ollama 推理核心）
docker compose -f deploy/docker-compose-brain-ts.yml restart brain

# 验证
curl -s http://localhost:3100/health
```

### 4.5 前端（生产模式）

```bash
cd /home/ubutnu/code/cloai-code

# 重新构建并重启生产前端
docker compose -f deploy/docker-compose-brain-ts.yml build frontend
docker compose -f deploy/docker-compose-brain-ts.yml up -d frontend

# 停止并删除旧容器
docker stop ai4kb-frontend && docker rm ai4kb-frontend

# 验证
sleep 3 && docker ps --filter name=ai4kb-frontend --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### 4.6 RAGFlow

```bash
# 重启 RAGFlow
docker restart ragflow-server && sleep 10

# 验证
curl -s http://localhost:8084 | head -1
```

### 4.7 PostgreSQL（brain-postgres）

```bash
# 重启 PostgreSQL
docker restart ai4kb-brain-postgres && sleep 5

# 验证连接
docker exec -it ai4kb-brain-postgres pg_isready -U postgres -d ai4kb_brain
```

### 4.8 Redis（brain-redis）

```bash
# 重启 Redis
docker restart ai4kb-brain-redis && sleep 2

# 验证连接
docker exec -it ai4kb-brain-redis valkey-cli ping
```

### 4.9 MongoDB（brain-mongo）

```bash
# 重启 MongoDB
docker restart ai4kb-brain-mongo && sleep 5

# 验证连接
docker exec -it ai4kb-brain-mongo mongosh --eval "db.adminCommand('ping')"
```

---

## 5. 一键重启所有服务

```bash
cd /home/ubutnu/code/cloai-code

# 重启 xinference（embedding/rerank 模型）
cd /home/ubutnu/code/cloai-code/deploy
docker compose -f docker-compose-xinference.yml restart
sleep 15 && python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py

# 重启 brain-server、brain 和前端（Docker内）
cd /home/ubutnu/code/cloai-code
docker compose -f deploy/docker-compose-brain-ts.yml restart brain-server brain frontend
```

---

## 6. 前端部署说明

### 6.1 两种前端模式对比

| 模式 | 端口 | 构建方式 | 热更新 | 适用场景 |
|------|------|----------|--------|----------|
| **生产前端** | 8086 | Dockerfile (静态文件) | ❌ | 正式测试/生产环境 |
| **开发前端** | 8087 | Dockerfile.dev (Vite) | ✅ | 前端开发调试 |

### 6.2 生产前端操作

```bash
cd /home/ubutnu/code/cloai-code

# 重新构建生产前端镜像
docker compose -f deploy/docker-compose-brain-ts.yml build frontend

# 启动/重启生产前端
docker compose -f deploy/docker-compose-brain-ts.yml up -d frontend

# 访问地址
http://localhost:8086
```

### 6.3 开发前端操作

```bash
cd /home/ubutnu/code/cloai-code

# 启动前端开发模式（Vite 热更新）
docker compose -f deploy/docker-compose-brain-ts.yml --profile dev up -d frontend-dev

# 访问地址
http://localhost:8087

# 停止开发前端
docker compose -f deploy/docker-compose-brain-ts.yml --profile dev down

# 查看开发前端日志
docker logs ai4kb-frontend-dev --tail 50
```

### 6.4 前端代码修改后重新部署

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

---

## 7. API 测试

### 7.1 登录获取 Token

> 注意：用户名是 `superadmin`（不是 `admin`），密码是 `ChangeMe123!`

```bash
TOKEN=$(curl -s -X POST http://localhost:8091/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "superadmin", "password": "ChangeMe123!"}' | jq -r '.accessToken')

echo "Token: ${TOKEN:0:50}..."
```

### 7.2 测试普通问答

```bash
# 通过 brain-server 代理测试
curl -s -X POST http://localhost:8091/api/v1/brain/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "你好"}'
```

### 7.3 测试 RAG 调用（流式）

```bash
curl -s -N -X POST http://localhost:8091/api/v1/rag/query/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "什么是半面积"}'
```

### 7.4 测试 RAG 查询（非流式）

```bash
curl -s -X POST http://localhost:8091/api/v1/rag/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "什么是半面积"}' | jq .
```

### 7.5 通过前端开发服务测试

```bash
# 通过 Vite 代理（开发前端 8087）
curl -s -N -X POST http://localhost:8087/api/v1/agent/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"你好"}'
```

### 7.6 获取用户上下文

```bash
curl -s http://localhost:8091/api/v1/brain/context \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### 7.7 获取技能列表

```bash
curl -s http://localhost:8091/api/v1/skills \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### 7.8 获取会话列表

```bash
curl -s http://localhost:8091/api/v1/conversations \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## 8. Ollama 配置（qwen3.5 模型调优）

> **重要**：qwen3.5 模型默认开启 thinking 模式，thinking 内容会膨胀到 8K-20K tokens。
> 这会消耗大量 `max_output_tokens` budget，导致 content 被截断为 0，回答为空甚至卡死。
> 需通过增大 `CLAUDE_CODE_MAX_OUTPUT_TOKENS` 解决。

### 8.1 当前配置（docker-compose-brain-ts.yml）

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

**brain 服务的额外配置（确保 output token 预算充足）**：

```yaml
brain:
  # ... 其他配置 ...
  environment:
    # qwen3.5 thinking 模式需要更大的 output token budget（thinking 可能长达 8K-20K tokens）
    - CLAUDE_CODE_MAX_OUTPUT_TOKENS=20000
```

### 8.2 可调整参数说明

| 参数 | 位置 | 默认值 | 推荐值 | 说明 |
|------|------|--------|--------|------|
| `OLLAMA_KEEP_ALIVE` | ollama-local | `5m` | `5m` | 模型保活时间，0为永久 |
| `OLLAMA_NUM_PARALLEL` | ollama-local | `1` | `1` | 最大并发数，避免显存竞争 |
| `OLLAMA_LOAD_TIMEOUT` | ollama-local | `5m0s` | `5m0s` | 模型加载超时时间 |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | brain | `8192` | **`20000`** | **关键参数**，thinking 可能很长 |
| `OLLAMA_MAX_LOADED_MODELS` | ollama-local | `0`（无限制） | `0` | 同时加载模型数 |

### 8.3 问题根因说明

qwen3.5:9b 模型在 OpenAI-compatible API 下的行为：

1. 先执行 thinking（8K-20K tokens）
2. 再输出 content
3. `max_output_tokens` 默认 8192（`CLAUDE_CODE_MAX_OUTPUT_TOKENS` 默认值）
4. thinking 就把 8192 吃完了 → content 被截断为 0 → 回答为空
5. 长时间 context 满了之后 → 模型卡死

### 8.4 常见问题

- **修改 `OLLAMA_NUM_PARALLEL` 后不生效？** 需要重建容器 `docker compose up -d --force-recreate ollama-local`
- **模型加载慢？** 增加 `OLLAMA_LOAD_TIMEOUT`，如 `10m0s`
- **回答仍然为空？** 确认 `CLAUDE_CODE_MAX_OUTPUT_TOKENS=20000` 已设置在 **brain** 容器而非 ollama-local
- **显存不够？** 确保 xinference 模型先占用后，Ollama 再加载；减少 `OLLAMA_NUM_PARALLEL` 为 1

---

## 9. 常见问题排查

### 9.1 "brain_service_unavailable"

检查 brain 是否在 3100 端口运行：

```bash
curl -s http://localhost:3100/health
```

### 9.2 "Model not found in the model list, uid: bge-m3"

xinference 模型未启动，执行：

```bash
python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py
```

### 9.3 "JSON.stringify cannot serialize BigInt"

brain-server 版本过旧，需要重新构建：

```bash
cd /home/ubutnu/code/cloai-code
docker compose -f deploy/docker-compose-brain-ts.yml build brain-server
docker compose -f deploy/docker-compose-brain-ts.yml up -d brain-server
```

### 9.4 RAGFlow 返回 "You don't own the chat"

RAGFlow API 认证配置错误，检查：

```bash
cat /home/ubutnu/code/cloai-code/.env.brain | grep RAGFLOW
```

### 9.5 前端无法连接后端（DNS 解析失败）

如果日志显示 `getaddrinfo EAI_AGAIN ai4kb-brain-server`：

```bash
# 检查容器网络
docker network inspect deploy_ai4kb-brain-net --format '{{range .Containers}}{{.Name}} {{end}}'

# 重新连接容器到网络
docker network connect deploy_ai4kb-brain-net ai4kb-frontend-dev
```

### 9.6 PostgreSQL 连接失败

```bash
# 检查 PostgreSQL 是否就绪
docker exec -it ai4kb-brain-postgres pg_isready -U postgres -d ai4kb_brain

# 查看 PostgreSQL 日志
docker logs ai4kb-brain-postgres --tail 20
```

### 9.7 Redis 连接失败

```bash
# 检查 Redis 是否就绪
docker exec -it ai4kb-brain-redis valkey-cli ping

# 查看 Redis 日志
docker logs ai4kb-brain-redis --tail 20
```

### 9.8 MongoDB 连接失败

```bash
# 检查 MongoDB 是否就绪
docker exec -it ai4kb-brain-mongo mongosh --eval "db.adminCommand('ping')"

# 查看 MongoDB 日志
docker logs ai4kb-brain-mongo --tail 20
```

---

## 10. Docker 服务管理

### 10.1 查看所有运行中的容器

```bash
docker ps
```

### 10.2 查看 brain 相关容器

```bash
docker ps | grep -E "brain|postgres|redis|mongo"
```

### 10.3 查看容器日志

```bash
# brain-server 日志
docker logs ai4kb-brain-server --tail 100

# brain（日志推理核心）日志
docker logs ai4kb-brain --tail 100

# 前端日志
docker logs ai4kb-frontend --tail 50
docker logs ai4kb-frontend-dev --tail 50

# xinference 日志
docker logs xinference --tail 50

# Ollama 日志
docker logs ollama-local --tail 50

# PostgreSQL 日志
docker logs ai4kb-brain-postgres --tail 50

# Redis 日志
docker logs ai4kb-brain-redis --tail 50

# MongoDB 日志
docker logs ai4kb-brain-mongo --tail 50
```

### 10.4 停止所有 brain 服务

```bash
docker compose -f deploy/docker-compose-brain-ts.yml down
```

### 10.5 强制重建并启动

```bash
cd /home/ubutnu/code/cloai-code
docker compose -f deploy/docker-compose-brain-ts.yml build --no-cache
docker compose -f deploy/docker-compose-brain-ts.yml up -d
```

---

## 11. 环境变量参考

### 11.1 brain-server 环境变量

brain-server (Docker内运行) 需要的环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `OPENAI_BASE_URL` | http://host.docker.internal:11434/v1 | Ollama API地址 |
| `ANTHROPIC_API_KEY` | (空) | Ollama不需要key |
| `ANTHROPIC_BASE_URL` | http://host.docker.internal:11434/v1 | Ollama API地址 |
| `ANTHROPIC_MODEL` | qwen3.5:9b | 模型名称 |
| `BRAIN_SERVER_BASE_URL` | http://brain-server:8091 | brain-server服务地址 |
| `BRAIN_SERVER_ACCESS_TOKEN` | (空) | 本地开发可不填 |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | 20000 | qwen3.5 thinking 模式需要更大的 output budget |
| `DATABASE_URL` | postgresql://postgres:postgres@brain-postgres:5432/ai4kb_brain | PostgreSQL 连接 |
| `REDIS_URL` | redis://brain-redis:6379 | Redis 连接 |
| `MONGO_URL` | mongodb://brain-mongo:27017 | MongoDB 连接 |
| `MONGO_DB_NAME` | ai4kb_brain | MongoDB 数据库名 |
| `SKILL_FILE_BASE_DIR` | /tmp/brain-skill-files | 技能文件根目录 |
| `SKILL_INPUT_BASE_DIR` | /tmp/brain-skill-files/inputs | 技能输入目录 |
| `SKILL_OUTPUT_BASE_DIR` | /tmp/brain-skill-files/outputs | 技能输出目录 |
| `SKILL_INDICATOR_SCRIPT_PATH` | /opt/skills/cad_text_extractor/run_skill.py | CAD指标验证脚本路径 |
| `BRAIN_SERVICE_URL` | http://host.docker.internal:3100 | brain service 地址 |
| `FILE_STORAGE_BACKEND` | local / s3 | 文件存储后端 |
| `RAGFLOW_BASE_URL` | http://ragflow-server:8084 | RagFlow 地址 |
| `JWT_SECRET` | (自定义) | JWT 签名密钥 |
| `JWT_ACCESS_EXPIRES_IN` | 8h | Access token 有效期 |
| `JWT_REFRESH_EXPIRES_IN` | 7d | Refresh token 有效期 |

### 11.2 brain（src brain）环境变量

brain (Docker内运行) 需要的环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `OPENAI_BASE_URL` | http://host.docker.internal:11434/v1 | Ollama API地址（通过host.docker.internal访问宿主机） |
| `ANTHROPIC_API_KEY` | ollama | Ollama不需要真实key |
| `ANTHROPIC_BASE_URL` | http://host.docker.internal:11434/v1 | Ollama API地址 |
| `ANTHROPIC_MODEL` | qwen3.5:9b | 模型名称 |
| `CLAUDE_CODE_COMPATIBLE_API_PROVIDER` | openai | API兼容模式 |
| `CLAUDE_CODE_SIMPLE` | 0 | 启用完整推理能力 |
| `BRAIN_SERVER_BASE_URL` | http://localhost:8091 | brain-server 服务地址（Docker内DNS） |
| `SKILL_INPUT_BASE_DIR` | /shared/brain-skill-files/inputs | 技能输入目录（共享volume） |
| `SKILL_OUTPUT_BASE_DIR` | /shared/brain-skill-files/outputs | 技能输出目录（共享volume） |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | 20000 | qwen3.5 thinking 模式需要更大的 output budget |

### 11.3 默认账号

| 角色 | 用户名 | 密码 | 说明 |
|------|--------|------|------|
| super_admin | superadmin | ChangeMe123! | 超级管理员（完整权限） |
| admin | admin | ChangeMe123! | 管理员（用户管理+技能管理） |
| user | zhangsan | ChangeMe123! | 普通用户（对话+RAG） |
| user | lisi | ChangeMe123! | 普通用户（对话+RAG） |

---

## 12. 维护任务

### 12.1 启动定时维护任务

```bash
# 启动维护容器（会话审计、文件状态检查等）
docker compose -f deploy/docker-compose-brain-ts.yml --profile maintenance up -d brain-maintenance
```

### 12.2 手动运行维护脚本

```bash
# 进入 brain-server 容器
docker exec -it ai4kb-brain-server sh

# 运行维护 tick
bun dist/scripts/maintenanceTick.js

# 运行文件状态检查
bun dist/scripts/smokeAdminFileStatusApis.js
```

### 12.3 数据库迁移

```bash
# 进入 brain-server 容器
docker exec -it ai4kb-brain-server sh

# 运行 Prisma 迁移
bunx prisma migrate deploy
```

---

## 13. 部署拓扑说明

### 13.1 网络架构

```
ai4kb-brain-net（Docker bridge 网络）
  ├── ai4kb-brain-server  (8091)
  ├── ai4kb-brain         ⚠️ host 网络模式，直连宿主机 3100
  ├── ai4kb-brain-postgres (5432)
  ├── ai4kb-brain-redis   (6379)
  ├── ai4kb-brain-mongo   (27017)
  ├── ai4kb-frontend      (8086)
  └── ai4kb-frontend-dev  (8087)

宿主机网络（brain host 模式）
  ├── 3100   ← brain (src brain)
  ├── 11434  ← ollama-local
  ├── 8084   ← ragflow-server
  ├── 8085   ← xinference
  └── 9002   ← MinIO (S3 兼容)
```

### 13.2 文件共享架构

```
宿主机 /home/ubutnu/code/cloai-code/
  ├── skills/                           ← 代码主机端
  └── .env.brain                        ← 环境变量
           │
           ▼ (挂载到容器)
容器内路径：
  ├── brain:        /opt/skills:ro      ← 只读挂载
  ├── brain-server: /opt/skills/cad_text_extractor:ro  ← CAD技能脚本
  │
  └── 共享 Volume: brain_skill_files
        ├── /shared/brain-skill-files/inputs/   ← 临时输入文件
        ├── /shared/brain-skill-files/outputs/  ← skill输出文件
        │
        ├── brain-server ◄─────────┐
        └── brain ─────────────────┘
```
