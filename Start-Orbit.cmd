@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\run-windows.ps1" %*
if errorlevel 1 pause
