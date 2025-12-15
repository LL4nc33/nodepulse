# Quick deploy to Raspberry Pi (PowerShell version)
# Usage: .\deploy.ps1 [-Target "pi@host"] [-RemotePath "/opt/nodepulse"]

param(
    [string]$Target = "pi@raspberrypi",
    [string]$RemotePath = "/opt/nodepulse"
)

$ErrorActionPreference = "Stop"

Write-Host "Deploying to ${Target}:${RemotePath} ..." -ForegroundColor Cyan

# Files/folders to sync
$items = @("src", "scripts", "views", "public", "bin", "package.json")

foreach ($item in $items) {
    if (Test-Path $item) {
        Write-Host "  Copying $item ..."
        scp -r $item "${Target}:${RemotePath}/"
    }
}

Write-Host "Restarting nodepulse service..." -ForegroundColor Cyan
ssh $Target "sudo systemctl restart nodepulse 2>/dev/null || (cd $RemotePath && npm start &)"

Write-Host "Done!" -ForegroundColor Green
