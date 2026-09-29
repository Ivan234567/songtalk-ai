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
echo "spaceweb-build: /app/.next ready"
