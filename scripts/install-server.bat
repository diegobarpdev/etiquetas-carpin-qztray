@echo off
REM Instalador del SERVIDOR etiquetas-colineal (Node + PM2 + firewall + autoarranque)
REM Doble clic; pide permisos de Administrador.

cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Solicitando permisos de Administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo.
echo === Etiquetas Colineal — Instalador SERVIDOR (puerto 3000) ===
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-server.ps1"
set ERR=%ERRORLEVEL%
echo.
if %ERR% neq 0 (
  echo ERROR: la instalacion fallo con codigo %ERR%.
) else (
  echo Listo. Edita .env y luego: pm2 restart etiquetas-colineal --update-env
)
pause
exit /b %ERR%
