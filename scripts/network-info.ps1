# Muestra la URL para acceder desde otras PCs en la red local.
$lanIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -notlike '127.*' -and
    $_.IPAddress -notlike '169.254.*' -and
    $_.InterfaceAlias -notmatch 'Docker|vEthernet|WSL|Loopback|Hyper-V'
  } |
  Sort-Object InterfaceMetric |
  Select-Object -First 1 -ExpandProperty IPAddress

if (-not $lanIp) {
  Write-Host "No se encontro una IP de red local. Revisa Wi-Fi o Ethernet." -ForegroundColor Yellow
  exit 1
}

$publicUrl = "http://${lanIp}:3000"
Write-Host ""
Write-Host "=== Acceso desde otra PC ===" -ForegroundColor Cyan
Write-Host "URL: $publicUrl" -ForegroundColor Green
Write-Host ""
Write-Host "Ambas PCs deben estar en la misma red Wi-Fi/LAN." -ForegroundColor Gray
Write-Host "Si no conecta, ejecuta como Administrador:" -ForegroundColor Gray
Write-Host "  npm run network:firewall" -ForegroundColor Yellow
Write-Host ""

$envFile = Join-Path (Join-Path $PSScriptRoot "..") ".env"
$publicLine = "PUBLIC_URL=`"$publicUrl`""

if (Test-Path $envFile) {
  $content = Get-Content $envFile -Raw
  if ($content -match '(?m)^PUBLIC_URL=') {
    $content = $content -replace '(?m)^PUBLIC_URL=.*$', $publicLine
  } else {
    $content = $content.TrimEnd() + "`n$publicLine`n"
  }
  Set-Content -Path $envFile -Value $content -NoNewline
  Write-Host "Actualizado PUBLIC_URL en .env" -ForegroundColor Gray
} else {
  Write-Host "Crea .env con: $publicLine" -ForegroundColor Gray
}

Write-Host ""
