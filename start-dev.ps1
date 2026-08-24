<#
.SYNOPSIS
Starts LabStock backend and frontend in separate console windows.
#>

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

Write-Host "Starting LabStock Backend (port 8003)..."
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$backendDir'; python run_backend_fixed.py"

Write-Host "Starting LabStock Frontend (port 3000)..."
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$frontendDir'; npm start"

Write-Host "Both services launching. Check the new console windows for status."
