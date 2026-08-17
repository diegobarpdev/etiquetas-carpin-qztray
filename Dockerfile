FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY vite.config.ts tsconfig.json tailwind.config.js postcss.config.js components.json ./
COPY web ./web
COPY server ./server
COPY public ./public
COPY assets ./assets

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
RUN npm ci --omit=dev && npm install tsx

COPY --from=builder /app/dist ./dist
COPY server ./server
COPY assets ./assets
COPY data ./data
COPY ecosystem.config.cjs ./

EXPOSE 3000 3010

CMD ["npx", "concurrently", "-k", "-n", "api,web", "-c", "green,cyan", "tsx server/index.ts", "tsx server/web.ts"]
