Write-Host "Этот файл нужен для локального запуска на Windows, если установлен Docker Desktop." -ForegroundColor Cyan
Write-Host "Для VPS Ubuntu используйте install_vps.sh и start.sh" -ForegroundColor Yellow
docker compose up -d --build
Write-Host "QA Agent запущен. Отчёты будут в папке reports." -ForegroundColor Green
