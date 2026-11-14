# syntax=docker/dockerfile:1
# QA Commerce Lab API image (NestJS + Prisma). Build context: repository root.

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/api --include-workspace-root=false
COPY apps/api apps/api
RUN npm run prisma:generate -w apps/api && npm run build -w apps/api

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/api --omit=dev --include-workspace-root=false && npm cache clean --force
WORKDIR /app/apps/api
COPY apps/api/prisma ./prisma
RUN npx --no-install prisma generate
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chown -R node:node /app
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
