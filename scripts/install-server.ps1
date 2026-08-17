#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Instalador del SERVIDOR etiquetas-colineal en una PC nueva (Windows).
  Instala Node.js, PM2, dependencias, build, firewall 3000 y autoarranque.

.NOTES
  Ejecutar desde la carpeta del proyecto (o via install-server.bat).
  La BD principal es Odoo (solo lectura). La BD local (Prisma) es opcional:
  si DATABASE_URL no responde, la app igual arranca contra Odoo.
#>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Root = Split-Path $PSScriptRoot -Parent
$Port = 3000
$NodeMajorMin = 18
$NodeMsiUrl = 'https://nodejs.org/dist/v22.16.0/node-v22.16.0-x64.msi'
$AppName = 'etiquetas-colineal'
$TaskName = 'EtiquetasColinealPM2'

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
  $npmBin = Join-Path $env:APPDATA 'npm'
  if (Test-Path $npmBin) { $env:Path = "$npmBin;$env:Path" }
}

function Test-NodeOk {
  Refresh-Path
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { return $false }
  try {
    $ver = (& node -v 2>$null)
    if ($ver -match '^v(\d+)\.') { return [int]$Matches[1] -ge $NodeMajorMin }
  } catch {}
  return $false
}

function Install-NodeJs {
  Write-Step 'Instalando Node.js LTS...'
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    & winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --disable-interactivity
    Refresh-Path
    if (Test-NodeOk) { return }
  }
  $msi = Join-Path $env:TEMP 'node-lts-x64.msi'
  Invoke-WebRequest -Uri $NodeMsiUrl -OutFile $msi -UseBasicParsing
  $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru
  if ($p.ExitCode -notin 0, 3010) {
    throw "Fallo instalacion de Node (msiexec exit $($p.ExitCode))"
  }
  Remove-Item $msi -Force -ErrorAction SilentlyContinue
  Refresh-Path
  if (-not (Test-NodeOk)) {
    throw 'Node.js no quedo en PATH. Cierra la ventana y vuelve a ejecutar install-server.bat como Admin.'
  }
}

function Ensure-EnvFile {
  Write-Step '.env del servidor...'
  $envPath = Join-Path $Root '.env'
  if (Test-Path $envPath) {
    Write-Host '.env ya existe — se conserva.' -ForegroundColor Yellow
    return
  }
  Copy-Item (Join-Path $Root '.env.example') $envPath
  Write-Host 'Creado .env desde .env.example' -ForegroundColor Green
  Write-Host 'IMPORTANTE: edita .env y revisa:' -ForegroundColor Yellow
  Write-Host '  - ODOO_DATABASE_URL (usuario/clave del rol colineal)'
  Write-Host '  - PRINT_AGENT_URL (IP de la PC con la impresora, puerto 9120)'
  Write-Host '  - PRINT_ADMIN_PIN'
}

function Ensure-Pm2 {
  Write-Step 'PM2 + arranque automatico...'
  Refresh-Path
  & npm install -g pm2@latest
  Refresh-Path
  & npm install -g pm2-windows-startup
  Refresh-Path
  $startup = Get-Command pm2-startup -ErrorAction SilentlyContinue
  if ($startup) { & pm2-startup install }
}

function Build-App {
  Write-Step 'npm ci + build (Vite)...'
  Push-Location $Root
  try {
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci fallo' }
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build fallo' }
  }
  finally { Pop-Location }
}

function Ensure-Firewall {
  Write-Step 'Firewall TCP 3000 (front) + 3010 (API)'
  foreach ($p in @(3000, 3010)) {
    $ruleName = "Etiquetas Colineal TCP $p"
    if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
      Write-Host "Ya existe: $ruleName"
      continue
    }
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $p -Action Allow -Profile Any | Out-Null
    Write-Host "Creada: $ruleName"
  }
}

function Start-AppWithPm2 {
  Write-Step 'PM2 start (etiquetas-api + etiquetas-web)...'
  New-Item -ItemType Directory -Force -Path (Join-Path $Root 'logs') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $Root 'apps/api/data') | Out-Null
  Push-Location $Root
  try {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    foreach ($name in @('etiquetas-colineal', 'etiquetas-api', 'etiquetas-web')) {
      try { & pm2 delete $name 2>&1 | Out-Null } catch {}
    }
    $ErrorActionPreference = $prev

    & pm2 start (Join-Path $Root 'ecosystem.config.cjs') --update-env
    if ($LASTEXITCODE -ne 0) { throw 'pm2 start fallo' }
    & pm2 save
  }
  finally { Pop-Location }
}

function Ensure-StartupTask {
  Write-Step "Tareas programadas $TaskName (boot/logon + watchdog)..."
  $script = Join-Path $PSScriptRoot 'pm2-resurrect.ps1'
  $action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""

  & schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
  & schtasks /Create /TN $TaskName /TR $action /SC ONSTART /RU SYSTEM /RL HIGHEST /F | Out-Null
  Write-Host "Tarea $TaskName creada (ONSTART, SYSTEM)."

  & schtasks /Delete /TN "${TaskName}Logon" /F 2>$null | Out-Null
  & schtasks /Create /TN "${TaskName}Logon" /TR $action /SC ONLOGON /RL HIGHEST /F | Out-Null
  Write-Host "Tarea ${TaskName}Logon creada (ONLOGON)."

  # Watchdog cada 5 min: si el demonio PM2 muere a media jornada, lo revive.
  $watchName = "${TaskName}Watch"
  & schtasks /Delete /TN $watchName /F 2>$null | Out-Null
  & schtasks /Create /TN $watchName /TR $action /SC MINUTE /MO 5 /RL HIGHEST /F | Out-Null
  Write-Host "Tarea $watchName creada (cada 5 minutos)."
}

function Test-AppHealth {
  Write-Step 'Health check (:3000/health → API)...'
  Start-Sleep -Seconds 3
  try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 10 -UseBasicParsing
    Write-Host ("OK http://127.0.0.1:{0}/health -> {1}" -f $Port, $res.StatusCode) -ForegroundColor Green
  } catch {
    Write-Host "Health fallo: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host 'Revisa: pm2 logs etiquetas-api  /  pm2 logs etiquetas-web'
  }
}

Write-Host '=============================================='
Write-Host '  Etiquetas Colineal — Instalador SERVIDOR'
Write-Host "  $Root"
Write-Host '=============================================='

if (-not (Test-NodeOk)) { Install-NodeJs } else { Write-Step "Node: $(node -v)" }

Ensure-EnvFile
Ensure-Pm2
Build-App
Ensure-Firewall
Start-AppWithPm2
Ensure-StartupTask
Test-AppHealth

$ips = @(
  Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -ExpandProperty IPAddress -First 3
) -join ', '

Write-Host ''
Write-Host '=============================================='
Write-Host '  LISTO' -ForegroundColor Green
Write-Host "  Front: http://localhost:$Port"
Write-Host '  API:   http://localhost:3010'
if ($ips) { Write-Host "  LAN:   http://${ips}:$Port" }
Write-Host '  Logs:  pm2 logs'
Write-Host ''
Write-Host '  Pendiente manual:'
Write-Host '   1. Editar .env (ODOO_DATABASE_URL, PRINT_AGENT_URL, PIN)'
Write-Host '   2. pm2 restart all --update-env'
Write-Host '   3. Configuracion -> Impresoras: agente + sync + visibles'
Write-Host '=============================================='
