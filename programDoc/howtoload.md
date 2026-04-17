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
docker logs xinference --tail 50
docker logs ollama-local --tail 50

# 停止所有brain服务
docker compose -f deploy/docker-compose-brain-ts.yml down

# 强制重建并启动
docker compose -f deploy/docker-compose-brain-ts.yml build --no-cache
docker compose -f deploy/docker-compose-brain-ts.yml up -d
```

---

## 8. 环境变量参考

brain (Docker内运行) 需要的环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| OPENAI_BASE_URL | http://host.docker.internal:11434/v1 | Ollama API地址（通过host.docker.internal访问宿主机） |
| ANTHROPIC_API_KEY | (空) | Ollama不需要key |
| ANTHROPIC_BASE_URL | http://host.docker.internal:11434/v1 | Ollama API地址 |
| ANTHROPIC_MODEL | qwen3.5:9b | 模型名称 |
| BRAIN_SERVER_BASE_URL | http://brain-server:8091 | brain-server服务地址（Docker内部DNS） |
| BRAIN_SERVER_ACCESS_TOKEN | (空) | 本地开发可不填 |
