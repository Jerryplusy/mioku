FROM oven/bun:1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl unzip ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json tsconfig.json app.ts ./
COPY src ./src
COPY plugins ./plugins

RUN mkdir -p config data logs
RUN if [ -f bun.lock ]; then bun install --frozen-lockfile; else bun install; fi

ENV NODE_ENV=production

EXPOSE 3339

VOLUME ["/app/config", "/app/data", "/app/logs"]

CMD ["bun", "run", "start"]
