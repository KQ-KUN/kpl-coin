@echo off
setlocal
cd /d "%~dp0"
node scripts/build.mjs
if errorlevel 1 goto error
node scripts/serve.mjs --open
goto end
:error
echo Build failed. Please install Node.js 24 or newer and try again.
pause
:end
endlocal
