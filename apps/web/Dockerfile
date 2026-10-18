# Development only. Keep this version aligned with .nvmrc.
FROM node:24.22.0-bookworm-slim AS development

WORKDIR /workspace
RUN chown node:node /workspace
USER node

# Install from the monorepo lockfile before copying frequently edited sources.
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/web/package.json ./apps/web/package.json
RUN npm ci --include=dev && mkdir -p apps/web/.next

COPY --chown=node:node apps/web ./apps/web

EXPOSE 3000

# Refresh persistent dependencies on startup so lockfile changes cannot leave
# an old node_modules volume in use. The npm cache is persisted by Compose.
CMD ["sh", "-c", "npm ci --include=dev && exec npm run dev --workspace=apps/web -- --hostname 0.0.0.0 --port 3000"]
