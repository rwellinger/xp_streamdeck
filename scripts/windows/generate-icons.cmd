@echo off
rem Runs generate-icons.ps1 without changing the system-wide execution policy.
rem Prefers PowerShell 7 (pwsh); falls back to the built-in Windows PowerShell 5.1.
rem Usage: scripts\windows\generate-icons.cmd [-Clean]
set "PS_EXE=powershell.exe"
where pwsh.exe >nul 2>nul && set "PS_EXE=pwsh.exe"
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0generate-icons.ps1" %*
exit /b %ERRORLEVEL%
