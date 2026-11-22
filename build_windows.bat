@echo off
REM Builds the Windows installer. Needs: Python 3.11+, Node 18+. Run from the project root.
setlocal
echo === 1/3 Frontend ===
cd frontend && call npm install && call npm run build || goto :fail
cd ..
echo === 2/3 Backend sidecar (PyInstaller) ===
cd backend
python -m pip install -r requirements.txt || goto :fail
python -m PyInstaller --onefile --noconsole --name ytm-backend --collect-submodules uvicorn --collect-submodules app run.py || goto :fail
cd ..
echo === 3/3 Electron installer ===
cd electron && call npm install && call npm run dist || goto :fail
echo.
echo Done. Installer is in electron\dist\
exit /b 0
:fail
echo Build failed.
exit /b 1
