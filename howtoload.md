# RagFlow 配置指南

## 概述

本系统使用 RagFlow 作为知识库文档解析引擎。RagFlow 的某些 API（如文档解析）需要用户会话认证，而不仅仅是 API Key。

## 当前配置状态

### 1. API Key 配置（已工作）

API Key 用于访问不需要用户会话的 API：

```
RAGFLOW_BASE_URL=http://host.docker.internal:8084
RAGFLOW_AUTHORIZATION=Bearer ragflow-rKofJZKLNgh_2Pv9A-0y_3sUbC9MIOkw9n99Cl5hvc4
```

**可用的 API（使用 API Key）**：
- 获取知识库列表
- 获取文档列表
- 获取文档切片
- 获取文档文件

### 2. 用户凭证配置（需要设置）

用户凭证用于需要会话认证的 API：

```
RAGFLOW_USER=europewang@foxmail.com
RAGFLOW_PASSWORD=你的密码
```

**需要的 API（使用用户凭证）**：
- 触发文档解析
- 上传并解析文档

## 如何设置 RagFlow 用户密码

### 方法一：通过 RagFlow Web 界面

1. 访问 RagFlow Web 界面：http://localhost:8084
2. 使用现有账号登录
3. 进入「设置」→「个人信息」
4. 修改密码

### 方法二：通过数据库直接修改

如果无法登录 Web 界面，可以通过数据库重置密码：

```bash
# 1. 连接到 RagFlow MySQL 数据库
docker exec -it ragflow-mysql mysql -uroot -p"infini_rag_flow" rag_flow

# 2. 生成新密码的 scrypt hash
# 在 RagFlow 容器中执行：
docker exec ragflow-server bash -c 'cd /ragflow && source .venv/bin/activate && python3 << "PYEOF"
from werkzeug.security import generate_password_hash
password = "你的新密码"
print(generate_password_hash(password))
PYEOF
'

# 3. 在 MySQL 中更新密码
UPDATE rag_flow.user SET password = '生成的scrypt hash' WHERE email = 'europewang@foxmail.com';

# 4. 验证
SELECT id, email, LENGTH(password) FROM rag_flow.user WHERE email = 'europewang@foxmail.com';
```

### 方法三：创建新用户

```bash
# 在 RagFlow 容器中初始化新用户
docker exec ragflow-server bash -c 'cd /ragflow && source .venv/bin/activate && python3 << "PYEOF"
import sys
sys.path.insert(0, "/ragflow")
from api.db.init_data import init_superuser

# 创建新用户（email 不能是 admin@ragflow.io）
init_superuser(nickname="apiuser", email="apiuser@ragflow.io", password="yourpassword123")
print("User created!")
PYEOF
'
```

## 文档解析工作流程

### 当前支持的解析方式

1. **手动解析**（推荐）：
   - 登录 RagFlow Web 界面
   - 进入知识库
   - 点击文档的「解析」按钮

2. **API 触发解析**：
   - 配置 `RAGFLOW_USER` 和 `RAGFLOW_PASSWORD`
   - 系统会自动尝试用户登录获取会话
   - 调用 `/v1/document/run` 触发解析

### 已知限制

- RagFlow 的 `/v1/document/run` 端点需要 `@login_required`
- API Key 认证无法用于此端点
- 需要有效的用户会话 cookie

## 配置示例

完整配置示例（`.env.brain`）：

```env
# RagFlow 服务器地址
RAGFLOW_BASE_URL=http://host.docker.internal:8084

# API Key（用于知识库列表、文档列表、切片等）
RAGFLOW_AUTHORIZATION=Bearer ragflow-rKofJZKLNgh_2Pv9A-0y_3sUbC9MIOkw9n99Cl5hvc4

# 用户凭证（用于文档解析）
RAGFLOW_USER=europewang@foxmail.com
RAGFLOW_PASSWORD=你的密码

# 查询配置
RAGFLOW_QUERY_PATH=/api/v1/chats_openai/{chatId}/chat/completions
RAGFLOW_MODEL=qwen3.5:9b
```

## 故障排除

### 问题：API 返回 "Unauthorized"

**原因**：API Key 认证失败或过期

**解决**：
1. 检查 `RAGFLOW_AUTHORIZATION` 配置是否正确
2. 在 RagFlow Web 界面验证 API Key 是否有效
3. 如果需要，重新生成 API Key

### 问题：文档解析返回 "jwt malformed"

**原因**：用户会话认证失败

**解决**：
1. 确认 `RAGFLOW_USER` 和 `RAGFLOW_PASSWORD` 正确
2. 测试登录：`curl -X POST http://host.docker.internal:8084/v1/user/login -H "Content-Type: application/json" -d '{"email":"你的邮箱","password":"你的密码"}'`
3. 如果登录失败，重置密码

### 问题：解析任务没有响应

**原因**：RagFlow 内部配置问题（如存储配置）

**解决**：
1. 检查 RagFlow 存储服务是否正常运行
2. 查看 RagFlow 日志：`docker logs ragflow-server`
3. 确认 MinIO/S3 存储配置正确

## 相关信息

- RagFlow 官方文档：https://github.com/infiniflow/ragflow
- RagFlow API 文档：在 RagFlow Web 界面 → API 文档
