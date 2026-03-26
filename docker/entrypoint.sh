#!/usr/bin/env sh

set -eu

if [ "$#" -eq 0 ]; then
  set -- bun run app
fi

exec "$@"
