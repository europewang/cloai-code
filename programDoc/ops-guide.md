# 运维手册

> 更新时间：2026-05-12  
> 作用：各模块启动、重启、验证和故障排查命令。

---

## 1. 服务架构

```
┌─────────────────────────────────────────┐
│  前端 (8086/8087)                        │
│  Vue 3 + Vite（生产/开发）                │
└──────────────────┬──────────────────────┘
                   │ http://brain-server:8091
                   ▼
┌─────────────────────────────────────────┐
│  brain-server (8091) — Docker 容器        │
│  ai4kb-brain-server                     │
│  Fastify + TypeScript + Prisma           │
│  PostgreSQL(5433) + Redis(6380)        │
└──────────────────┬──────────────────────┘
                   │
     ┌─────────────┼─────────────┬─────────────┐
     ▼             ▼             ▼             ▼
┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  brain  │  │ RagFlow  │  │ Ollama   │  │ Xinference│
│ (3100)  │  │ (8084)   │  │ (11434)  │  │ (8085)   │
└─────────┘  └──────────┘  └──────────┘  └──────────┘
```

**注意**：主机上 `node dist/index.js` 进程与 Docker 容器内的服务无关。

---

## 2. 快速启动

### 2.1 完整启动（首次部署）

```bash
cd /home/ubutnu/code/cloai-code

# 构建并启动核心服务
docker compose -f deploy/docker-compose-brain-ts.yml build
docker compose -f deploy/docker-compose-brain-ts.yml up -d

# 启动 Xinference（可选，Embedding/Reranker 模型）
cd deploy
docker compose -f docker-compose-xinference.yml up -d
python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py
```

### 2.2 核心服务状态

| 服务 | 容器名 | 端口 | 必需 |
|---|---|---|---|
| brain-server | ai4kb-brain-server | 8091 | ✅ |
| 前端（生产） | ai4kb-frontend | 8086 | ✅ |
| 前端（开发） | ai4kb-frontend-dev | 8087 | 可选 |
| PostgreSQL | ai4kb-brain-postgres | 5433 | ✅ |
| Redis | valkey | 6380 | ✅ |
| RagFlow | ragflow | 8084 | ✅ |
| brain | ai4kb-brain | 3100 | ✅ |
| Ollama | ollama-local | 11434 | ✅ |
| Xinference | xinference | 8085 | 可选 |
| MongoDB | ai4kb-brain-mongo | 27018 | ✅ |
| MinIO | — | 9002 | ✅ |

---

## 3. 各模块重启命令

### 3.1 brain-server（代码改动后）

**方案 A — 快速调试（不改 Dockerfile 时）：**

```bash
cd /home/ubutnu/code/cloai-code/brain-server

# 1. 编译
npx tsc -p tsconfig.json

# 2. 同步到容器
docker cp dist/server.js ai4kb-brain-server:/app/dist/server.js

# 3. 重启
docker restart ai4kb-brain-server
```

**方案 B — 标准发布（改了依赖/schema/Dockerfile 时）：**

```bash
cd /home/ubutnu/code/cloai-code/brain-server

# 编译
npx tsc -p tsconfig.json

# 构建镜像
docker build -t deploy-brain-server:<日期> .

# 更新 compose 文件镜像版本，或直接 rebuild
docker compose -f deploy/docker-compose-brain-ts.yml up -d --build
```

### 3.2 Ollama

```bash
docker restart ollama-local && sleep 5
curl -s http://localhost:11434/api/tags | jq -r '.models[].name'
```

### 3.3 Xinference

```bash
cd /home/ubutnu/code/cloai-code/deploy
docker compose -f docker-compose-xinference.yml up -d
python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py
```

### 3.4 前端

```bash
# 生产
docker compose -f deploy/docker-compose-brain-ts.yml up -d ai4kb-frontend

# 开发热更新
docker compose -f deploy/docker-compose-brain-ts.yml up -d ai4kb-frontend-dev
```

---

## 4. API 验证命令

### 4.1 健康检查

```bash
# 进程健康
curl http://localhost:8091/api/health
# → {"status":"ok","service":"brain-server"}

# 依赖就绪
curl http://localhost:8091/api/ready
# → {"status":"ok","checks":{"postgres":"ok","redis":"ok"}}
```

### 4.2 登录测试

```bash
# superadmin（super_admin）
TOKEN=$(curl -s -X POST http://localhost:8091/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"ChangeMe123!"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")

# lisi（user）
TOKEN_LISI=$(curl -s -X POST http://localhost:8091/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"lisi","password":"ChangeMe123!"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
```

### 4.3 知识库列表（含权限过滤验证）

```bash
# lisi 应该只能看到自己创建的 2 个库
curl http://localhost:8091/api/v1/admin/datasets \
  -H "Authorization: Bearer $TOKEN_LISI" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'共 {len(d)} 个库:', [x['name'] for x in d])"
```

### 4.4 RAG 流式查询

```bash
curl -s -N -X POST http://localhost:8091/api/v1/rag/query/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "什么是半面积"}'
```

### 4.5 权限上下文

```bash
curl http://localhost:8091/api/v1/brain/context \
  -H "Authorization: Bearer $TOKEN_LISI" \
  | python3 -m json.tool
```

### 4.6 回归测试

```bash
# governance e2e
cd /home/ubutnu/code/cloai-code/brain-server
python3 test/run_governance_e2e.py

# file status smoke
bun run ops:smoke-admin-file-status
```

---

## 5. 故障排查

### 5.1 "brain_service_unavailable"

```bash
# 检查 brain 是否在 3100 端口运行
curl -s http://localhost:3100/health || echo "brain 不在 3100"
# 检查容器是否 Running
docker ps | grep ai4kb-brain
```

### 5.2 "Model not found in the model list"

xinference 模型未启动：
```bash
python3 /home/ubutnu/code/cloai-code/launch_xinference_models.py
```

### 5.3 Ollama 连接失败（ragflow 中）

```bash
# 在 ragflow 容器内测试
docker exec ragflow curl -s http://host.docker.internal:11434/api/tags
# 如失败：docker exec ragflow ping host.docker.internal
```

### 5.4 brain-server 连接 Postgres/Redis 超时

```bash
# 检查 Postgres
docker exec ai4kb-brain-postgres pg_isready -U postgres

# 检查 Redis
docker exec valkey redis-cli ping

# 检查 brain-server 日志
docker logs ai4kb-brain-server --tail 50
```

---

## 6. 默认账号

| 角色 | 用户名 | 密码 |
|---|---|---|
| super_admin | superadmin | ChangeMe123! |
| admin | admin | ChangeMe123! |
| user | zhangsan | ChangeMe123! |
| user | lisi | ChangeMe123! |

---

## 7. 关键文件路径

| 用途 | 路径 |
|---|---|
| Docker 编排 | `deploy/docker-compose-brain-ts.yml` |
| brain-server 入口 | `brain-server/src/index.ts` |
| brain-server 主路由 | `brain-server/src/server.ts` |
| Prisma schema | `brain-server/prisma/schema.prisma` |
| 前端主组件 | `frontend/src/App.jsx` |
| 前端代理层 | `frontend/server.js` |
| brain 主服务 | `src/services/brainOrchestration/brainService.ts` |
