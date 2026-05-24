@echo off
chcp 65001 >nul
cd /d "%~dp0"
set ELECTRON=..\node_modules\electron\dist\electron.exe
if not exist "%ELECTRON%" (
    echo Electron غير مثبت. شغّل npm install من مجلد edari-reader
    pause
    exit /b 1
)
start "" "%ELECTRON%" "%~dp0"
exit /b 0
