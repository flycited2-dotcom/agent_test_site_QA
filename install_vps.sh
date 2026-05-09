#!/usr/bin/env bash
set -e

APP_DIR="$HOME/climat-simf-qa-agent"
echo "Установка QA Agent в $APP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker не найден. Устанавливаю Docker..."
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg git unzip
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

sudo systemctl enable docker
sudo systemctl start docker

mkdir -p "$APP_DIR"
rsync -a --exclude='.git' ./ "$APP_DIR"/
cd "$APP_DIR"
chmod +x scripts/agent-loop.sh start.sh stop.sh status.sh run_once.sh

echo "Собираю Docker-образ..."
sudo docker compose build

echo "Запускаю QA Agent в автозапуске Docker restart=unless-stopped..."
sudo docker compose up -d

echo "Готово. Проверить статус: cd $APP_DIR && ./status.sh"
