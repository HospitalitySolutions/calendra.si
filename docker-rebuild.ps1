# Clean rebuild of TherapyApp Docker setup
# Use this if the app gets stuck loading or has connection issues

Write-Host "Stopping and removing containers..." -ForegroundColor Cyan
docker compose down

Write-Host "`nBuilding and starting (fresh)..." -ForegroundColor Cyan
docker compose up --build -d

Write-Host "`nWaiting for services to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 20

Write-Host "`nDone. Open http://127.0.0.1:5173 in your browser." -ForegroundColor Green
Write-Host "If it still hangs, try a regular Chrome/Edge window (not Cursor's embedded browser)." -ForegroundColor Yellow
