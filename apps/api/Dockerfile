# ── Prune stage: create minimal monorepo subset ─────────────
FROM node:20-alpine AS pruner
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

COPY . .
RUN pnpm dlx turbo prune api --docker

# ── Install dependencies ─────────────────────────────────────
FROM node:20-alpine AS installer
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Install only the pruned subset's dependencies
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .

RUN pnpm --filter api run db:generate
RUN pnpm --filter api run build

# Create a standalone deploy directory with all production deps
RUN pnpm --filter api deploy --prod /app/deploy

# Copy generated Prisma client into deploy
# In pnpm, the generated .prisma/client lives inside the .pnpm store, not at node_modules/.prisma
RUN PRISMA_GENERATED=$(find /app/node_modules/.pnpm -path '*/.prisma/client/index.js' -exec dirname {} \; | head -1) \
 && mkdir -p /app/deploy/node_modules/.prisma \
 && cp -r "$PRISMA_GENERATED" /app/deploy/node_modules/.prisma/client \
 && echo "Copied generated Prisma client from: $PRISMA_GENERATED"

# Ensure @prisma/client package is properly copied (not a symlink)
RUN PRISMA_PKG=$(find /app/node_modules/.pnpm -path '*/@prisma/client/package.json' -exec dirname {} \; | head -1) \
 && rm -rf /app/deploy/node_modules/@prisma/client \
 && cp -rL "$PRISMA_PKG" /app/deploy/node_modules/@prisma/client \
 && echo "Copied @prisma/client from: $PRISMA_PKG"

# Copy prisma CLI (devDep) into deploy so we can run migrations at startup
RUN PRISMA_CLI=$(find /app/node_modules/.pnpm -path '*/prisma/package.json' ! -path '*/@prisma/*' -exec dirname {} \; | head -1) \
 && cp -rL "$PRISMA_CLI" /app/deploy/node_modules/prisma \
 && mkdir -p /app/deploy/node_modules/.bin \
 && ln -sf ../prisma/build/index.js /app/deploy/node_modules/.bin/prisma \
 && echo "Copied prisma CLI from: $PRISMA_CLI"

# Copy Prisma engine binaries needed for migrations
RUN PRISMA_ENGINES=$(find /app/node_modules/.pnpm -path '*/@prisma/engines/package.json' -exec dirname {} \; | head -1) \
 && if [ -n "$PRISMA_ENGINES" ]; then \
      mkdir -p /app/deploy/node_modules/@prisma/engines && \
      cp -rL "$PRISMA_ENGINES"/* /app/deploy/node_modules/@prisma/engines/ && \
      echo "Copied @prisma/engines from: $PRISMA_ENGINES"; \
    else \
      echo "WARNING: @prisma/engines not found, migration engine may be bundled in prisma CLI"; \
    fi

# ── Production stage ─────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl curl
WORKDIR /app

ENV NODE_ENV=production
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
ENV CHECKPOINT_DISABLE=1

COPY --from=builder /app/deploy/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]
