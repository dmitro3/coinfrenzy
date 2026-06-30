# docs/01 §10 — Fly.io worker container.
#
# Multi-stage so the final image carries only the compiled `dist/`
# output + the production node_modules. We use the workspace pnpm lockfile
# from the repo root to keep dependency resolution deterministic.

# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20.18.0

FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable
WORKDIR /app

# ----- builder stage -----
FROM base AS builder
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile --filter @coinfrenzy/worker...

COPY tsconfig.base.json tsconfig.base.json
COPY apps/worker apps/worker
COPY packages/config packages/config
COPY packages/core packages/core
COPY packages/db packages/db

# Build the worker only; `...` ensures workspace deps are typechecked.
RUN pnpm --filter @coinfrenzy/worker... build

# Trim dev deps for the runtime image.
RUN pnpm prune --prod --filter @coinfrenzy/worker...

# ----- runtime stage -----
FROM base AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache tini

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker ./apps/worker
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./package.json

EXPOSE 3030
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s \
  CMD wget -q --spider http://127.0.0.1:3030/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/worker/dist/index.js"]
