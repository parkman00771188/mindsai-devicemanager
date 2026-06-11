param(
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$LogsDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null

$listeners = @(
  Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq "Listen" } |
    Select-Object -ExpandProperty OwningProcess -Unique
)

foreach ($processId in $listeners) {
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1

$stamp = Get-Date -Format yyyyMMdd-HHmmss
$outLog = Join-Path $LogsDir "prod-server-codex-$stamp.out.log"
$errLog = Join-Path $LogsDir "prod-server-codex-$stamp.err.log"

$env:PORT = "$Port"
Start-Process `
  -FilePath "node" `
  -ArgumentList "server/server.js" `
  -WorkingDirectory $Root `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -WindowStyle Hidden

Start-Sleep -Seconds 2

$active = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq "Listen" } |
  Select-Object LocalAddress, LocalPort, State, OwningProcess

if (-not $active) {
  Write-Error "Server did not start on port $Port. Check $errLog"
}

$active
Write-Output "OUT_LOG=$outLog"
Write-Output "ERR_LOG=$errLog"
