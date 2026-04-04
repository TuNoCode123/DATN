#!/bin/sh
set -e

echo "=== Running Prisma migrate deploy ==="
node ./node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma 2>&1 || {
  echo "WARNING: prisma migrate deploy failed, trying db push as fallback..."
  node ./node_modules/prisma/build/index.js db push --schema ./prisma/schema.prisma --accept-data-loss 2>&1 || {
    echo "ERROR: Both migrate deploy and db push failed. Starting app anyway..."
  }
}
echo "=== Migration step complete ==="

exec node dist/main
