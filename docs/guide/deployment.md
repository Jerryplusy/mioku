# 更多部署方式

## 本地直接运行

```bash
bun install
bun run start
```

## Docker Compose (推荐)

```bash
docker compose build
# 使用交互模式启动
docker compose run --rm --service-ports mioku
```

第一次需要使用交互模式完成初始化。

之后可以后台启动：

```bash
# 后台启动
docker compose up -d
```

## Docker

```bash
docker build -t mioku .
```

首次启动：

```bash
# 前台启动
docker run --rm -it \
  --name mioku-init \
  --add-host=host.docker.internal:host-gateway \
  -p 3339:3339 \
  -v "$(pwd)/.git:/app/.git" \
  -v "$(pwd)/app.ts:/app/app.ts" \
  -v "$(pwd)/package.json:/app/package.json" \
  -v "$(pwd)/tsconfig.json:/app/tsconfig.json" \
  -v "$(pwd)/install-mioku.ts:/app/install-mioku.ts" \
  -v "$(pwd)/src:/app/src" \
  -v "$(pwd)/plugins:/app/plugins" \
  -v "$(pwd)/config:/app/config" \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/logs:/app/logs" \
  -v "$(pwd)/temp:/app/temp" \
  -v mioku_node_modules:/app/node_modules \
  -v mioku_bun_cache:/root/.bun/install/cache \
  mioku
```

后台运行：

```bash
docker run -d \
  --name mioku \
  --restart unless-stopped \
  --add-host=host.docker.internal:host-gateway \
  -p 3339:3339 \
  -v "$(pwd)/.git:/app/.git" \
  -v "$(pwd)/app.ts:/app/app.ts" \
  -v "$(pwd)/package.json:/app/package.json" \
  -v "$(pwd)/tsconfig.json:/app/tsconfig.json" \
  -v "$(pwd)/install-mioku.ts:/app/install-mioku.ts" \
  -v "$(pwd)/src:/app/src" \
  -v "$(pwd)/plugins:/app/plugins" \
  -v "$(pwd)/config:/app/config" \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/logs:/app/logs" \
  -v "$(pwd)/temp:/app/temp" \
  -v mioku_node_modules:/app/node_modules \
  -v mioku_bun_cache:/root/.bun/install/cache \
  mioku
```

## 更新方式

```bash
# Docker Compose
git pull
docker compose restart mioku
```

如果你使用 `docker run`：

```bash
# Docker
git pull
docker restart mioku
```
