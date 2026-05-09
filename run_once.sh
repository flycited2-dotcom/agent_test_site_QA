#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
MODE=${1:-smoke}
case "$MODE" in
  smoke|critical|full) ;;
  *)
    echo "Неверный режим: $MODE. Используйте smoke, critical или full."
    exit 2
    ;;
esac
if [ "$MODE" = "full" ]; then
  sudo docker compose run --rm -e QA_MODE=$MODE qa-agent bash -lc "npm run qa:discover && npm run qa:run:$MODE"
else
  sudo docker compose run --rm -e QA_MODE=$MODE qa-agent bash -lc "npm run qa:run:$MODE"
fi
echo "Разовый прогон завершён. Отчёты в ./reports"
