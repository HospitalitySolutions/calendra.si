param(
  [string]$EnvFile = "load-tests/env/staging.env"
)

if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -and -not $_.TrimStart().StartsWith('#') -and $_.Contains('=')) {
      $parts = $_.Split('=', 2)
      [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process')
    }
  }
}

if (-not $env:BASE_URL) { throw "Set BASE_URL in env or $EnvFile" }
if (-not $env:ORIGIN) { throw "Set ORIGIN in env or $EnvFile" }

k6 run `
  -e BASE_URL="$env:BASE_URL" `
  -e ORIGIN="$env:ORIGIN" `
  -e LOADTEST_PASSWORD="$(if ($env:LOADTEST_PASSWORD) { $env:LOADTEST_PASSWORD } else { 'LoadTest123!' })" `
  -e SEED_TENANTS="$(if ($env:SEED_TENANTS) { $env:SEED_TENANTS } else { '1000' })" `
  -e SEED_GUESTS="$(if ($env:SEED_GUESTS) { $env:SEED_GUESTS } else { '10000' })" `
  -e P95_MS="$(if ($env:P95_MS) { $env:P95_MS } else { '800' })" `
  -e ERROR_RATE="$(if ($env:ERROR_RATE) { $env:ERROR_RATE } else { '0.01' })" `
  -e QUICK="$(if ($env:QUICK) { $env:QUICK } else { 'false' })" `
  load-tests/k6/production-readiness.js
