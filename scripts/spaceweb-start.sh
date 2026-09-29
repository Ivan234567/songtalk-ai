#!/bin/sh
set -e
cd /usr/src/app/frontend
if [ ! -e .next ]; then
  ln -s /usr/src/app/.next .next
fi
exec /usr/src/app/node_modules/.bin/next start -H 0.0.0.0 -p 8080
