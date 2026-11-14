@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"

if not exist "%BACKEND%\.venv\Scripts\python.exe" (
  echo ERROR: Backend virtual environment is missing.
  echo Run: cd /d "%BACKEND%" ^&^& py -m venv .venv ^&^& .venv\Scripts\python.exe -m pip install -r requirements.txt
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found on PATH. Install Node.js, then retry.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = 5175,8002; $busy = foreach ($port in $ports) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 }; if ($busy) { Write-Host 'ERROR: Port 5175 or 8002 is already in use. Stop the existing development server before starting Polyglot ASR.'; $busy | Format-Table LocalAddress,LocalPort,OwningProcess -AutoSize; exit 1 }"
if errorlevel 1 exit /b 1

start "Polyglot ASR Backend (8002)" cmd /k "cd /d ""%BACKEND%"" ^&^& "".venv\Scripts\python.exe"" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8002"
start "Polyglot ASR Frontend (5175)" cmd /k "cd /d ""%ROOT%"" ^&^& npm run dev"

echo Started backend at http://127.0.0.1:8002 and frontend at http://127.0.0.1:5175.
echo Use Ctrl+C in each named terminal to stop the development servers.
