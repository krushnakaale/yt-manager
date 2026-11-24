@echo off
setlocal
title YT Manager
echo ===================================================
echo Starting YT Manager (Backend + Frontend)...
echo ===================================================

REM Do not silently attach the browser to stale servers on the dev ports.
powershell -NoProfile -Command "$busy = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(8000,5173) }; if ($busy) { $busy | ForEach-Object { Write-Host ('Port ' + $_.LocalPort + ' is already in use (PID ' + $_.OwningProcess + ').') }; exit 1 }"
if errorlevel 1 (
    echo Close the previous YT Manager backend and frontend windows, then run this file again.
    pause
    exit /b 1
)

cd /d "%~dp0backend"
start "YT Manager - Backend" cmd /k ".venv\Scripts\python.exe run.py"

cd /d "%~dp0frontend"
start "YT Manager - Frontend" cmd /k "npm run dev -- --strictPort"

echo Waiting for servers to initialize...
timeout /t 3 /nobreak >nul

echo Opening browser...
start http://localhost:5173

echo ===================================================
echo YT Manager is running!
echo Frontend: http://localhost:5173
echo Backend:  http://127.0.0.1:8000
echo ===================================================
