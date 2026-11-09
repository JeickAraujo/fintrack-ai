@echo off
title FinTrack AI - Servidor Local
echo ========================================================
echo               FINTRACK AI - INICIANDO APLICACION
echo ========================================================
echo.

cd /d "%~dp0"
echo Servidor listo en: http://localhost:3000
echo Abriendo navegador...
start http://localhost:3000/login
echo.
npm run start
pause
