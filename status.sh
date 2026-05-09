#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
sudo docker compose ps
echo "
Последние логи:"
sudo docker compose logs --tail=80 qa-agent
