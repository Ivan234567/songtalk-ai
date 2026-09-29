#!/bin/sh
set -e
cd /usr/src/app/frontend
if [ ! -e .next ]; then
  ln -s /usr/src/app/.next .next
fi
if [ ! -e node_modules ]; then
  if [ -d /usr/src/app/node_modules/next ]; then
    ln -s /usr/src/app/node_modules node_modules
  else
    ln -s /usr/src/app/.next/node_modules node_modules
  fi
fi
if [ -f /usr/src/app/node_modules/next/dist/bin/next ]; then
  NEXT_BIN=/usr/src/app/node_modules/next/dist/bin/next
elif [ -f node_modules/next/dist/bin/next ]; then
  NEXT_BIN=node_modules/next/dist/bin/next
else
  echo "spaceweb-start: next binary not found" >&2
  ls -ld /usr/src/app/node_modules/next /usr/src/app/.next/node_modules/next node_modules/next >&2 || true
  exit 1
fi
echo "spaceweb-start: $NEXT_BIN" >&2
exec node "$NEXT_BIN" start -H 0.0.0.0 -p 8080
