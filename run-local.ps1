# Run TherapyApp locally (DB in Docker, backend + frontend on host)
# Use this if Docker port forwarding causes "stuck on loading" or connection issues.

Write-Host "Starting database..." -ForegroundColor Cyan
docker compose up db -d

Write-Host "`nWaiting for PostgreSQL..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

Write-Host "`nStarting backend (new window)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; `$env:SPRING_DATASOURCE_URL='jdbc:postgresql://localhost:5432/therapy_app'; mvn spring-boot:run"

Write-Host "Starting frontend (new window)..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"

Write-Host "`nApp starting. Open http://localhost:5173 in your browser (use a regular Chrome/Edge window, not Cursor's embedded browser)." -ForegroundColor Green
