<#
.SYNOPSIS
    Configures scoped Windows Defender Firewall rules for KesslerX Laptop Direct Fallback.

.DESCRIPTION
    Allows inbound TCP traffic ONLY on the Private network profile and ONLY from
    the local subnet (LocalSubnet) on ports 8444 (HTTPS/WSS simulator gateway) and
    8766 (HTTP fallback gateway). Never opens Public firewall profiles globally.

.PARAMETER Remove
    Removes the KesslerX Laptop Fallback firewall rules.

.PARAMETER HttpsPort
    HTTPS/WSS fallback gateway port (default: 8444).

.PARAMETER HttpPort
    HTTP fallback gateway port (default: 8766).
#>

[CmdletBinding()]
param(
    [switch]$Remove,
    [int]$HttpsPort = 8444,
    [int]$HttpPort = 8766
)

$ErrorActionPreference = 'Stop'

$ruleNames = @(
    "KesslerX Laptop Fallback HTTPS (TCP $HttpsPort)",
    "KesslerX Laptop Fallback HTTP (TCP $HttpPort)"
)

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Host ""
Write-Host "=== KesslerX Windows Defender Firewall Check ===" -ForegroundColor Cyan

# Read-only inspection of current connection profiles
$profiles = Get-NetConnectionProfile -ErrorAction SilentlyContinue
foreach ($p in $profiles) {
    if ($p.NetworkCategory -eq 'Public') {
        Write-Warning (
            "Interface '$($p.InterfaceAlias)' (Network: '$($p.Name)') is currently set to PUBLIC. " +
            "Scoped KesslerX rules use -Profile Private ONLY and will NOT allow phone traffic on Public networks. " +
            "In Windows Settings -> Network & internet -> Wi-Fi (or Mobile Hotspot), switch Network profile type to Private."
        )
    }
    else {
        Write-Host "[OK] Interface '$($p.InterfaceAlias)' ($($p.Name)) profile: $($p.NetworkCategory)" -ForegroundColor Green
    }
}

if (-not (Test-IsAdministrator)) {
    Write-Warning "Administrator privileges are required to create or remove Windows Defender Firewall rules."
    Write-Host "Run this script from an elevated PowerShell prompt:" -ForegroundColor Yellow
    Write-Host "  Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File `"$PSCommandPath`"'" -ForegroundColor White
    exit 1
}

if ($Remove) {
    foreach ($name in $ruleNames) {
        $existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
        if ($existing) {
            Remove-NetFirewallRule -DisplayName $name
            Write-Host "[REMOVED] $name" -ForegroundColor Yellow
        }
        else {
            Write-Host "[SKIP] Rule not found: $name" -ForegroundColor DarkGray
        }
    }
    exit 0
}

foreach ($name in $ruleNames) {
    $existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
    if ($existing) {
        Remove-NetFirewallRule -DisplayName $name
    }
}

New-NetFirewallRule `
    -DisplayName $ruleNames[0] `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $HttpsPort `
    -Profile Private `
    -RemoteAddress LocalSubnet `
    -Action Allow `
    -Description "Allows KesslerX Phone Satellite HTTPS/WSS connection to Laptop Direct Fallback gateway on Private subnet only." | Out-Null

New-NetFirewallRule `
    -DisplayName $ruleNames[1] `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $HttpPort `
    -Profile Private `
    -RemoteAddress LocalSubnet `
    -Action Allow `
    -Description "Allows KesslerX Laptop Direct Fallback HTTP health/telemetry traffic on Private subnet only." | Out-Null

Write-Host "[CONFIGURED] Scoped Private-profile rules active for ports $HttpsPort and $HttpPort (LocalSubnet only)." -ForegroundColor Green
Get-NetFirewallRule -DisplayName 'KesslerX*' | ForEach-Object {
    $pf = $_ | Get-NetFirewallPortFilter
    [PSCustomObject]@{
        DisplayName = $_.DisplayName
        Enabled     = $_.Enabled
        Profile     = $_.Profile
        LocalPort   = $pf.LocalPort
        Action      = $_.Action
    }
} | Format-Table -AutoSize
