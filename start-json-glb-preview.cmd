@echo off
cd /d "%~dp0"
if not exist "node_modules\.bin\vite.cmd" (
  echo Missing node_modules\.bin\vite.cmd. Please install dependencies first.
  pause
  exit /b 1
)
call ".\node_modules\.bin\vite.cmd" --host 0.0.0.0 --port 5174 --open /preview-json-glb/
