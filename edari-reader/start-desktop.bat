@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
    echo Electron غير مثبت. جاري التثبيت...
    call npm install
    if errorlevel 1 (
        echo فشل التثبيت. تأكد من تثبيت Node.js.
        pause
        exit /b 1
    )
)

echo تشغيل Edari Desktop...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
exit /b 0
