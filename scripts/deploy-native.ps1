#Requires -Version 5.1
<#
  Deploy SIN Docker — para Windows Server 2019 u otras máquinas sin Docker.
  Requiere: Node.js 20+ y PostgreSQL (binarios en C:\pgsql\16\pgsql o instalador EDB).
#>
param([switch]$SkipFirewall)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$pgBin = "C:\pgsql\16\pgsql\bin"
$dataDir = "C:\ProgramData\etiquetas-colineal\pgdata"
$pgLog = "C:\ProgramData\etiquetas-colineal\pg.log"

Set-Location $root
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Instala Node.js 20 LTS: https://nodejs.org/" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "$pgBin\pg_ctl.exe")) {
    Write-Host "PostgreSQL portable no encontrado en $pgBin" -ForegroundColor Red
    Write-Host "Descarga: https://www.enterprisedb.com/download-postgresql-binaries" -ForegroundColor Yellow
    Write-Host "Extrae en C:\pgsql\16 y ejecuta de nuevo este script." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    "colineal" | Set-Content -Path "$env:TEMP\pgpass.txt" -NoNewline
    & "$pgBin\initdb.exe" -U postgres -A scram-sha-256 -E UTF8 -D $dataDir --pwfile="$env:TEMP\pgpass.txt"
    Remove-Item "$env:TEMP\pgpass.txt" -Force
    $conf = Join-Path $dataDir "postgresql.conf"
    (Get-Content $conf) -replace "#port = 5432", "port = 5433" -replace "^port = 5432", "port = 5433" | Set-Content $conf
}

& "$pgBin\pg_isready.exe" -p 5433 2>$null
if ($LASTEXITCODE -ne 0) {
    & "$pgBin\pg_ctl.exe" -D $dataDir -l $pgLog start
    Start-Sleep -Seconds 3
}

$env:PGPASSWORD = "colineal"
& "$pgBin\psql.exe" -U postgres -p 5433 -tc "SELECT 1 FROM pg_roles WHERE rolname='colineal'" | ForEach-Object {
    if ($_.Trim() -ne "1") {
        & "$pgBin\psql.exe" -U postgres -p 5433 -c "CREATE USER colineal WITH PASSWORD 'colineal' SUPERUSER;"
        & "$pgBin\psql.exe" -U postgres -p 5433 -c "CREATE DATABASE etiquetas OWNER colineal;"
    }
}

if (-not (Test-Path (Join-Path $root ".env"))) {
    Copy-Item (Join-Path $root ".env.example") (Join-Path $root ".env") -ErrorAction SilentlyContinue
}

npm ci
npm run prisma:generate
npm run prisma:migrate
npm run build

if (-not $SkipFirewall) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($isAdmin) { & (Join-Path $PSScriptRoot "allow-port-3000.ps1") }
}

Write-Host ""
Write-Host "=== Listo. Inicia la app con: ===" -ForegroundColor Green
Write-Host "  npm start" -ForegroundColor Cyan
Write-Host "  http://localhost:3000" -ForegroundColor Green
Write-Host ""
