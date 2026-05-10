#!/usr/bin/env bash
set -e
export TZ=${TIMEZONE:-Europe/Moscow}
mkdir -p reports/html reports/json reports/markdown test-results storage

echo "QA Agent запущен для ${BASE_URL}"
echo "Режим: ${QA_MODE}"

run_smoke() {
  echo "[$(date)] Smoke run"
  npm run qa:run:smoke || true
}

run_critical() {
  echo "[$(date)] Critical run"
  npm run qa:run:critical || true
}

run_full() {
  echo "[$(date)] Full run"
  npm run qa:discover || true
  npm run qa:run:full || true
}

is_paused() {
  [ -f storage/control.json ] && grep -q '"paused"[[:space:]]*:[[:space:]]*true' storage/control.json
}

if [ "${QA_MODE}" = "smoke" ]; then run_smoke; exit 0; fi
if [ "${QA_MODE}" = "critical" ]; then run_critical; exit 0; fi
if [ "${QA_MODE}" = "full" ]; then run_full; exit 0; fi
if [ "${QA_MODE}" != "loop" ]; then
  echo "Неверный QA_MODE: ${QA_MODE}. Используйте smoke, critical, full или loop."
  exit 2
fi

SMOKE_INTERVAL=${SMOKE_INTERVAL_MINUTES:-30}
CRITICAL_INTERVAL=${CRITICAL_INTERVAL_MINUTES:-120}
FULL_HOUR=${FULL_RUN_HOUR:-3}
last_smoke=0
last_critical=0
last_full_day=""

while true; do
  if is_paused; then
    echo "[$(date)] QA Agent paused by Telegram command"
    sleep 60
    continue
  fi

  now=$(date +%s)
  hour=$(date +%H)
  day=$(date +%F)

  if [ $(( (now-last_smoke)/60 )) -ge "$SMOKE_INTERVAL" ]; then
    run_smoke
    last_smoke=$now
  fi

  if [ $(( (now-last_critical)/60 )) -ge "$CRITICAL_INTERVAL" ]; then
    run_critical
    last_critical=$now
  fi

  if [ "$hour" = "$(printf '%02d' $FULL_HOUR)" ] && [ "$last_full_day" != "$day" ]; then
    run_full
    last_full_day=$day
  fi

  sleep 60
done
