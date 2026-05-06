# REST API 接口设计

基础路径 (Base URL): `/api`

## 1. 认证 (Authentication)

### 用户登录 (Login)
- **接口地址**: `POST /auth/login`
- **描述**: 使用用户名和明文密码进行认证。
- **请求体 (Request Body)**:
  ```json
  {
    "username": "admin",
    "password": "password"
  }
  ```
- **响应 (Response)**:
  - `200 OK`: 登录成功
    ```json
    {
      "id": 1,
      "username": "admin",
      "role": "ADMIN" // 或 "USER"
    }
    ```
  - `401 Unauthorized`: 用户名或密码错误。

## 2. 用户管理 (User Management) - 管理员专属

**鉴权**: 所有接口需携带 Header `X-Current-User-Id: <admin_id>`

### 获取用户列表
- **接口地址**: `GET /users`
- **描述**: 获取所有用户信息。
- **响应**: User 对象列表。

### 创建用户
- **接口地址**: `POST /users`
- **请求体**:
  ```json
  {
    "username": "newuser",
    "password": "password",
    "role": "USER"
  }
  ```
- **响应**: 创建成功的 User 对象。

### 删除用户
- **接口地址**: `DELETE /users/{id}`
- **描述**: 删除指定 ID 的用户。

### 修改密码
- **接口地址**: `PUT /users/{id}/password`
- **请求体**:
  ```json
  {
    "password": "newpassword"
  }
  ```

## 3. 工具 (Tools)

### 获取工具列表 (List Tools)
- **接口地址**: `GET /tools`
- **描述**: 返回工具箱中所有可用的工具列表。
- **响应 (Response)**:
  ```json
  [
    {
      "id": 1,
      "toolKey": "cad_extractor",
      "name": "CAD文本提取工具",
      "description": "从DXF文件中提取文本并进行面积计算。"
    }
  ]
  ```

### 执行CAD提取工具 (Execute CAD Extractor)
- **接口地址**: `POST /tools/cad-extractor/run`
- **描述**: 上传 DXF 文件或整个文件夹并运行提取程序，记录操作日志。
- **请求头 (Headers)**: `Content-Type: multipart/form-data`
- **参数 (Parameters)**:
  - 方式一（单文件）:
    - `file`: DXF文件 (二进制文件流)
  - 方式二（多文件/文件夹）:
    - `files`: 文件数组 (多次 form-data 字段)
    - `paths`: 与 `files` 一一对应的相对路径（如 `folder/sub/file.dxf`）
  - 公共参数:
    - `userId`: 执行操作的用户ID (用于日志记录)
    - `checker`: 校核者姓名 (字符串，可选，默认"张三")
    - `reviewer`: 检查者姓名 (字符串，可选，默认"李四")
- **限制**:
  - 单请求总体大小限制: 100MB
- **处理流程 (Process)**:
  1. 服务器将上传文件保存到临时输入目录（保持相对路径结构）
  2. 服务器调用 `python cad_text_extractor.py <input_dir> <output_dir> <checker> <reviewer>`
  3. Python脚本在输出目录生成结果文件 (JSON, Excel, DXF)
  4. 服务器将输出目录打包为ZIP文件返回
  5. 服务器记录执行日志到数据库
- **响应 (Response)**:
  - `200 OK`: 返回结果ZIP文件的二进制流 (application/zip)
  - `400 Bad Request`: 未上传文件
  - `413 Payload Too Large`: 文件超过限制 (100MB)
  - `500 Internal Server Error`: 执行失败

## 4. 日志 (Logs)

### 获取执行历史 (Get Execution History)
- **接口地址**: `GET /logs`
- **描述**: 查询工具执行的历史记录。
- **鉴权**: 需携带 Header `X-Current-User-Id: <user_id>`
- **参数**: 
  - `username` (可选): 按用户名模糊搜索 (仅管理员可用)。
- **逻辑**:
  - 普通用户: 只能看到自己的日志 (忽略 username 参数)。
  - 管理员: 默认看到所有日志，可使用 username 筛选。
- **响应 (Response)**:
  ```json
  [
    {
      "id": 1,
      "tool": { "name": "CAD文本提取工具" },
      "user": { "username": "admin" },
      "dataName": "project_A.dxf",
      "executionTime": "2023-10-27T10:00:00",
      "status": "SUCCESS"
    }
  ]
  ```
