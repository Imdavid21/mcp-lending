# Frontend — built from repo root context, served by nginx

FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

# Copy workspace manifests for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/frontend/package.json ./packages/frontend/
# Stub other packages so the workspace resolves
RUN mkdir -p packages/backend packages/client && \
    echo '{"name":"@mcp-lending/backend","version":"0.1.0","type":"module"}' > packages/backend/package.json && \
    echo '{"name":"@mcp-lending/client","version":"0.1.0","type":"module"}' > packages/client/package.json

RUN pnpm install --no-frozen-lockfile

COPY packages/frontend ./packages/frontend

# Build-time env vars (baked into the static bundle)
ARG VITE_CLIENT_URL=http://localhost:3001
ARG VITE_BASE_PATH=/
ENV VITE_CLIENT_URL=$VITE_CLIENT_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH

RUN pnpm --filter @mcp-lending/frontend build

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

# Use nginx template so PORT env var (set by Railway) is substituted at startup
RUN mkdir -p /etc/nginx/templates && \
    printf 'server {\n  listen ${PORT};\n  root /usr/share/nginx/html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' \
    > /etc/nginx/templates/default.conf.template && \
    rm /etc/nginx/conf.d/default.conf

EXPOSE 8080
