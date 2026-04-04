#!/bin/sh
set -e

echo "=== Running Prisma migrate deploy ==="
npx prisma migrate deploy --schema ./prisma/schema.prisma
echo "=== Migration step complete ==="

exec node dist/main
