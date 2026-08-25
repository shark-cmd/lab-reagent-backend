<#
.SYNOPSIS
    Starts LabStock backend and frontend in separate console windows.
.DESCRIPTION
    Launches the FastAPI backend (port 8003) and React dev server (port 3000)
    in separate PowerShell windows. Stops on Ctrl+C.
#>

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

# Prefer pwsh (PowerShell Core), fall back to powershell (Windows PowerShell)
$shell = Get-Command pwsh -ErrorAction SilentlyContinue
if (-not $shell) { $shell = Get-Command powershell -ErrorAction SilentlyContinue }
if (-not $shell) {
    Write-Error "No PowerShell found. Install PowerShell Core: https://aka.ms/pscore6"
    exit 1
}
$shellExe = $shell.Source

Write-Host "Starting LabStock Backend (port 8003)..." -ForegroundColor Cyan
Start-Process $shellExe -ArgumentList "-NoExit", "-Command", "cd '$backendDir'; python run_backend_fixed.py"

Write-Host "Starting LabStock Frontend (port 3000)..." -ForegroundColor Cyan
Start-Process $shellExe -ArgumentList "-NoExit", "-Command", "cd '$frontendDir'; npm start"

Write-Host ""
Write-Host "Both services launching in separate windows." -ForegroundColor Green
Write-Host "  Backend:  http://localhost:8003  (Swagger: http://localhost:8003/docs)"
Write-Host "  Frontend: http://localhost:3000"
Write-Host ""
Write-Host "Close each window or press Ctrl+C in each to stop." -ForegroundColor Yellow
