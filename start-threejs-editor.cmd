@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "BROWSER=none"
"C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "%~dp0start-threejs-editor.mjs"
if errorlevel 1 (
  echo Launcher failed. See the message above and .nanjing\launcher-vite.stderr.log.
  pause
  exit /b 1
)
