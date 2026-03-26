FROM oven/bun:1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl unzip ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock tsconfig.json app.ts ./
COPY src ./src
COPY plugins ./plugins
COPY docker ./docker

RUN mkdir -p config data logs
RUN chmod +x docker/entrypoint.sh
RUN bun install --frozen-lockfile

ENV NODE_ENV=production

EXPOSE 3339

VOLUME ["/app/config", "/app/data", "/app/logs"]

ENTRYPOINT ["./docker/entrypoint.sh"]
