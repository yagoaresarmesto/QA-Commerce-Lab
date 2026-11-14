#!/bin/sh
# Pulls the requested image and (re)starts the stack. Usage: IMAGE=ghcr.io/owner/qa-commerce-lab:<tag> ./deploy.sh
set -eu
cd "$(dirname "$0")"
if [ -n "${IMAGE:-}" ]; then
  sed -i "s#^IMAGE=.*#IMAGE=${IMAGE}#" .env
fi
docker compose pull demo testing
docker compose up -d --remove-orphans
docker image prune -f >/dev/null
echo "Waiting for health checks..."
for env in demo testing; do
  for i in $(seq 1 30); do
    if docker compose exec -T "$env" node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
      echo "  $env is ready"; break
    fi
    sleep 3
  done
done
docker compose ps
