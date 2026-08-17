#Requires -Version 5.1
<#
.SYNOPSIS
  Despliega etiquetas-colineal con Docker Compose (app + PostgreSQL).

.DESCRIPTION
  - Verifica que Docker esté instalado y en ejecución
  - Crea .env si no existe (y opcionalmente PUBLIC_URL para red local)
  - Construye y levanta los contenedores
  - Abre el puerto 3000 en el firewall (requiere admin)
#>
param(
    [switch]$SkipFirewall,
    [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Test-DockerReady {
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $docker) {
        Write-Host "ERROR: Docker no está instalado o no está en el PATH." -ForegroundColor Red
        Write-Host ""
        Write-Host "En Windows Server 2019 instala Docker Desktop o Docker Engine:" -ForegroundColor Yellow
        Write-Host "  https://docs.docker.com/desktop/setup/install/windows-install/" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Tras instalar, reinicia la sesión y vuelve a ejecutar:" -ForegroundColor Yellow
        Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1" -ForegroundColor Cyan
        exit 1
    }

    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Docker está instalado pero el daemon no responde." -ForegroundColor Red
        Write-Host "Inicia Docker Desktop o el servicio Docker y vuelve a intentar." -ForegroundColor Yellow
        exit 1
    }
}

function Ensure-EnvFile {
    $envFile = Join-Path $root ".env"
    $example = Join-Path $root ".env.example"

    if (-not (Test-Path $envFile)) {
        if (Test-Path $example) {
            Copy-Item $example $envFile
            Write-Host "Creado .env desde .env.example" -ForegroundColor Gray
        } else {
            @"
DATABASE_URL="postgresql://colineal:colineal@localhost:5433/etiquetas?schema=public"
PORT=3000
HOST=0.0.0.0
PUBLIC_URL=
"@ | Set-Content -Path $envFile -Encoding UTF8
            Write-Host "Creado .env básico" -ForegroundColor Gray
        }
    }

    & (Join-Path $PSScriptRoot "network-info.ps1")
}

function Invoke-Deploy {
    $args = @("compose", "up", "--build", "-d")
    if ($Rebuild) {
        $args += "--force-recreate"
    }

    Write-Host ""
    Write-Host "=== Construyendo y levantando contenedores ===" -ForegroundColor Cyan
    docker @args
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: docker compose falló." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

function Test-Health {
    Write-Host ""
    Write-Host "Esperando que la app responda en /health..." -ForegroundColor Gray
    $deadline = (Get-Date).AddMinutes(3)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200) {
                Write-Host "OK: aplicación en línea." -ForegroundColor Green
                Write-Host $r.Content
                return
            }
        } catch {
            Start-Sleep -Seconds 3
        }
    }
    Write-Host "AVISO: /health no respondió a tiempo. Revisa logs:" -ForegroundColor Yellow
    Write-Host "  docker compose logs -f app" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=== Deploy etiquetas-colineal ===" -ForegroundColor Cyan
Test-DockerReady
Ensure-EnvFile

if (-not $SkipFirewall) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($isAdmin) {
        & (Join-Path $PSScriptRoot "allow-port-3000.ps1")
    } else {
        Write-Host "Sin permisos de admin: omite regla de firewall. Ejecuta como admin si necesitas acceso desde otra PC." -ForegroundColor Yellow
    }
}

Invoke-Deploy
Test-Health

Write-Host ""
Write-Host "=== Deploy completado ===" -ForegroundColor Green
Write-Host "Local:  http://localhost:3000" -ForegroundColor Green
Write-Host "Logs:   docker compose logs -f app" -ForegroundColor Gray
Write-Host "Parar:  docker compose down" -ForegroundColor Gray
Write-Host ""
