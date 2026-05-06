# 构建阶段（Build Stage）：使用 Node 镜像进行前端依赖安装与打包
# 目的：
# - 在独立的临时镜像中安装依赖、编译 Vue 项目，生成纯静态资源（dist）
# 说明：
# - Node 版本选用 node:16，确保与项目依赖的兼容性（若需升级请同步测试）
# - WORKDIR 指定工作目录，方便后续 COPY 与 RUN 指令的路径相对化
# - 先复制 package*.json 再执行 npm install，可利用 Docker 层缓存优化重复构建速度
# - npm install 使用 package-lock.json（若存在）锁定版本，保证构建可重复性；需要更严格可考虑 npm ci
# - 最终执行 npm run build 触发 Vite 构建，产出 dist 目录
# 注意：该阶段仅用于构建，不对外提供服务
# Build Stage
FROM node:16 AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# 生产阶段（Production Stage）：使用 Nginx 提供打包后的前端静态资源
# 目的：
# - 将构建得到的 dist 拷贝到 Nginx 的默认静态资源目录 /usr/share/nginx/html
# - 通过 Nginx 对外暴露 80 端口，稳定高效地提供前端页面与静态资源
# 说明：
# - 使用 nginx:stable-alpine 以获得更小体积与稳定版本
# - 如果有静态资源缓存或压缩需求，可在 Nginx 配置中追加 gzip、cache-control 等指令
# Production Stage
FROM nginx:stable-alpine AS production-stage
COPY --from=build-stage /app/dist /usr/share/nginx/html
# Nginx 默认配置对 SPA 通常可用，但使用 Vue Router 的 history 模式需要自定义配置
# 关键点：
# - 通过 try_files 将任意前端路由请求回退到 index.html，避免浏览器刷新或直接访问子路由时报 404
# 部署路径：
# - 若部署在根路径以外（如 /webTools/），需增加 location /webTools/ 规则以支持子路径挂载
# - 下方已为 /webTools 提供示例配置；同时 Vite 的 base 与 Vue Router 的 history 基础路径也需一致设置为 /webTools/

# 生产环境需要在 Nginx 中为 /api 配置反向代理（Vite 代理仅用于开发环境）
# 目标：
# - 将 /api 请求转发到后端服务，保持与前端同源，解决跨域问题
# - 根据后端容器的服务端口进行匹配（示例为 backend:8080），与 docker-compose 网络/端口映射一致
# 生成 Nginx 站点配置：包含静态资源服务、/webTools 子路径、以及 /api 反向代理
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    charset utf-8; \
    client_max_body_size 100M; \
    resolver 127.0.0.11 ipv6=off; \
    # 上述 resolver 在容器网络下用于解析服务名（如 backend）；若使用固定 IP/域名可省略 \
    location / { \
        # 根路径下提供前端静态资源；history 模式通过 try_files 回退到 index.html \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
    location /webTools/ { \
        # 将 /webTools 作为前端挂载的子路径，alias 指向静态资源目录 \
        # 注意：alias 会将 location 前缀直接剥离，例如 /webTools/app.js -> /usr/share/nginx/html/app.js \
        # 若搭配 try_files 使用，需谨慎路径书写；此处将回退到 /webTools/index.html 以匹配前端基础路径 \
        alias /usr/share/nginx/html/; \
        try_files $uri $uri/ /webTools/index.html; \
    } \
    location /api { \
        # 反向代理后端 API 到 backend:8080；保持同源以避免浏览器跨域限制 \
        # 可按需增加超时、缓存、Header 透传、限流等高级配置 \
        set $backend http://backend:8080; \
        proxy_pass $backend; \
        proxy_connect_timeout 5s; \
        proxy_read_timeout 60s; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
}' > /etc/nginx/conf.d/default.conf

# 对外暴露端口 80（HTTP）
# - 容器对外服务使用该端口；在宿主机或上层编排中可做端口映射（例如 80:80）
EXPOSE 80
# 以前台方式启动 Nginx
# - 使用 daemon off; 令 Nginx 以前台模式运行，保持容器进程不退出
CMD ["nginx", "-g", "daemon off;"]
