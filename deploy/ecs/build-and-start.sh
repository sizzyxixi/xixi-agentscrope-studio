#!/bin/bash
set -euo pipefail
cd /opt/moonclaw/app
docker compose -f compose.ecs.yml config --quiet
docker compose -f compose.ecs.yml build backend
docker compose -f compose.ecs.yml build web
docker compose -f compose.ecs.yml pull proxy
docker compose -f compose.ecs.yml up -d --wait --wait-timeout 300
printf 'DEPLOYMENT_SUCCESS\n'
