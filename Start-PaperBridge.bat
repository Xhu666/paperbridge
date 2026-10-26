@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-windows.ps1" %*
if errorlevel 1 (
  echo Startup failed. Please keep the error message above.
  pause
)
