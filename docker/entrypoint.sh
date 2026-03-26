#!/usr/bin/env sh

set -eu

cd /app

mkdir -p config data logs temp

manifest_hash() {
  {
    for file in package.json tsconfig.json app.ts bun.lock; do
      if [ -f "$file" ]; then
        sha256sum "$file"
      fi
    done

    find plugins src/services -type f -name package.json 2>/dev/null | LC_ALL=C sort | while read -r file; do
      sha256sum "$file"
    done
  } | sha256sum | awk '{print $1}'
}

CURRENT_HASH="$(manifest_hash)"
STAMP_FILE="node_modules/.mioku-manifest-hash"

if [ ! -d node_modules ] || [ ! -f "$STAMP_FILE" ] || [ "$(cat "$STAMP_FILE" 2>/dev/null || true)" != "$CURRENT_HASH" ]; then
  echo "[mioku-docker] 检测到依赖清单变更，正在执行 bun install..."
  bun install
  mkdir -p node_modules
  printf '%s\n' "$CURRENT_HASH" > "$STAMP_FILE"
fi

if [ "$#" -eq 0 ]; then
  set -- bun app.ts
fi

exec "$@"
