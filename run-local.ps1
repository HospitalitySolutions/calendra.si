# Run Calendra locally (DB in Docker, backend + frontend on host)
# Use this if Docker port forwarding causes "stuck on loading" or connection issues.

Write-Host "Starting database..." -ForegroundColor Cyan
docker compose -f docker-compose.local.yml up db -d

Write-Host "`nWaiting for PostgreSQL..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

Write-Host "`nStarting backend (new window)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; `$env:SPRING_PROFILES_ACTIVE='local'; `$env:SPRING_DATASOURCE_URL='jdbc:postgresql://localhost:5432/calendradb'; `$env:SPRING_DATASOURCE_USERNAME='calendra'; `$env:SPRING_DATASOURCE_PASSWORD='calendra'; `$env:APP_JWT_SECRET='local-development-jwt-secret-change-me'; `$env:APP_SETTINGS_ENCRYPTION_KEY='local-development-settings-key-change-me'; mvn spring-boot:run"

Write-Host "Starting frontend (new window)..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"

Write-Host "`nApp starting. Open http://localhost:3000 in your browser." -ForegroundColor Green
Write-Host "Local login: local@calendra.si / Admin123!" -ForegroundColor Yellow
