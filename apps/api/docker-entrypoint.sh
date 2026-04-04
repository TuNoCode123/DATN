#!/bin/sh
set -e

# If arguments are passed (e.g. from ECS command override), run them instead
if [ $# -gt 0 ]; then
  exec "$@"
fi

exec node dist/main
