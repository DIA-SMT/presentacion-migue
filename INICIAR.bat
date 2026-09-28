@echo off
REM Presentacion de Migue: levanta el servidor local y abre la presentacion.
REM El control remoto se abre en el celular con la direccion que muestra esta ventana.
cd /d "%~dp0"
start "Servidor Migue" cmd /k node server.js
timeout /t 2 /nobreak >nul
start "" "http://localhost:8080"
