$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$appTitle = "지수 구간 계산"
$runtimeDir = Join-Path $env:TEMP "index-range-calculator"
$portFile = Join-Path $runtimeDir "server.port"
$logFile = Join-Path $runtimeDir "server.log"
$errFile = Join-Path $runtimeDir "server.err"

function Show-AppMessage {
  param([string] $Message)
  [System.Windows.Forms.MessageBox]::Show($Message, $appTitle) | Out-Null
}

function Get-RunningAppPort {
  foreach ($candidatePort in 4173..4182) {
    try {
      $health = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$candidatePort/api/health" -TimeoutSec 1
      if ($health.StatusCode -eq 200) {
        return $candidatePort
      }
    } catch {
    }
  }
  return $null
}

$runningPort = Get-RunningAppPort
if ($runningPort) {
  try {
    Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$runningPort/api/auto-exit" -Method Post -TimeoutSec 1 | Out-Null
  } catch {
  }
  Start-Process "http://127.0.0.1:$runningPort/"
  exit 0
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Show-AppMessage "Node.js를 찾지 못했습니다. 이 앱은 실시간 데이터를 불러오기 위해 Node.js가 필요합니다."
  exit 1
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
Remove-Item $portFile -Force -ErrorAction SilentlyContinue
$env:PORT = "4173"
$env:PORT_FILE = $portFile
$env:AUTO_EXIT = "1"

$serverFile = Join-Path $root "server.mjs"
$serverProcess = Start-Process -FilePath $node.Source -ArgumentList "`"$serverFile`"" -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError $errFile -PassThru

$port = $null
for ($i = 0; $i -lt 60; $i += 1) {
  if (Test-Path $portFile) {
    $port = (Get-Content $portFile -TotalCount 1).Trim()
    break
  }
  if ($serverProcess.HasExited) {
    break
  }
  Start-Sleep -Milliseconds 250
}

if ($port) {
  Start-Process "http://127.0.0.1:$port/"
  exit 0
}

$errorText = ""
if (Test-Path $errFile) {
  $errorText = (Get-Content $errFile -Raw).Trim()
}

if ($errorText) {
  Show-AppMessage "앱을 여는 중 문제가 생겼습니다.`n`n$errorText"
} else {
  Show-AppMessage "앱을 여는 중 문제가 생겼습니다. 잠시 후 다시 실행해 주세요."
}
exit 1
