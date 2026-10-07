# syntax=docker/dockerfile:1

# ── 博客 · 生产镜像（Next.js standalone）──
# 内容与运行时数据通过 volume 挂载，不打进镜像。

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Corepack 默认从 registry.npmjs.org 拉 pnpm —— 国内网络下经常 TLS 超时导致整次构建失败；
# 指向镜像源（可用 --build-arg 覆盖 npm_config_registry）
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
ENV npm_config_registry=https://registry.npmmirror.com
RUN corepack enable
WORKDIR /app

# 国内构建走镜像源（可用 --build-arg 覆盖）
ARG NPM_REGISTRY=https://registry.npmmirror.com

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --registry="$NPM_REGISTRY"

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# 内容作为镜像内兜底，运行时由 volume 覆盖
COPY --from=builder /app/content ./content
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "server.js"]
