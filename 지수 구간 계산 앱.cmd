@echo off
setlocal
set "APP_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%APP_DIR%scripts\launch-app.ps1"
