# 离线部署步骤（内网无网络）

本项目支持在无外网环境下通过已导出的镜像进行部署。以下步骤在 Windows 环境、Docker Desktop 已安装的前提下执行。

## 目录与前提
- 项目根目录：`d:\WXL\Code\9FCadWebService`
- 编排文件：[docker-compose.yml](file:///d:/WXL/Code/9FCadWebService/webService/docker-compose.yml)
- 离线镜像目录：`webService/images`
  - 推荐分包镜像文件（backend、frontend、mysql 独立导出）：
    - `toolbox_backend_20260112.tar`
    - `toolbox_frontend_20260112.tar`
    - `mysql_8_0_20260112.tar`
  - 也可以使用合并镜像文件（包含 backend、frontend、mysql）：
    - `toolbox_images_20260112.tar`
  - Python 脚本目录必须与 `webService` 同级并存在：`autoCadPy`（用于后端容器卷挂载）
  - Windows 下 Docker Desktop 需已共享镜像所在盘符（如 D:），否则卷挂载可能失败

## 导入镜像（离线）
- 打开 PowerShell，进入项目根目录：

### 方式一：使用脚本一次导入全部 tar（推荐）

```powershell
cd d:\WXL\Code\9FCadWebService
.\webService\scripts\offline_start.ps1 load
```

离线脚本会自动遍历 `webService/images` 目录下所有 `.tar` 文件，并逐个执行 `docker load -i` 导入。

### 方式二：手动导入分包镜像

```powershell
cd d:\WXL\Code\9FCadWebService
docker load -i .\webService\images\toolbox_backend_20260112.tar
docker load -i .\webService\images\toolbox_frontend_20260112.tar
docker load -i .\webService\images\mysql_8_0_20260112.tar
```

### 方式三：仍然使用合并镜像文件

如仍保留合并镜像文件，也可以执行：

```powershell
cd d:\WXL\Code\9FCadWebService
docker load -i .\webService\images\toolbox_images_20260112.tar
```

## 启动服务（离线）
- 方式一：执行脚本（推荐）

```powershell
.\webService\scripts\offline_start.ps1 start
```

- 方式二：直接使用 Docker Compose

```powershell
cd .\webService
docker compose up --no-build -d
```

说明：`--no-build` 会直接使用已导入的镜像，不进行联网构建或拉取。

## 联网运行方式（在线环境）
- 打开 PowerShell，进入项目根目录：

```powershell
cd d:\WXL\Code\9FCadWebService
```

- 构建并启动所有服务（会联网拉取基础镜像并构建业务镜像）：

```powershell
cd .\webService
docker compose up -d --build
```

说明：
- `--build` 表示在启动前对 backend、frontend 镜像进行构建；
- 如本地已构建过镜像且无需更新代码，可以去掉 `--build` 仅执行：

```powershell
cd d:\WXL\Code\9FCadWebService\webService
docker compose up -d
```

## 停止与状态
- 停止所有服务：

```powershell
.\webService\scripts\offline_start.ps1 stop
```

- 查看当前状态：

```powershell
.\webService\scripts\offline_start.ps1 status
```

## 访问地址
- 前端：http://localhost:80
- 后端 API：http://localhost:8087
- MySQL：localhost:3306（数据库：`toolbox_db`，用户：`root`，密码：`root`）

## 重要说明
- 后端容器通过卷挂载使用源代码目录 `../autoCadPy`，请确保该目录存在于 `webService` 的同级位置
  - 对应挂载配置参见：[docker-compose.yml:L24-L27](file:///d:/WXL/Code/9FCadWebService/webService/docker-compose.yml#L24-L27)
- MySQL 会自动执行初始化脚本：[schema.sql](file:///d:/WXL/Code/9FCadWebService/webService/mysql/init/schema.sql)
- 如 Docker Desktop 未共享 D:，请在 Docker Desktop 的设置中共享该盘符后重试

