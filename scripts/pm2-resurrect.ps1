# Watchdog PM2: etiquetas-web + etiquetas-api
# - Arranca / revive si el health de :3000 falla (front proxy → API).
$ErrorActionPreference = 'Continue'
$project = Split-Path $PSScriptRoot -Parent
$logDir = Join-Path $project 'logs'
$logFile = Join-Path $logDir 'pm2-startup.log'
$Port = 3000
$AppNames = @('etiquetas-api', 'etiquetas-web')

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-Log([string]$msg) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Test-AppHealth {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 5
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
  } catch {
    return $false
  }
}

$machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
$userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
$env:Path = "$machinePath;$userPath"
$npmBin = Join-Path $env:APPDATA 'npm'
if (Test-Path $npmBin) {
  $env:Path = "$npmBin;$env:Path"
}

$pm2Candidates = @(
  (Join-Path $env:APPDATA 'npm\pm2.cmd'),
  'C:\Program Files\nodejs\pm2.cmd'
)
$pm2FromPath = Get-Command pm2.cmd -ErrorAction SilentlyContinue
if ($pm2FromPath) { $pm2Candidates = @($pm2FromPath.Source) + $pm2Candidates }
$pm2Cmd = $pm2Candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $pm2Cmd) {
  Write-Log 'ERROR: pm2.cmd no encontrado'
  exit 1
}

if (Test-AppHealth) {
  exit 0
}

Write-Log '=== pm2-resurrect start (health FAIL) ==='
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$node = if ($nodeCmd) { $nodeCmd.Source } else { 'MISSING' }
Write-Log ("node={0}" -f $node)
Write-Log ("pm2.cmd={0} exists={1}" -f $pm2Cmd, (Test-Path $pm2Cmd))

for ($i = 1; $i -le 15; $i++) {
  if (Get-Command node -ErrorAction SilentlyContinue) { break }
  Start-Sleep -Seconds 2
}

Set-Location $project
Write-Log ("cwd={0}" -f (Get-Location).Path)

& $pm2Cmd resurrect 2>&1 | ForEach-Object { Write-Log ("resurrect: {0}" -f $_) }
Start-Sleep -Seconds 3

$listText = (& $pm2Cmd list --no-color 2>$null | Out-String)
$missing = @()
foreach ($name in $AppNames) {
  if ($listText -notmatch [regex]::Escape($name)) {
    $missing += $name
  }
}

if ($missing.Count -gt 0) {
  Write-Log ("faltan apps: {0}; arrancando ecosystem.config.cjs" -f ($missing -join ', '))
  & $pm2Cmd start (Join-Path $project 'ecosystem.config.cjs') --update-env 2>&1 |
    ForEach-Object { Write-Log ("start: {0}" -f $_) }
  & $pm2Cmd save 2>&1 | ForEach-Object { Write-Log ("save: {0}" -f $_) }
} else {
  Write-Log 'apps en lista pero health falló; restart --update-env'
  foreach ($name in $AppNames) {
    & $pm2Cmd restart $name --update-env 2>&1 |
      ForEach-Object { Write-Log ("restart {0}: {1}" -f $name, $_) }
  }
}

Start-Sleep -Seconds 4
$ok = Test-AppHealth
Write-Log ("healthAfter={0}" -f $ok)
& $pm2Cmd list 2>&1 | ForEach-Object { Write-Log ("list: {0}" -f $_) }
Write-Log '=== pm2-resurrect end ==='
exit 0
