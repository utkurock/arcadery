# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps: install workspace dependencies ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/editor/package.json ./packages/editor/package.json
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- builder: build @arcadery/web ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
# NEXT_PUBLIC_* env vars must be present at build time (inlined into bundle).
# Coolify injects build args via --build-arg; declare what we read.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SOLANA_RPC_URL
ARG NEXT_PUBLIC_SOLANA_CLUSTER
ARG NEXT_PUBLIC_TREASURY_WALLET
ARG NEXT_PUBLIC_USDC_MINT
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SOLANA_RPC_URL=$NEXT_PUBLIC_SOLANA_RPC_URL \
    NEXT_PUBLIC_SOLANA_CLUSTER=$NEXT_PUBLIC_SOLANA_CLUSTER \
    NEXT_PUBLIC_TREASURY_WALLET=$NEXT_PUBLIC_TREASURY_WALLET \
    NEXT_PUBLIC_USDC_MINT=$NEXT_PUBLIC_USDC_MINT \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN pnpm --filter @arcadery/web build

# ---- runner: production image ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/web ./apps/web
COPY --from=builder --chown=nextjs:nodejs /app/packages ./packages
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/pnpm-workspace.yaml ./

USER nextjs
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["pnpm", "start"]
