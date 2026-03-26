# syntax=docker/dockerfile:1.7

FROM oven/bun:1 AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ npm \
  && npm install -g node-gyp \
  && rm -rf /var/lib/apt/lists/*

COPY package.json tsconfig.json app.ts ./
COPY src ./src
COPY plugins ./plugins

RUN --mount=type=cache,target=/root/.bun/install/cache bun install

FROM oven/bun:1 AS runner

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git unzip curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/app.ts ./app.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/plugins ./plugins
COPY --from=builder /app/node_modules ./node_modules
COPY install-mioku.sh ./install-mioku.sh

RUN mkdir -p config data logs
RUN chmod +x ./install-mioku.sh

ENV NODE_ENV=production

EXPOSE 3339

VOLUME ["/app/config", "/app/data", "/app/logs"]

CMD ["bun", "app.ts"]
