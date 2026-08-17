#Requires -RunAsAdministrator
$ruleName = "Etiquetas Colineal TCP 3010"

$existing = netsh advfirewall firewall show rule name="$ruleName" 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "La regla de firewall ya existe: $ruleName" -ForegroundColor Green
} else {
  netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=3010
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Firewall: puerto 3010 permitido para conexiones entrantes." -ForegroundColor Green
  } else {
    Write-Host "No se pudo crear la regla de firewall." -ForegroundColor Red
    exit 1
  }
}

& (Join-Path $PSScriptRoot "network-info.ps1")
