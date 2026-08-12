@echo off
setlocal
set "APPDIR=%~dp0"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "APPURL=file:///%APPDIR:\=/%index.html"

if exist "%EDGE%" (
  start "" "%EDGE%" --app="%APPURL%"
) else (
  start "" "%APPDIR%index.html"
)
