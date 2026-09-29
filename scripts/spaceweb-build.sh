#!/bin/sh
set -e
cd /app/frontend
npm install
npm install --no-save @next/swc-linux-x64-gnu@14.0.4
npm run build
rm -rf /app/.next
cp -a /app/frontend/.next /app/.next
