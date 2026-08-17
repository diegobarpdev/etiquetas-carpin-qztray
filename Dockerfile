FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps ./apps

RUN npm run build

FROM node:20-bookworm-slim AS runner

RUN apt-get update && apt-get install -y \
    fonts-liberation \
    ca-certificates \
    chromium \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV WEB_PORT=3000
ENV API_PORT=3010

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev && npm install tsx

COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY apps/api ./apps/api
COPY apps/web/server.ts ./apps/web/server.ts
COPY ecosystem.config.cjs ./

EXPOSE 3000 3010

CMD ["npx", "concurrently", "-k", "-n", "api,web", "-c", "green,cyan", "tsx apps/api/index.ts", "tsx apps/web/server.ts"]
