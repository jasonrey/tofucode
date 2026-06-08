#!/bin/bash

if [ "$EUID" -ne 0 ]; then
  echo "Please run with sudo: sudo ./init-caddy.sh"
  exit 1
fi

docker stop tofucode-caddy 2>/dev/null
docker rm tofucode-caddy 2>/dev/null

docker run -d \
  --name tofucode-caddy \
  --network public \
  --restart unless-stopped \
  -v /home/ts/projects/tofucode/dist:/srv:ro \
  -v /home/ts/projects/tofucode/Caddyfile:/etc/caddy/Caddyfile:ro \
  caddy:alpine

echo "tofucode-caddy container started successfully"
docker ps | grep tofucode-caddy
