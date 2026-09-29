#!/bin/sh
set -e
cd /usr/src/app/frontend
export NEXT_DIST_DIR=../.next
if [ -f /usr/src/app/node_modules/next/dist/bin/next ]; then
  NEXT_BIN=/usr/src/app/node_modules/next/dist/bin/next
elif [ -f /usr/src/app/.next/node_modules/next/dist/bin/next ]; then
  NEXT_BIN=/usr/src/app/.next/node_modules/next/dist/bin/next
else
  echo "spaceweb-start: next binary not found" >&2
  exit 1
fi
echo "spaceweb-start: $NEXT_BIN" >&2
exec node "$NEXT_BIN" start -H 0.0.0.0 -p 8080
