#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
sudo docker compose up -d --build
echo "QA Agent запущен. Статус: ./status.sh"
