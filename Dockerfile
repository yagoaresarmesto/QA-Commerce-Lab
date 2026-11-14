# syntax=docker/dockerfile:1
# All-in-one image for remote deployments (demo / testing): the NestJS API also serves the
# built storefront, so each environment is a single container on a single origin (no CORS,
# first-party cookies). Build context: repository root.
#   docker build -t qa-commerce-lab --build-arg VITE_APP_ENV=testing .

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --include-workspace-root=false -w apps/api -w apps/web
COPY apps/api apps/api
COPY apps/web apps/web
ARG VITE_APP_ENV=
ENV VITE_APP_ENV=${VITE_APP_ENV}
RUN npm run prisma:generate -w apps/api && npm run build -w apps/api && npm run build -w apps/web

FROM base AS runtime
ENV NODE_ENV=production \
    SERVE_WEB_DIR=/app/web \
    PORT=3000
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/api --omit=dev --include-workspace-root=false && npm cache clean --force
WORKDIR /app/apps/api
COPY apps/api/prisma ./prisma
RUN npx --no-install prisma generate
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/web/dist /app/web
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
ARG GIT_COMMIT=
ENV GIT_COMMIT=${GIT_COMMIT}
RUN chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
