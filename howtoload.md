# 知识库文档解析配置指南

## 概述

本系统使用 RagFlow 作为知识库后端。文档解析功能需要 RagFlow 用户会话认证，本指南说明如何配置用户凭证。

## RagFlow 账号配置

### 步骤 1: 编辑配置文件

编辑 `.env.brain` 文件，修改以下配置项：

```bash
# RagFlow 用户凭证（用于文档解析，需要用户会话认证）
RAGFLOW_USER=your_email@domain.com    # 你的 RagFlow 登录邮箱
RAGFLOW_PASSWORD=your_password        # 你的 RagFlow 登录密码
```

**注意**: 邮箱地址中的 `foxmial` 拼写是用户提供的原始输入，实际 RagFlow 系统中的邮箱可能略有不同。

### 步骤 2: 重启服务

修改配置后，需要重启 brain-server 服务使配置生效：

```bash
cd /home/ubutnu/code/cloai-code/deploy
docker compose -f docker-compose-brain-ts.yml restart brain-server
```

### 步骤 3: 验证配置

重启后，可以通过 API 测试验证配置是否正确：

```bash
# 获取 admin token
TOKEN=$(curl -s -X POST http://localhost:8091/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123456"}' | \
  jq -r '.accessToken')

# 测试文档解析 API
curl -X POST "http://localhost:8091/api/v1/admin/datasets/{dataset_id}/documents/run" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"doc_ids":["{document_id}"]}'
```

## 配置说明

### 为什么需要用户凭证？

RagFlow 的文档解析 API (`POST /v1/document/run`) 使用 `@login_required` 装饰器保护，这意味着：
- API Key 认证（如 `Bearer ragflow-xxx`）只能访问部分 API
- 文档解析需要完整的用户会话认证

当配置了 `RAGFLOW_USER` 和 `RAGFLOW_PASSWORD` 后，系统会自动：
1. 首先尝试使用 API Key 认证
2. 如果返回 401/403 错误，自动尝试使用配置的凭证登录
3. 使用返回的会话 Cookie 进行文档解析

### 配置优先级

RagFlow 认证配置优先级（从上到下）：
1. `RAGFLOW_AUTHORIZATION` - 直接设置 Authorization 头
2. `RAGFLOW_BEARER_TOKEN` - 使用 Bearer Token
3. `RAGFLOW_API_KEY` - 使用 API Key
4. `RAGFLOW_USER` + `RAGFLOW_PASSWORD` - 用户名密码登录（仅用于解析 API）

## 故障排查

### 问题 1: 文档解析返回 401/403 错误

**症状**: 调用解析 API 返回认证错误

**解决方案**:
1. 检查 `.env.brain` 中的 `RAGFLOW_USER` 和 `RAGFLOW_PASSWORD` 是否正确
2. 确保 RagFlow 服务正在运行
3. 测试 RagFlow 登录是否成功：
   ```bash
   curl -X POST "http://localhost:8084/v1/login" \
     -H "Content-Type: application/json" \
     -d '{"email":"your_email@domain.com","password":"your_password"}'
   ```

### 问题 2: 文档上传成功但解析失败

**症状**: 文档可以上传到知识库，但点击解析后没有反应

**可能原因**:
- RagFlow 存储配置问题（STORAGE_IMPL 为 null）
- LLM 模型未配置

**解决方案**: 在 RagFlow Web 界面 (http://localhost:8084) 中手动触发解析

### 问题 3: 切片加载失败

**症状**: 点击文档后看不到切片内容

**解决方案**: 确认文档已经完成解析（`run` 状态为 `DONE`）

## RagFlow 服务管理

### 查看 RagFlow 容器状态

```bash
docker ps | grep ragflow
```

### 查看 RagFlow 日志

```bash
docker logs ragflow-server -f
```

### 重启 RagFlow 服务

```bash
docker restart ragflow-server
```

## 相关文件

- `.env.brain` - 主要配置文件
- `brain-server/src/server.ts` - 后端 API 实现
- `brain-server/src/config.ts` - 配置定义
