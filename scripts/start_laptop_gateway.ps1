<#
.SYNOPSIS
    Starts the local KesslerX Laptop Gateway Agent connected to the Render production backend
    so the Vercel Mission Control dashboard (https://kessler-x.vercel.app) can control
    hotspot discovery, Laptop Direct Fallback, and receive live phone telemetry.

.PARAMETER BackendUrl
    Target KesslerX backend URL where phone telemetry is forwarded (default: https://kesslerx-backend.onrender.com).

.PARAMETER Port
    Localhost control port for Vercel -> Laptop Gateway Agent communication (default: 8000).
#>

[CmdletBinding()]
param(
    [string]$BackendUrl = "https://kesslerx-backend.onrender.com",
    [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$UvicornExe = Join-Path $BackendDir "venv\Scripts\uvicorn.exe"

if (-not (Test-Path $UvicornExe)) {
    Write-Error "Missing backend virtualenv uvicorn at $UvicornExe"
    exit 1
}

$env:KESSLERX_BACKEND_URL = $BackendUrl.TrimEnd('/')
$env:KESSLERX_CONNECTION_MANAGER = "1"

Write-Host ""
Write-Host "=== KesslerX Local Gateway Agent (Vercel + Render Mode) ===" -ForegroundColor Cyan
Write-Host "  Local Control Agent : http://127.0.0.1:$Port" -ForegroundColor Green
Write-Host "  Telemetry Backend   : $($env:KESSLERX_BACKEND_URL)" -ForegroundColor Green
Write-Host "  Dashboard (Vercel)  : https://kessler-x.vercel.app/ground-station" -ForegroundColor White
Write-Host ""
Write-Host "Waking Render backend (cold starts can take ~25-45s on free tier)..." -ForegroundColor DarkGray
try {
    $null = Invoke-RestMethod -Uri "$($env:KESSLERX_BACKEND_URL)/api/health" -TimeoutSec 30
    Write-Host "[OK] Render backend is awake." -ForegroundColor Green
}
catch {
    Write-Warning "Render backend did not answer yet ($($_.Exception.Message)). SQLite offline buffering will queue packets automatically until Render wakes up."
}

# Print the discovered Phone Simulator URL once the local agent comes up
Start-Job -ScriptBlock {
    param($LocalPort)
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 2
        try {
            $st = Invoke-RestMethod -Uri "http://127.0.0.1:$LocalPort/api/network/status" -TimeoutSec 3
            if ($st.active_mode -ne 'SEARCHING') {
                Write-Host ""
                Write-Host "[READY] Active Mode: $($st.active_mode) ($($st.ground_station_id))" -ForegroundColor Cyan
                Write-Host "[READY] Detected Network: $($st.detected_network.network_name) [$($st.detected_network.profile_type)] -> $($st.detected_network.selected_ip)" -ForegroundColor Cyan
                if ($st.simulator.url_with_token) {
                    Write-Host "[PHONE URL] $($st.simulator.url_with_token)" -ForegroundColor Yellow
                }
                break
            }
        }
        catch {
            # still booting
        }
    }
} -ArgumentList $Port | Out-Null

Push-Location $BackendDir
try {
    & $UvicornExe main:app --host 127.0.0.1 --port $Port
}
finally {
    Pop-Location
    Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue
}
