#!/bin/sh
set -e
cd /usr/src/app/frontend
if [ ! -e .next ]; then
  ln -s /usr/src/app/.next .next
fi
export NODE_PATH="/usr/src/app/.next/node_modules${NODE_PATH:+:$NODE_PATH}"
if [ ! -f /usr/src/app/.next/node_modules/next/dist/bin/next ]; then
  echo "spaceweb-start: next binary not found" >&2
  exit 1
fi
exec node /usr/src/app/.next/node_modules/next/dist/bin/next start -H 0.0.0.0 -p 8080
