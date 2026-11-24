$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail([string]$Message) {
    Write-Host $Message -ForegroundColor Red
    exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Fail 'Node.js 20+ is required. Install it from https://nodejs.org/ or run: winget install OpenJS.NodeJS.LTS'
}

$nodeVersion = (& node -v).TrimStart('v')
if ([int]($nodeVersion.Split('.')[0]) -lt 20) {
    Fail "Node.js 20+ is required (found $nodeVersion)."
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
    Fail 'npm.cmd was not found. Please reinstall Node.js.'
}

Write-Host ''
Write-Host '  REMOTE BRIDGE  -  Windows launcher' -ForegroundColor Cyan
Write-Host '  ---------------------------------------' -ForegroundColor DarkGray
Write-Host ''

if (-not (Test-Path 'node_modules\express') -or -not (Test-Path 'node_modules\selfsigned') -or -not (Test-Path 'node_modules\sherpa-onnx-node')) {
    Write-Host 'Installing dependencies (first run)...' -ForegroundColor Yellow
    & $npm.Source install
    if ($LASTEXITCODE -ne 0) {
        Fail 'npm install failed. Check the network connection and try again.'
    }
}

if (-not (Test-Path 'data\models\sense-voice\model.int8.onnx')) {
    Write-Host 'Downloading the SenseVoice model (~163 MB)...' -ForegroundColor Yellow
    & $npm.Source run model:download
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Model download failed. You can retry from the PC page after startup.' -ForegroundColor Yellow
    }
}

$env:AUTO_START_WINDOWS_AGENT = '1'
$port = if ($env:PORT) { $env:PORT } else { '3000' }
$pcUrl = "http://localhost:$port/pc"

$null = Start-Job -ScriptBlock {
    param($url)
    for ($index = 0; $index -lt 60; $index += 1) {
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1 | Out-Null
            break
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    Start-Process $url
} -ArgumentList $pcUrl

Write-Host ''
Write-Host "  PC page   $pcUrl" -ForegroundColor Green
Write-Host '  Keep this window open. Press Ctrl+C to stop.' -ForegroundColor DarkGray
Write-Host '  If the phone cannot connect, allow Node.js through Windows Firewall' -ForegroundColor DarkGray
Write-Host '  on Private networks (TCP 3000 and 3443).' -ForegroundColor DarkGray
Write-Host ''

try {
    & $npm.Source start
} finally {
    Get-Job | Stop-Job -ErrorAction SilentlyContinue
    Get-Job | Remove-Job -ErrorAction SilentlyContinue
}
