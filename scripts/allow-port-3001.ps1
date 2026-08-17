#Requires -RunAsAdministrator
$ruleName = "Etiquetas Astro TCP 3001"

$existing = netsh advfirewall firewall show rule name="$ruleName" 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "La regla de firewall ya existe: $ruleName" -ForegroundColor Green
} else {
  netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=3001
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Firewall: puerto 3001 permitido para conexiones entrantes." -ForegroundColor Green
  } else {
    Write-Host "No se pudo crear la regla de firewall." -ForegroundColor Red
    exit 1
  }
}

Write-Host ""
Write-Host "Prueba desde otra PC: http://192.168.2.28:3001 (front)"
Write-Host "API en :3010 (proxy desde el front en /api)"
