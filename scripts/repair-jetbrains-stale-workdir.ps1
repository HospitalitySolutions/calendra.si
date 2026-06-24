param(
    [string]$ProjectRoot,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    if ($PSScriptRoot) {
        $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } else {
        $ProjectRoot = (Get-Location).Path
    }
}

$ideaDir = Join-Path $ProjectRoot ".idea"
$runDir = Join-Path $ProjectRoot ".run"
$staleRegex = "@capacitor-community[\\/]+speech-recognition|frontend[\\/]+node_modules[\\/]+@capacitor-community[\\/]+speech-recognition"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "Project root: $ProjectRoot"

$searchRoots = @()
if (Test-Path $ideaDir) { $searchRoots += $ideaDir }
if (Test-Path $runDir) { $searchRoots += $runDir }

if ($searchRoots.Count -eq 0) {
    Write-Host "No JetBrains .idea or .run directory was found. Nothing to clean."
    exit 0
}

$staleFiles = @()
foreach ($root in $searchRoots) {
    $files = Get-ChildItem -Path $root -Recurse -Force -File -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($content -match $staleRegex) {
            $staleFiles += $file
        }
    }
}

if ($staleFiles.Count -eq 0) {
    Write-Host "No stale JetBrains references to @capacitor-community/speech-recognition were found."
    exit 0
}

Write-Host "Found stale JetBrains IDE files:"
foreach ($file in $staleFiles) {
    Write-Host " - $($file.FullName)"
}

if (-not $Force) {
    Write-Host ""
    Write-Host "Close IntelliJ/WebStorm/Android Studio before continuing."
    $answer = Read-Host "Back up and disable these stale IDE files now? Type YES to continue"
    if ($answer -ne "YES") {
        Write-Host "Cancelled. No files changed."
        exit 1
    }
}

foreach ($file in $staleFiles) {
    $backupPath = "$($file.FullName).bak-$stamp"
    $disabledPath = "$($file.FullName).disabled-$stamp"

    Copy-Item -LiteralPath $file.FullName -Destination $backupPath -Force
    Move-Item -LiteralPath $file.FullName -Destination $disabledPath -Force

    Write-Host "Disabled: $($file.FullName)"
    Write-Host "Backup:   $backupPath"
}

Write-Host ""
Write-Host "Done. Reopen the project from the repository root, not from frontend/node_modules."
Write-Host "If the IDE still shows the popup, run File > Invalidate Caches / Restart."
