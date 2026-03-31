# syntax=docker/dockerfile:1.7

FROM oven/bun:1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    unzip \
    curl \
    ca-certificates \
    chromium \
    python3 \
    make \
    g++ \
    npm \
  && npm install -g node-gyp \
  && rm -rf /var/lib/apt/lists/*

COPY package.json tsconfig.json app.ts ./
COPY src ./src
COPY plugins ./plugins
COPY install-mioku.sh ./install-mioku.sh
COPY install-mioku.ts ./install-mioku.ts
COPY docker ./docker

RUN --mount=type=cache,target=/root/.bun/install/cache bun install
RUN chmod +x ./install-mioku.sh ./docker/entrypoint.sh
RUN mkdir -p config data logs temp

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 3339

VOLUME ["/app/config", "/app/data", "/app/logs", "/app/temp", "/app/node_modules"]

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["bun", "app.ts"]
