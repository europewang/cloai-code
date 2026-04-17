# 架构设计与开发规划 (全链路唯一端口版)

本计划将构建 **Custom Frontend + Java Backend + RAGFlow Engine** 系统，并确保 **宿主机与容器内部端口完全唯一**，彻底消除端口重复与混淆。

## 1. 核心架构设计 (写入 `programDoc/01_architecture_design.md`)

### 1.1 全链路端口规划 (内外一致，无重复)
遵循“紧凑且唯一”原则，所有组件的 **宿主机端口** 与 **容器内端口** 保持一致，且不与现有 (8080, 8081, 8005) 重复。

| 组件 | 角色 | 端口 (Host:Container) | 配置修改点 |
| :--- | :--- | :--- | :--- |
| **Frontend** | 前端展示 | **8082:8082** | Nginx/Node 监听 8082 |
| **Backend** | 业务逻辑 | **8083:8083** | Spring Boot `server.port=8083` |
| **RAGFlow** | 核心引擎 | **8084:8084** | 挂载自定义 `nginx.conf` 监听 8084 |
| **Xinference** | 模型服务 | **8085:8085** | 启动参数 `-p 8085` |

### 1.2 依赖服务端口偏移 (RAGFlow 中间件)
为防止 RAGFlow 内部组件 (MinIO, MySQL 等) 与 `docker-compose4other.yml` 冲突，需在 `.env` 中修改：
*   **MinIO**: `9002:9002` (原 9000/9001 占用)
*   **Postgres/MySQL**: `5433:5433` (原 5432 占用)

### 1.3 业务功能实现
*   **后端 (8083)**: 封装 RAGFlow API，提供文件上传与 Chat 接口，处理跨域 (CORS) 允许 8082 访问。
*   **前端 (8082)**: 集成 `pdf.js`，通过后端获取 RAGFlow 的 `bbox` 坐标，在 PDF 上绘制高亮框。

## 2. 部署与开发指南 (写入 `programDoc/02_deployment_guide.md`)

### 2.1 RAGFlow 深度定制部署
*   **修改 docker-compose.yml**: 将 RAGFlow Server 映射改为 `8084:8084`。
*   **自定义 Nginx 配置**: 创建 `ragflow-nginx.conf`，将监听端口改为 8084，并挂载到容器内覆盖默认配置。

### 2.2 业务系统部署
*   提供 Spring Boot 和 Vue/React 的 `Dockerfile` 模板，明确暴露 8083 和 8082 端口。

## 3. 记录更新
*   更新 `programDoc/05_recordAiOperate.md`，记录端口调整策略。

## 执行步骤
1.  **架构文档**: 撰写 `01_architecture_design.md`，列出详细的端口修改表与配置项。
2.  **部署指南**: 撰写 `02_deployment_guide.md`，包含 `nginx.conf` 修改模板和 `.env` 配置清单。
3.  **操作记录**: 更新 `05_recordAiOperate.md`。
