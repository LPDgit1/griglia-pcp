@echo off
setlocal
set "APPDIR=%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APPDIR%create-shortcuts.ps1" -AppDir "%APPDIR%" -Remove
start "" /min cmd.exe /c "timeout /t 2 /nobreak >nul & rmdir /s /q ""%APPDIR%"""
exit /b 0
