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
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN bun run build

FROM oven/bun:1.2.21 AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl ca-certificates python3 python3-pip && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lock ./bun.lock
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY requirements-indicator-skill.txt ./requirements-indicator-skill.txt
RUN python3 -m pip install --break-system-packages --no-cache-dir -r requirements-indicator-skill.txt

EXPOSE 8091
CMD ["bun", "run", "start"]
