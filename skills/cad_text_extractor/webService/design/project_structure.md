# 项目架构与 Docker 设计 (Project Architecture & Docker Design)

## 1. 目录结构 (Directory Structure)

项目将组织在 `d:\WXL\Code\9FCadWebService\webService` 目录下，结构如下：

```
webService/
├── backend/                        # Java Spring Boot 后端
│   ├── src/main/java/...           # Java 源代码
│   ├── src/main/resources/
│   │   └── application.yml         # 配置文件 (数据库连接等)
│   ├── pom.xml                     # Maven 依赖管理
│   └── Dockerfile                  # 多阶段构建: Java 环境 + Python 环境安装
├── frontend/                       # Vue.js 前端
│   ├── src/...
│   ├── package.json
│   └── Dockerfile                  # 构建 Node -> Nginx 托管静态资源
├── python_scripts/                 # (已移除，直接引用外部 autoCadPy 目录)
├── mysql/
│   └── init/
│       └── schema.sql              # 数据库初始化脚本
└── docker-compose.yml              # Docker 编排文件
```

## 2. Docker 服务 (Docker Services)

我们将使用 `docker-compose` 运行 3 个主要服务：

### 服务 1: `mysql_db` (数据库)
- **镜像 (Image)**: `mysql:8.0`
- **端口映射 (Port)**: `3306:3306`
- **环境变量 (Environment)**:
  - `MYSQL_ROOT_PASSWORD`: root
  - `MYSQL_DATABASE`: toolbox_db
- **数据卷 (Volumes)**:
  - `./mysql/init:/docker-entrypoint-initdb.d` (自动运行 schema.sql 初始化表结构)
  - `mysql_data:/var/lib/mysql` (数据持久化)

### 服务 2: `backend` (后端 API)
- **构建上下文 (Build Context)**: `./backend`
- **基础镜像 (Base Image)**: `openjdk:17-slim` (或类似)
- **自定义修改**:
  - 在容器内安装 `python3` 和 `pip`。
  - 安装 Python 依赖库: `ezdxf`, `openpyxl`, `pillow`。
  - **重要**: 通过 Docker Volume 挂载外部 Python 脚本目录。
- **端口映射 (Port)**: `8087:8080`
- **数据卷 (Volumes)**:
  - `../../autoCadPy:/app/python_scripts` (直接挂载源代码目录)
- **环境变量 (Environment)**:
  - `DB_HOST`: mysql_db
  - `DB_PORT`: 3306
  - `DB_USER`: root
  - `DB_PASS`: root

### 服务 3: `frontend` (前端界面)
- **构建上下文 (Build Context)**: `./frontend`
- **基础镜像 (Base Image)**: `node:16` (构建阶段) -> `nginx:alpine` (运行阶段)
- **端口映射 (Port)**: `80:80`
- **配置**: Nginx 反向代理 `/api` 请求到 `backend:8087`。

## 3. Python 集成细节 (Python Integration Details)

- Java 后端将使用 `ProcessBuilder` 调用 Python 脚本。
- **脚本路径**: `/app/python_scripts/cad_text_extractor.py`
- **执行流程**:
  1. Java 接收文件上传请求。
  2. Java 将文件保存到 `/tmp/uploads/{uuid}/input/`。
  3. Java 创建输出目录 `/tmp/uploads/{uuid}/output/`。
  4. Java 调用命令: `python3 /app/python_scripts/cad_text_extractor.py /tmp/uploads/{uuid}/input /tmp/uploads/{uuid}/output "User" "Reviewer"`
  5. Java 将 `/tmp/uploads/{uuid}/output` 目录打包为 ZIP。
  6. Java 返回 ZIP 文件给前端。
  7. Java 删除临时目录 `/tmp/uploads/{uuid}`。

## 4. 技术栈依赖 (Dependencies)

### 后端 (Java)
- Spring Boot Web (Web 框架)
- Spring Boot Data JPA (数据库访问)
- MySQL Driver (数据库驱动)
- Lombok (简化代码)
- Zip4j (或 Java 原生 Zip 工具)

### 前端 (Vue)
- Vue 3 (前端框架)
- Axios (HTTP 请求)
- Vue Router (路由管理)
- Element Plus (UI 组件库)

### Python
- ezdxf (DXF 处理)
- openpyxl (Excel 处理)
- pillow (图像处理 - 尽管主要逻辑可能未大量使用，但环境需支持)
