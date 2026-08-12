@echo off
setlocal

if defined GRIGLIA_PCP_INSTALL_DIR (
  set "APPDIR=%GRIGLIA_PCP_INSTALL_DIR%"
) else (
  set "APPDIR=%LOCALAPPDATA%\Programs\Griglia PCP"
)

if not exist "%APPDIR%" mkdir "%APPDIR%"
if errorlevel 1 exit /b 1

for %%F in (index.html styles.css app.js launch.cmd uninstall.cmd create-shortcuts.ps1 README-STANDALONE.txt) do (
  copy /Y "%~dp0%%F" "%APPDIR%\%%F" >nul
  if errorlevel 1 exit /b 1
)

if /I "%GRIGLIA_PCP_TEST%"=="1" exit /b 0

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APPDIR%\create-shortcuts.ps1" -AppDir "%APPDIR%"
call "%APPDIR%\launch.cmd"
exit /b 0
