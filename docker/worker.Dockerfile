# CoinFrenzy worker — Inngest functions + cron + /healthz.
#
# The workspace @coinfrenzy/* packages export raw TypeScript source
# (no compiled dist). The worker runs those directly via tsx, which is a
# devDependency of apps/worker and is included after `pnpm install`.
#
# Single-stage on purpose (simple, easy to debug).

FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
ENV PORT=3030
WORKDIR /app/apps/worker
EXPOSE 3030

# Health check — compose overrides PORT but we default to 3030 to match EXPOSE.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||'3030')+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "exec", "tsx", "src/index.ts"]
