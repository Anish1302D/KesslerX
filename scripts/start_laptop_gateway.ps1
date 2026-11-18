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
$PythonExe = Join-Path $BackendDir "venv\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    Write-Error "Missing backend virtualenv Python at $PythonExe"
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

# Pre-flight Windows Firewall & Network Profile Check
$fwRules = Get-NetFirewallRule -DisplayName 'KesslerX*' -ErrorAction SilentlyContinue
$netProfiles = Get-NetConnectionProfile -ErrorAction SilentlyContinue
foreach ($p in $netProfiles) {
    if ($p.NetworkCategory -eq 'Public') {
        Write-Warning "Network '$($p.Name)' ($($p.InterfaceAlias)) is PUBLIC. Switch it to Private in Windows Settings so your phone can reach port 8444!"
    }
    else {
        Write-Host "[OK] Windows Wi-Fi Profile '$($p.Name)' ($($p.InterfaceAlias)): $($p.NetworkCategory)" -ForegroundColor Green
    }
}
if (-not $fwRules) {
    Write-Warning "No KesslerX Windows Firewall allow rules found for ports 8444/8766!"
    Write-Host "  Run ONCE in Administrator PowerShell:" -ForegroundColor Yellow
    Write-Host "    powershell -ExecutionPolicy Bypass -File scripts/setup_windows_firewall.ps1" -ForegroundColor White
    Write-Host ""
}

Write-Host "Waking Render backend (cold starts can take ~25-45s on free tier)..." -ForegroundColor DarkGray
try {
    $null = Invoke-RestMethod -Uri "$($env:KESSLERX_BACKEND_URL)/api/health" -TimeoutSec 25
    Write-Host "[OK] Render backend is awake." -ForegroundColor Green
}
catch {
    Write-Warning "Render backend did not answer yet ($($_.Exception.Message)). SQLite offline buffering will queue packets automatically until Render wakes up."
}

Write-Host "Starting local uvicorn control agent + fallback gateway..." -ForegroundColor Cyan
$proc = Start-Process -FilePath $PythonExe `
    -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "$Port" `
    -WorkingDirectory $BackendDir `
    -NoNewWindow `
    -PassThru

try {
    $readyStatus = $null
    $autoTriggered = $false
    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 1
        if ($proc.HasExited) {
            Write-Error "Uvicorn exited early with code $($proc.ExitCode)"
            exit 1
        }
        try {
            $st = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/network/status" -TimeoutSec 3
            if ($st.active_mode -eq 'SEARCHING' -and -not $autoTriggered) {
                $autoTriggered = $true
                Write-Host "Running dynamic hotspot & Raspberry Pi discovery..." -ForegroundColor DarkGray
                $st = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/network/discover" `
                    -Method Post `
                    -ContentType "application/json" `
                    -Body '{"auto_connect":true}' `
                    -TimeoutSec 20
            }
            if ($st.active_mode -eq 'PI' -or $st.active_mode -eq 'LAPTOP_FALLBACK') {
                $readyStatus = $st
                break
            }
        }
        catch {
            # still booting
        }
    }

    if ($readyStatus) {
        Write-Host ""
        Write-Host "============================================================" -ForegroundColor Green
        Write-Host "  ACTIVE MODE   : $($readyStatus.active_mode) ($($readyStatus.ground_station_id))" -ForegroundColor Green
        Write-Host "  WIFI NETWORK  : $($readyStatus.detected_network.network_name) [$($readyStatus.detected_network.profile_type)]" -ForegroundColor Cyan
        Write-Host "  LAPTOP IP     : $($readyStatus.detected_network.selected_ip)" -ForegroundColor Cyan
        if ($readyStatus.simulator.url_with_token) {
            Write-Host "  PHONE URL     : $($readyStatus.simulator.url_with_token)" -ForegroundColor Yellow
            Write-Host "============================================================" -ForegroundColor Green
            $nodeExe = Get-Command node -ErrorAction SilentlyContinue
            $qrModule = Join-Path $RepoRoot "node_modules\qrcode"
            if ($nodeExe -and (Test-Path $qrModule)) {
                Write-Host "Scan this QR code with your phone (connected to $($readyStatus.detected_network.network_name)):" -ForegroundColor White
                $qrScript = "const q=require(process.argv[1]); q.toString(process.argv[2],{type:'terminal',small:true},(e,s)=>{if(!e)console.log(s);});"
                & $nodeExe.Source -e $qrScript $qrModule "$($readyStatus.simulator.url_with_token)"
            }
        }
        else {
            Write-Host "============================================================" -ForegroundColor Green
        }
        Write-Host "Keep this terminal open while streaming. Press Ctrl+C to stop." -ForegroundColor DarkGray
    }
    else {
        Write-Warning "Local Gateway Agent did not report ready mode within 25s. Check http://127.0.0.1:$Port/api/network/status"
    }

    Wait-Process -Id $proc.Id
}
finally {
    if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}
