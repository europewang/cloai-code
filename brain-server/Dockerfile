# syntax=docker/dockerfile:1.7

FROM oven/bun:1.2.21 AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates python3 python3-pip && rm -rf /var/lib/apt/lists/*

# 先复制依赖描述文件，最大化利用 Docker 层缓存。
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile

FROM deps AS build
WORKDIR /app
ARG BUILD_STAMP=dev
RUN echo "$BUILD_STAMP" > /tmp/build_stamp
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN bun run build

FROM oven/bun:1.2.21 AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl ca-certificates python3 python3-pip && rm -rf /var/lib/apt/lists/*

# pip 镜像与缓存参数：
# - PIP_INDEX_URL/PIP_EXTRA_INDEX_URL 允许在构建时按环境覆盖镜像源
# - PIP_CACHE_DIR 指定缓存目录，配合 BuildKit cache mount 保留下载缓存
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ARG PIP_EXTRA_INDEX_URL=https://pypi.org/simple
ARG PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn
ENV PIP_INDEX_URL=${PIP_INDEX_URL}
ENV PIP_EXTRA_INDEX_URL=${PIP_EXTRA_INDEX_URL}
ENV PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST}
ENV PIP_CACHE_DIR=/root/.cache/pip

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lock ./bun.lock
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY requirements-indicator-skill.txt ./requirements-indicator-skill.txt
RUN --mount=type=cache,target=/root/.cache/pip \
  python3 -m pip install --break-system-packages -r requirements-indicator-skill.txt

EXPOSE 8091
CMD ["bun", "run", "start"]
