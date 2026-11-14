# syntax=docker/dockerfile:1
# QA Commerce Lab storefront image: static build served by nginx, /api proxied to the API.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci -w apps/web --include-workspace-root=false
COPY apps/web apps/web
ARG VITE_APP_ENV=local
ENV VITE_APP_ENV=${VITE_APP_ENV}
RUN npm run build -w apps/web

FROM nginx:1.27-alpine
ENV API_UPSTREAM=http://api:3001
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
