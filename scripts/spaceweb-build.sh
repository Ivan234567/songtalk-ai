#!/bin/sh
set -e
cd /app/frontend
npm install
npm install --no-save @next/swc-linux-x64-gnu@14.0.4
npm run build
test -d /app/frontend/.next
rm -rf /app/.next
cp -a /app/frontend/.next /app/.next
test -f /app/.next/BUILD_ID
mkdir -p /app/.next/node_modules
if [ -d /app/node_modules ]; then
  cp -a /app/node_modules/. /app/.next/node_modules/
fi
if [ -d /app/frontend/node_modules ]; then
  cp -a /app/frontend/node_modules/. /app/.next/node_modules/
fi
test -f /app/.next/node_modules/next/dist/bin/next
echo "spaceweb-build: /app/.next ready"
