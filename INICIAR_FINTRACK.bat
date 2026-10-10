@echo off
title FinTrack AI - Servidor Local
echo ========================================================
echo               FINTRACK AI - INICIANDO APLICACION
echo ========================================================
echo.
set "NODE_DIR=C:\Users\ASUS\.gemini\antigravity\scratch\bin\node-v20.18.0-win-x64"
set "APP_DIR=C:\Users\ASUS\.gemini\antigravity\scratch\fintrack-ai"
set "PATH=%NODE_DIR%;%PATH%"

cd /d "%APP_DIR%"
echo Servidor listo en: http://localhost:3000
echo Abriendo navegador...
start http://localhost:3000/login
echo.
"%NODE_DIR%\node.exe" "%APP_DIR%\node_modules\next\dist\bin\next" start -p 3000
pause
