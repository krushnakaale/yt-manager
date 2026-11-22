@echo off
title YT Manager
echo ===================================================
echo Starting YT Manager (Backend + Frontend)...
echo ===================================================

cd /d "%~dp0backend"
start "YT Manager - Backend" cmd /k ".venv\Scripts\python.exe run.py"

cd /d "%~dp0frontend"
start "YT Manager - Frontend" cmd /k "npm run dev"

echo Waiting for servers to initialize...
timeout /t 3 /nobreak >nul

echo Opening browser...
start http://localhost:5173

echo ===================================================
echo YT Manager is running!
echo Frontend: http://localhost:5173
echo Backend:  http://127.0.0.1:8000
echo ===================================================
